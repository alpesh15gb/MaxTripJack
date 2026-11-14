import { createHmac, randomInt } from "node:crypto";
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import type { GenericEndpointContext } from "@better-auth/core";
import { z } from "zod";
import { customerEmail, isInternalPhoneEmail, normalizeWhatsAppPhone } from "./customer-identity";
import type { PhoneChallengeStore } from "./phone-challenge-store";

export const PHONE_CODE_TTL_SECONDS = 300;
const sendSchema = z.object({ phoneNumber: z.string().max(40), purpose: z.enum(["signin", "link"]).default("signin") }).strict();
const verifySchema = z.object({ phoneNumber: z.string().max(40), code: z.string().regex(/^\d{6}$/), updatePhoneNumber: z.literal(true).optional() }).strict();

export function checkoutPhoneSchema() {
  const base = phoneNumber({ sendOTP: async () => {} }).schema;
  return { user: { fields: {
    ...base.user.fields,
    phoneNumber: { ...base.user.fields.phoneNumber, input: false as const, defaultValue: null },
    phoneNumberVerified: { ...base.user.fields.phoneNumberVerified, input: false as const, defaultValue: false },
  } } };
}

export function checkoutPhoneOTP(options: {
  secret: string;
  ready: () => boolean;
  send: (phoneNumber: string, code: string) => Promise<void>;
  limitPhone: (identifier: string) => Promise<void>;
  store: PhoneChallengeStore;
  linkAccount: (userId: string, phoneNumber: string) => Promise<boolean>;
}) {
  const digest = (value: string) => createHmac("sha256", options.secret).update(value).digest("hex");
  const identifierFor = (phone: string) => digest(`whatsapp-code:${phone}`);
  const codeHash = (identifier: string, purpose: string, binding: string | null, code: string) => digest(`${identifier}:${purpose}:${binding ?? ""}:${code}`);
  async function linkBinding(ctx: GenericEndpointContext) {
    const session = await getSessionFromCtx(ctx);
    if (!session || !session.user.emailVerified || !customerEmail(session.user))
      throw new APIError("UNAUTHORIZED", { message: "Sign in with your verified email before connecting WhatsApp." });
    const user = session.user as typeof session.user & { phoneNumber?: string | null };
    if (user.phoneNumber)
      throw new APIError("BAD_REQUEST", { message: "Your account already has a WhatsApp number. Contact support to change it." });
    return { binding: digest(`whatsapp-link:${session.user.id}`), userId: session.user.id };
  }
  const plugin = phoneNumber({
    otpLength: 6, expiresIn: PHONE_CODE_TTL_SECONDS, allowedAttempts: 5,
    // The native sender persists plaintext codes; it is never exposed or called.
    sendOTP: async () => { throw new APIError("NOT_FOUND"); },
    phoneNumberValidator: phone => normalizeWhatsAppPhone(phone) === phone,
    signUpOnVerification: {
      getTempEmail: phone => `${digest(`phone-account:${phone}`)}@phone.maxtravel.invalid`,
      getTempName: () => "Traveller",
    },
    verifyOTP: async ({ phoneNumber: phone, code }, ctx) => {
      if (!ctx) return false;
      // Linking is handled by the atomic account claim in the before hook.
      if (ctx.body?.updatePhoneNumber) return false;
      const purpose = "signin";
      const binding = null;
      const identifier = identifierFor(phone);
      return options.store.consume({ identifier, codeHash: codeHash(identifier, purpose, binding, code), purpose, binding });
    },
  });
  const sendPhoneNumberOTP = createAuthEndpoint("/phone-number/send-otp", {
    method: "POST", body: sendSchema,
  }, async ctx => {
    const phone = normalizeWhatsAppPhone(ctx.body.phoneNumber);
    if (!phone) throw new APIError("BAD_REQUEST", { message: "Enter a valid WhatsApp number with its country code." });
    if (!options.ready()) throw new APIError("SERVICE_UNAVAILABLE", { message: "WhatsApp verification is temporarily unavailable. Use email or try again later." });
    const identifier = identifierFor(phone);
    try { await options.limitPhone(identifier); }
    catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 429)
        throw new APIError("TOO_MANY_REQUESTS", { message: "Please wait a minute before requesting another code." });
      throw new APIError("SERVICE_UNAVAILABLE", { message: "Verification is temporarily unavailable. Use email or try again later." });
    }
    const purpose = ctx.body.purpose;
    const binding = purpose === "link" ? (await linkBinding(ctx)).binding : null;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const hash = codeHash(identifier, purpose, binding, code);
    await options.store.issue({ identifier, codeHash: hash, purpose, binding, expiresAt: new Date(Date.now() + PHONE_CODE_TTL_SECONDS * 1000) });
    try { await options.send(phone, code); }
    catch (error) {
      // An acknowledgement can be lost after delivery. Keep the code usable and
      // let the customer enter it; never blindly send a second WhatsApp message.
      if (error && typeof error === "object" && "outcome" in error && error.outcome === "unconfirmed")
        return ctx.json({ status: true, delivery: "unconfirmed" as const });
      await options.store.invalidate(identifier, hash);
      throw new APIError("SERVICE_UNAVAILABLE", { message: "WhatsApp verification is temporarily unavailable. Use email or try again later." });
    }
    return ctx.json({ status: true });
  });
  return {
    ...plugin,
    schema: checkoutPhoneSchema(),
    endpoints: { sendPhoneNumberOTP, verifyPhoneNumber: plugin.endpoints.verifyPhoneNumber },
    hooks: { before: [...plugin.hooks.before, {
      matcher: (ctx: { path?: string }) => ctx.path === "/phone-number/verify",
      handler: createAuthMiddleware(async ctx => {
        const parsed = verifySchema.safeParse(ctx.body);
        if (!parsed.success) throw new APIError("BAD_REQUEST", { message: "Invalid verification request." });
        const phone = normalizeWhatsAppPhone(parsed.data.phoneNumber);
        if (!phone) throw new APIError("BAD_REQUEST", { message: "Enter a valid WhatsApp number with its country code." });
        ctx.body = { ...parsed.data, phoneNumber: phone };
        if (parsed.data.updatePhoneNumber) {
          const { binding, userId } = await linkBinding(ctx);
          const identifier = identifierFor(phone);
          const valid = await options.store.consume({ identifier, codeHash: codeHash(identifier, "link", binding, parsed.data.code), purpose: "link", binding });
          if (!valid) throw new APIError("BAD_REQUEST", { message: "The code is invalid or expired. Request a new code after the waiting period." });
          // Only possession of the valid code may reveal a competing phone
          // claim. Send and invalid-code responses never look up that owner.
          if (!await options.linkAccount(userId, phone))
            throw new APIError("BAD_REQUEST", { message: "This number could not be connected. Check your account or contact support." });
          // Native linking updates unconditionally. Returning here keeps the
          // compare-and-set claim authoritative and cannot create a new session.
          return ctx.json({ status: true });
        } else {
          const owner = await ctx.context.adapter.findOne<{ phoneNumberVerified?: boolean }>({ model: "user", where: [{ field: "phoneNumber", value: phone }] });
          if (owner && owner.phoneNumberVerified !== true)
            throw new APIError("BAD_REQUEST", { message: "This number cannot be used for sign-in. Use email or contact support." });
        }
      }),
    }, {
      matcher: (ctx: { path?: string }) => ["/sign-up/email", "/sign-in/email", "/sign-in/email-otp", "/email-otp/send-verification-otp", "/request-password-reset", "/send-verification-email", "/change-email"].includes(ctx.path ?? ""),
      handler: createAuthMiddleware(async ctx => {
        if (isInternalPhoneEmail(ctx.body?.email) || isInternalPhoneEmail(ctx.body?.newEmail))
          throw new APIError("BAD_REQUEST", { message: "Use your WhatsApp number or a real email address." });
      }),
    }] },
  };
}
