import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SHOPPING_COOKIE = "maxtravel-shopping";
export const SHOPPING_LIFETIME_SECONDS = 30 * 60;
const signature = (payload: string, secret: string) => createHmac("sha256", secret).update(`maxtravel-shopping-v1:${payload}`).digest("base64url");
export function issueShoppingToken(secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error("Shopping session is not configured.");
  const payload = `${Math.floor(now / 1000)}.${randomBytes(32).toString("base64url")}`;
  return `${payload}.${signature(payload, secret)}`;
}
export function shoppingIdentity(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token || secret.length < 32 || token.length > 150) return null;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const age = Math.floor(now / 1000) - Number(match[1]);
  if (age < 0 || age >= SHOPPING_LIFETIME_SECONDS) return null;
  const actual = Buffer.from(match[3], "base64url");
  if (actual.toString("base64url") !== match[3]) return null;
  const expected = Buffer.from(signature(`${match[1]}.${match[2]}`, secret), "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return `guest:${createHash("sha256").update(match[2]).digest("hex")}`;
}
/** Renew a verified session without changing its anonymous owner. */
export function renewShoppingToken(token: string, secret: string, now = Date.now()): string {
  if (!shoppingIdentity(token, secret, now)) throw new Error("Shopping session expired.");
  const nonce = token.split(".")[1];
  const payload = `${Math.floor(now / 1000)}.${nonce}`;
  return `${payload}.${signature(payload, secret)}`;
}
export function shoppingCookieToken(header: string | null): string | undefined {
  const matches = (header ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${SHOPPING_COOKIE}=`));
  // Ambiguous duplicate cookies are not usable proof of ownership.
  return matches.length === 1 ? matches[0].slice(SHOPPING_COOKIE.length + 1) : undefined;
}
export function shoppingCookie(token: string, secure: boolean) {
  return `${SHOPPING_COOKIE}=${token}; Path=/api/travel; HttpOnly; SameSite=Lax; Max-Age=${SHOPPING_LIFETIME_SECONDS}${secure ? "; Secure" : ""}`;
}
