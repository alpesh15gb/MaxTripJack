import test from "node:test";
import assert from "node:assert/strict";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { checkoutEmailOTP, checkoutTwoFactor } from "../src/lib/checkout-auth";
import { checkoutPhoneOTP, PHONE_CODE_TTL_SECONDS } from "../src/lib/phone-auth";
import { customerEmail, hasVerifiedCustomerIdentity, isInternalPhoneEmail, normalizeWhatsAppPhone } from "../src/lib/customer-identity";
import type { PhoneChallenge, PhoneChallengeStore } from "../src/lib/phone-challenge-store";

const secret = "synthetic-whatsapp-auth-secret-with-no-production-access-2026";
const phone = "+919876543210";
function harness(options: { ready?: boolean; delivery?: "unconfirmed" | "rejected"; limit?: (identifier: string) => Promise<void> } = {}) {
  const records: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], twoFactor: [], rateLimit: [] };
  const messages: { phoneNumber: string; code: string }[] = [];
  const emails: { email: string; code: string }[] = [];
  const challenges = new Map<string, PhoneChallenge & { attempts: number; consumed: boolean }>();
  const store: PhoneChallengeStore = {
    async issue(value) { challenges.set(value.identifier, { ...value, attempts: 0, consumed: false }); },
    async consume(value) {
      const item = challenges.get(value.identifier);
      if (!item || item.expiresAt <= new Date() || item.attempts >= 5 || item.consumed) return false;
      item.attempts++;
      const matches = item.codeHash === value.codeHash && item.purpose === value.purpose && item.binding === value.binding;
      if (matches) item.consumed = true;
      return matches;
    },
    async invalidate(identifier, codeHash) { if (challenges.get(identifier)?.codeHash === codeHash) challenges.delete(identifier); },
  };
  const auth = betterAuth({ secret, baseURL: "https://checkout.example.test", database: memoryAdapter(records),
    trustedOrigins: ["https://checkout.example.test"], emailAndPassword: { enabled: true, minPasswordLength: 12 },
    plugins: [checkoutEmailOTP({ secret, send: (email, code) => emails.push({ email, code }), limitEmail: async () => {} }),
      checkoutPhoneOTP({ secret, ready: () => options.ready !== false, store, limitPhone: options.limit ?? (async () => {}),
        send: async (phoneNumber, code) => { messages.push({ phoneNumber, code }); if (options.delivery) throw Object.assign(Error("Never expose provider content"), { outcome: options.delivery }); },
        linkAccount: async (userId, number) => {
          const user = records.user.find(row => row.id === userId);
          if (!user || user.phoneNumber || !user.emailVerified || records.user.some(row => row.phoneNumber === number)) return false;
          user.phoneNumber = number; user.phoneNumberVerified = true; return true;
        },
      }), checkoutTwoFactor()], rateLimit: { enabled: true, storage: "memory" },
  });
  let ip = 0;
  async function call(path: string, body?: object, cookie = "") {
    return auth.handler(new Request(`https://checkout.example.test/api/auth/${path}`, {
      method: body ? "POST" : "GET", headers: { origin: "https://checkout.example.test", "content-type": "application/json", "x-forwarded-for": `192.0.2.${++ip}`, ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  }
  async function emailSession(email: string) {
    await call("email-otp/send-verification-otp", { email, type: "sign-in" });
    return cookies(await call("sign-in/email-otp", { email, otp: emails.at(-1)!.code }));
  }
  return { auth, call, records, messages, emails, challenges, emailSession };
}
function cookies(response: Response) { return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); }

test("WhatsApp identity normalizes numbers and never treats internal email aliases as verified email", () => {
  assert.equal(normalizeWhatsAppPhone("98765 43210"), phone);
  assert.equal(normalizeWhatsAppPhone("+91 (98765) 43210"), phone);
  assert.equal(normalizeWhatsAppPhone("+1 202-555-0123"), "+12025550123");
  for (const invalid of ["+914321098765", "919876543210", "user@s.whatsapp.net", "+123", "++919876543210", "+919876543210\n", "5555555555"])
    assert.equal(normalizeWhatsAppPhone(invalid), null, invalid);
  assert.equal(customerEmail({ email: "opaque@phone.maxtravel.invalid" }), "");
  assert.equal(hasVerifiedCustomerIdentity({ email: "opaque@phone.maxtravel.invalid", emailVerified: true }), false);
  assert.equal(hasVerifiedCustomerIdentity({ email: "real@example.test", emailVerified: true }), true);
  assert.equal(hasVerifiedCustomerIdentity({ phoneNumber: phone, phoneNumberVerified: true }), true);
  assert.equal(hasVerifiedCustomerIdentity({ phoneNumber: "9876543210", phoneNumberVerified: true }), false);
  assert.equal(hasVerifiedCustomerIdentity(null), false);
});

test("real phone OTP route creates a phone-verified customer, hashes storage, and prevents replay", async () => {
  const h = harness(); const before = Date.now();
  assert.equal((await h.call("phone-number/send-otp", { phoneNumber: "9876543210" })).status, 200);
  const message = h.messages[0]; assert.equal(message.phoneNumber, phone); assert.match(message.code, /^\d{6}$/);
  const stored = [...h.challenges.values()][0];
  assert.match(stored.identifier, /^[a-f0-9]{64}$/); assert.match(stored.codeHash, /^[a-f0-9]{64}$/);
  assert.ok(stored.expiresAt.getTime() <= before + PHONE_CODE_TTL_SECONDS * 1000 + 2000);
  assert.ok(!JSON.stringify([...h.challenges.values()]).includes(phone));
  assert.ok(!JSON.stringify([...h.challenges.values()]).includes(message.code));
  assert.equal(h.records.verification.length, 0, "native plaintext phone-code storage is unused");
  const verified = await h.call("phone-number/verify", { phoneNumber: phone, code: message.code });
  assert.equal(verified.status, 200, await verified.clone().text());
  const session = await (await h.call("get-session", undefined, cookies(verified))).json();
  assert.equal(session.user.phoneNumber, phone); assert.equal(session.user.phoneNumberVerified, true);
  assert.equal(session.user.emailVerified, false); assert.equal(isInternalPhoneEmail(session.user.email), true);
  assert.equal(hasVerifiedCustomerIdentity(session.user), true); assert.equal(customerEmail(session.user), "");
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code: message.code })).status, 400);
  assert.equal(h.records.user.length, 1); assert.equal(h.records.session.length, 1);
});

test("wrong, expired and superseded codes cannot sign in, and simultaneous consumption succeeds only once", async () => {
  const h = harness();
  await h.call("phone-number/send-otp", { phoneNumber: phone });
  const oldCode = h.messages[0].code;
  const wrong = oldCode === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code: wrong })).status, 400);
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code: oldCode })).status, 400);
  await h.call("phone-number/send-otp", { phoneNumber: phone });
  for (const item of h.challenges.values()) item.expiresAt = new Date(Date.now() - 1);
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code: h.messages.at(-1)!.code })).status, 400);
  await h.call("phone-number/send-otp", { phoneNumber: phone });
  const fresh = h.messages.at(-1)!.code;
  if (fresh !== oldCode) assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code: oldCode })).status, 400);
  const results = await Promise.all([h.call("phone-number/verify", { phoneNumber: phone, code: fresh }), h.call("phone-number/verify", { phoneNumber: phone, code: fresh })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]); assert.equal(h.records.session.length, 1);
});

test("phone request limit is normalized, private and shared across sign-in and linking", async () => {
  const seen = new Set<string>();
  const h = harness({ limit: async id => { if (seen.has(id)) throw Object.assign(Error("quota"), { status: 429 }); seen.add(id); } });
  assert.equal((await h.call("phone-number/send-otp", { phoneNumber: "9876543210" })).status, 200);
  assert.equal((await h.call("phone-number/send-otp", { phoneNumber: phone, purpose: "link" })).status, 429);
  assert.equal(h.messages.length, 1); assert.match([...seen][0], /^[a-f0-9]{64}$/);
});

test("unavailable or rejected delivery cannot verify; lost delivery acknowledgement leaves the requested code usable", async () => {
  for (const options of [{ ready: false }, { delivery: "rejected" as const }]) {
    const h = harness(options);
    const result = await h.call("phone-number/send-otp", { phoneNumber: phone });
    assert.equal(result.status, 503); assert.equal(h.challenges.size, 0); assert.equal(h.records.session.length, 0);
    assert.doesNotMatch(await result.text(), /provider content/);
  }
  const h = harness({ delivery: "unconfirmed" });
  const response = await h.call("phone-number/send-otp", { phoneNumber: phone });
  assert.equal(response.status, 200); assert.equal((await response.json()).delivery, "unconfirmed");
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code: h.messages[0].code })).status, 200);
});

test("phone OTP cannot bypass native MFA and issues no usable session until the authenticator succeeds", async () => {
  const h = harness(); const context = await h.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Protected", email: "protected@example.test", emailVerified: true, phoneNumber: phone, phoneNumberVerified: true, twoFactorEnabled: true }, { method: "phone-number" });
  const authenticatorSecret = "synthetic-authenticator-secret-for-whatsapp-only";
  await context.adapter.create({ model: "twoFactor", data: { userId: user.id, verified: true, secret: await symmetricEncrypt({ key: secret, data: authenticatorSecret }), backupCodes: await symmetricEncrypt({ key: secret, data: JSON.stringify(["synthetic-backup"]) }) } });
  await h.call("phone-number/send-otp", { phoneNumber: phone });
  const first = await h.call("phone-number/verify", { phoneNumber: phone, code: h.messages[0].code });
  const result = await first.json(); assert.equal(result.twoFactorRedirect, true); assert.equal(result.token, undefined);
  assert.equal(h.records.session.length, 0);
  assert.equal(await (await h.call("get-session", undefined, cookies(first))).json(), null);
  const second = await h.call("two-factor/verify-totp", { code: await createOTP(authenticatorSecret).totp() }, cookies(first));
  assert.equal(second.status, 200, await second.clone().text());
  assert.equal((await (await h.call("get-session", undefined, cookies(second))).json()).user.id, user.id);
});

test("explicit linking proves the existing email account and phone, then either channel opens the same account", async () => {
  const h = harness(); const cookie = await h.emailSession("owner@example.test"); const id = h.records.user[0].id;
  assert.equal((await h.call("phone-number/send-otp", { phoneNumber: phone, purpose: "link" }, cookie)).status, 200);
  const linked = await h.call("phone-number/verify", { phoneNumber: phone, code: h.messages[0].code, updatePhoneNumber: true }, cookie);
  assert.equal(linked.status, 200, await linked.clone().text());
  assert.equal(h.records.session.length, 1, "linking cannot issue an additional session");
  assert.equal((await (await h.call("get-session", undefined, cookie)).json()).user.phoneNumberVerified, true);
  await h.call("phone-number/send-otp", { phoneNumber: phone });
  const signed = await h.call("phone-number/verify", { phoneNumber: phone, code: h.messages.at(-1)!.code });
  assert.equal((await signed.json()).user.id, id); assert.equal(h.records.user.length, 1);
  assert.equal((await h.call("phone-number/send-otp", { phoneNumber: "+919876543211", purpose: "link" }, cookie)).status, 400);
});

test("link codes cannot sign in, cross accounts, replace a claimed phone, or succeed without a verified email session", async () => {
  const h = harness();
  assert.equal((await h.call("phone-number/send-otp", { phoneNumber: phone, purpose: "link" })).status, 401);
  const a = await h.emailSession("a@example.test"), b = await h.emailSession("b@example.test");
  await h.call("phone-number/send-otp", { phoneNumber: phone, purpose: "link" }, a);
  const code = h.messages[0].code;
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code })).status, 400);
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code, updatePhoneNumber: true }, b)).status, 400);
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code, updatePhoneNumber: true }, a)).status, 200);
  const claimedSend = await h.call("phone-number/send-otp", { phoneNumber: phone, purpose: "link" }, b);
  assert.equal(claimedSend.status, 200, "a request must not disclose another account's phone claim");
  assert.deepEqual(await claimedSend.json(), { status: true });
  const claimedCode = h.messages.at(-1)!.code;
  const wrong = claimedCode === "000000" ? "111111" : "000000";
  const invalidClaimed = await h.call("phone-number/verify", { phoneNumber: phone, code: wrong, updatePhoneNumber: true }, b);
  const invalidUnclaimed = await h.call("phone-number/verify", { phoneNumber: "+919876543212", code: wrong, updatePhoneNumber: true }, b);
  assert.equal(invalidClaimed.status, 400); assert.equal(invalidUnclaimed.status, 400);
  assert.deepEqual(await invalidClaimed.json(), await invalidUnclaimed.json(), "ownership is not disclosed before OTP proof");
  assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code: claimedCode, updatePhoneNumber: true }, b)).status, 400);
  assert.equal(h.records.user.find(user => user.email === "b@example.test")?.phoneNumber, null);
});

test("concurrent links of different numbers cannot overwrite an account's first verified phone", async () => {
  const h = harness(); const cookie = await h.emailSession("race@example.test");
  const secondPhone = "+919876543211";
  await h.call("phone-number/send-otp", { phoneNumber: phone, purpose: "link" }, cookie);
  await h.call("phone-number/send-otp", { phoneNumber: secondPhone, purpose: "link" }, cookie);
  const results = await Promise.all(h.messages.map(message => h.call("phone-number/verify", { ...message, code: message.code, updatePhoneNumber: true }, cookie)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]); assert.equal(h.records.session.length, 1);
  assert.ok([phone, secondPhone].includes(String(h.records.user[0].phoneNumber)));
});

test("public signup cannot claim a phone and unsafe phone endpoints, flags and internal-email requests are rejected", async () => {
  const h = harness();
  const signup = await h.call("sign-up/email", { name: "Signup", email: "signup@example.test", password: "SyntheticPasswordOnly123!", phoneNumber: phone, phoneNumberVerified: true });
  assert.equal(signup.status, 200, await signup.clone().text()); assert.equal(h.records.user[0].phoneNumber, null); assert.equal(h.records.user[0].phoneNumberVerified, false);
  assert.equal((await h.call("phone-number/send-otp", { phoneNumber: phone, purpose: "link" }, cookies(signup))).status, 401, "an unverified email session cannot link a phone");
  await h.call("phone-number/send-otp", { phoneNumber: phone }); const code = h.messages[0].code;
  for (const extra of [{ disableSession: true }, { disableSession: false }, { role: "admin" }, { email: "victim@example.test" }, { updatePhoneNumber: false }])
    assert.equal((await h.call("phone-number/verify", { phoneNumber: phone, code, ...extra })).status, 400);
  for (const path of ["sign-in/phone-number", "phone-number/request-password-reset", "phone-number/reset-password"])
    assert.equal((await h.call(path, { phoneNumber: phone, code })).status, 404);
  for (const path of ["sign-up/email", "email-otp/send-verification-otp", "sign-in/email-otp", "request-password-reset"])
    assert.equal((await h.call(path, { name: "Alias", email: "opaque@phone.maxtravel.invalid", password: "SyntheticPasswordOnly123!", type: "sign-in", otp: code })).status, 400, path);
  assert.equal(h.emails.length, 0);
});
