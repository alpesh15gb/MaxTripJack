import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { database } from "./db";
import { HttpError } from "./http";
import { sendAccountMail } from "./mail";
import { after } from "next/server";
import { createAccountMailDispatcher } from "./account-mail-dispatch";
import { authTrustedOrigins } from "./auth-origin";

const dispatchAccountMail = createAccountMailDispatcher({
  schedule: after, send: sendAccountMail,
  report: (kind, outcome) => {
    // Fixed vocabulary only: never log recipient, URL, token, or transport error.
    if (outcome === "delivery-unconfirmed") console.error("Account mail", { kind, outcome });
    else console.info("Account mail", { kind, outcome });
  },
});

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new HttpError(503, "Account access is temporarily unavailable. Please try again later.");
  return betterAuth({
    appName: "Max Travel", secret, baseURL, database: database(), trustedOrigins: authTrustedOrigins(baseURL),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true,revokeSessionsOnPasswordReset:true,
      sendResetPassword: async ({ user, url }) => { dispatchAccountMail("reset", user.email, url); } },
    emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => { dispatchAccountMail("verification", user.email, url); } },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30, customRules: { "/sign-in/email": { window: 60, max: 5 }, "/sign-up/email": { window: 60, max: 3 },"/request-password-reset":{window:60,max:3},"/two-factor/verify-totp":{window:60,max:5},"/two-factor/verify-backup-code":{window:60,max:5} } },
    plugins: [expo(),twoFactor(), nextCookies()],
    advanced: { useSecureCookies: new URL(baseURL).protocol === "https:" },
  });
}
let singleton: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return singleton ??= createAuth(); }
