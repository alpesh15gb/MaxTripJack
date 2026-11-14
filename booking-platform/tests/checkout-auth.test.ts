import test from "node:test";
import assert from "node:assert/strict";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { checkoutEmailOTP, checkoutTwoFactor, CHECKOUT_CODE_TTL_SECONDS } from "../src/lib/checkout-auth";

const secret = "synthetic-checkout-auth-secret-with-no-production-access-2026";
function harness(limitEmail: (identifier: string) => Promise<void> = async () => {}) {
  const records: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], twoFactor: [], rateLimit: [] };
  const messages: { email: string; code: string }[] = [];
  const auth = betterAuth({
    secret, baseURL: "https://checkout.example.test", database: memoryAdapter(records),
    trustedOrigins: ["https://checkout.example.test"],
    plugins: [checkoutEmailOTP({ secret, send: (email, code) => messages.push({ email, code }), limitEmail }), checkoutTwoFactor()],
    rateLimit: { enabled: true, storage: "memory" },
  });
  let ip = 0;
  async function call(path: string, body?: object, cookie = "") {
    return auth.handler(new Request(`https://checkout.example.test/api/auth/${path}`, {
      method: body ? "POST" : "GET",
      headers: { origin: "https://checkout.example.test", "content-type": "application/json", "x-forwarded-for": `192.0.2.${++ip}`, ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  }
  return { auth, records, messages, call };
}
function cookies(response: Response) { return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); }

test("email code creates a verified customer session, hashes storage, and cannot be replayed", async () => {
  const { call, records, messages } = harness();
  const email = "traveller@example.test";
  const before = Date.now();
  assert.equal((await call("email-otp/send-verification-otp", { email, type: "sign-in" })).status, 200);
  assert.equal(messages.length, 1);
  assert.match(messages[0].code, /^\d{6}$/);
  assert.ok(records.verification.length);
  assert.ok(!JSON.stringify(records.verification).includes(messages[0].code), "OTP is never persisted in plaintext");
  assert.ok(new Date(String(records.verification[0].expiresAt)).getTime() <= before + CHECKOUT_CODE_TTL_SECONDS * 1000 + 2000);
  const signedIn = await call("sign-in/email-otp", { email, otp: messages[0].code, twoFactorEnabled: true, role: "admin" });
  assert.equal(signedIn.status, 200, await signedIn.clone().text());
  const result = await signedIn.json();
  assert.equal(result.user.emailVerified, true);
  assert.ok(!result.user.twoFactorEnabled);
  assert.equal(result.user.role, undefined);
  const session = await call("get-session", undefined, cookies(signedIn));
  assert.equal((await session.json()).user.email, email);
  assert.equal((await call("sign-in/email-otp", { email, otp: messages[0].code })).status, 400);
});

test("incorrect and expired email codes cannot establish a session", async () => {
  const { call, records, messages } = harness();
  const email = "attempts@example.test";
  await call("email-otp/send-verification-otp", { email, type: "sign-in" });
  const wrong = messages[0].code === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await call("sign-in/email-otp", { email, otp: wrong })).status, 400);
  assert.equal((await call("sign-in/email-otp", { email, otp: messages[0].code })).status, 403);
  assert.equal(records.session.length, 0);
  const expiredEmail = "expired@example.test";
  await call("email-otp/send-verification-otp", { email: expiredEmail, type: "sign-in" });
  for (const value of records.verification) value.expiresAt = new Date(Date.now() - 1000);
  assert.equal((await call("sign-in/email-otp", { email: expiredEmail, otp: messages.at(-1)!.code })).status, 400);
  assert.equal(records.session.length, 0);
});

test("new email code invalidates the previous one and only sign-in endpoints are exposed", async () => {
  const { call, messages } = harness();
  const email = "resend@example.test";
  await call("email-otp/send-verification-otp", { email, type: "sign-in" });
  const first = messages.at(-1)!.code;
  await call("email-otp/send-verification-otp", { email, type: "sign-in" });
  const latest = messages.at(-1)!.code;
  if (first !== latest) assert.equal((await call("sign-in/email-otp", { email, otp: first })).status, 400);
  assert.equal((await call("sign-in/email-otp", { email, otp: latest })).status, 200);
  assert.equal((await call("email-otp/send-verification-otp", { email, type: "email-verification" })).status, 400);
  for (const path of ["email-otp/verify-email", "email-otp/check-verification-otp", "email-otp/request-password-reset", "email-otp/reset-password", "email-otp/get-verification-otp"]) {
    const result = await call(path, { email, otp: latest });
    assert.equal(result.status, 404, path);
  }
});

test("email-specific send limit uses a private identifier and rejects before sending", async () => {
  const identities: string[] = [];
  const { call, messages } = harness(async identifier => {
    if (identities.includes(identifier)) throw Object.assign(Error("synthetic quota"), { status: 429 });
    identities.push(identifier);
  });
  assert.equal((await call("email-otp/send-verification-otp", { email: "Person@Example.test", type: "sign-in" })).status, 200);
  assert.equal((await call("email-otp/send-verification-otp", { email: "person@example.test", type: "sign-in" })).status, 429);
  assert.equal(messages.length, 1);
  assert.match(identities[0], /^[0-9a-f]{64}$/);
});

test("an email code cannot bypass an existing authenticator: no session until TOTP succeeds", async () => {
  const { auth, call, records, messages } = harness();
  const context = await auth.$context;
  const email = "protected@example.test";
  const user = await context.internalAdapter.createUser({ name: "Protected traveller", email, emailVerified: true, twoFactorEnabled: true }, { method: "email-otp" });
  const authenticatorSecret = "synthetic-authenticator-secret-for-test-only";
  await context.adapter.create({ model: "twoFactor", data: {
    userId: user.id, verified: true,
    secret: await symmetricEncrypt({ key: secret, data: authenticatorSecret }),
    backupCodes: await symmetricEncrypt({ key: secret, data: JSON.stringify(["synthetic-recovery"]) }),
  } });
  await call("email-otp/send-verification-otp", { email, type: "sign-in" });
  const firstFactor = await call("sign-in/email-otp", { email, otp: messages[0].code });
  assert.equal(firstFactor.status, 200, await firstFactor.clone().text());
  const pending = await firstFactor.json();
  assert.equal(pending.twoFactorRedirect, true);
  assert.equal(pending.token, undefined);
  assert.deepEqual(pending.twoFactorMethods, ["totp"]);
  assert.equal(records.session.length, 0, "first-factor session is revoked by native MFA hook");
  const challengeCookie = cookies(firstFactor);
  assert.equal(await (await call("get-session", undefined, challengeCookie)).json(), null);
  const secondFactor = await call("two-factor/verify-totp", { code: await createOTP(authenticatorSecret).totp() }, challengeCookie);
  assert.equal(secondFactor.status, 200, await secondFactor.clone().text());
  const session = await (await call("get-session", undefined, cookies(secondFactor))).json();
  assert.equal(session.user.id, user.id);
  assert.equal(session.user.twoFactorEnabled, true);
});
