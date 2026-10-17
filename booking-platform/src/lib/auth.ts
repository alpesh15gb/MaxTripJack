import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { database } from "./db";
import { HttpError } from "./http";
import { sendAccountMail } from "./mail";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new HttpError(503, "Authentication is not configured.");
  return betterAuth({
    appName: "Max Travel", secret, baseURL, database: database(), trustedOrigins: [new URL(baseURL).origin,"maxtravel://"],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true,revokeSessionsOnPasswordReset:true,
      sendResetPassword: async ({ user, url }) => { await sendAccountMail(user.email, "Reset your Max Travel password", url); } },
    emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => { await sendAccountMail(user.email, "Verify your Max Travel email", url); } },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30, customRules: { "/sign-in/email": { window: 60, max: 5 }, "/sign-up/email": { window: 60, max: 3 },"/request-password-reset":{window:60,max:3},"/two-factor/verify-totp":{window:60,max:5},"/two-factor/verify-backup-code":{window:60,max:5} } },
    plugins: [expo(),twoFactor(), nextCookies()],
    advanced: { useSecureCookies: new URL(baseURL).protocol === "https:" },
  });
}
let singleton: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return singleton ??= createAuth(); }
