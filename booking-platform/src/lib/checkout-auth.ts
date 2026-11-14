import { createHmac } from "node:crypto";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, twoFactor } from "better-auth/plugins";

export const CHECKOUT_CODE_TTL_SECONDS = 300;
export const CHECKOUT_CODE_ATTEMPTS = 5;

/** Keep the library's complete MFA challenge/session handling for passwordless sign-in. */
export function checkoutTwoFactor() {
  const plugin = twoFactor();
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: plugin.hooks.after.map(hook => ({
        ...hook,
        matcher: (context: Parameters<typeof hook.matcher>[0]) =>
          context.path === "/sign-in/email-otp" || context.path === "/phone-number/verify" || hook.matcher(context),
      })),
    },
  };
}

export function checkoutEmailOTP(options: {
  secret: string;
  send: (email: string, code: string) => void;
  limitEmail: (identifier: string) => Promise<void>;
}) {
  const plugin = emailOTP({
    otpLength: 6,
    expiresIn: CHECKOUT_CODE_TTL_SECONDS,
    allowedAttempts: CHECKOUT_CODE_ATTEMPTS,
    disableSignUp: false,
    // A keyed hash also protects low-entropy codes if the verification table leaks.
    storeOTP: { hash: async code => createHmac("sha256", options.secret).update(code).digest("hex") },
    resendStrategy: "rotate",
    rateLimit: { window: 60, max: 5 },
    sendVerificationOTP: async ({ email, otp, type }) => {
      if (type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "This verification request is not supported." });
      options.send(email, otp);
    },
  });
  return {
    ...plugin,
    // Checkout needs sign-in only. Do not expose extra password-reset, email-change,
    // or verify-email endpoints that could create a different authentication path.
    endpoints: {
      sendVerificationOTP: plugin.endpoints.sendVerificationOTP,
      signInEmailOTP: plugin.endpoints.signInEmailOTP,
    },
    hooks: {
      before: [{
        matcher: (context: { path?: string }) => context.path === "/email-otp/send-verification-otp",
        handler: createAuthMiddleware(async ctx => {
          if (ctx.body?.type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "This verification request is not supported." });
          const email = typeof ctx.body.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
          if (!email || email.length > 254) throw new APIError("BAD_REQUEST", { message: "Enter a valid email address." });
          ctx.body.email = email;
          const identifier = createHmac("sha256", options.secret).update(`checkout-code:${email}`).digest("hex");
          try { await options.limitEmail(identifier); }
          catch (error) {
            if (error && typeof error === "object" && "status" in error && error.status === 429)
              throw new APIError("TOO_MANY_REQUESTS", { message: "Please wait a minute before requesting another code." });
            throw new APIError("SERVICE_UNAVAILABLE", { message: "Verification is temporarily unavailable. Please try again." });
          }
        }),
      }],
    },
  };
}
