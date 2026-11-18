import "server-only";
import { claimShoppingSearch } from "./guest-search-claim";
import { principal } from "./access";
import { database } from "./db";
import { HttpError } from "./http";
import { configuredAuthBaseURL } from "./auth-origin";
import { requestLimit } from "./request-limit";
import type { Actor } from "./supplier-flow";
import { issueShoppingToken, renewShoppingToken, shoppingIdentity, shoppingCookieToken, shoppingCookie, legacyShoppingCookieExpiry } from "./guest-shopping-identity";

import { enforceShoppingLimits, shoppingPeer, type ShoppingScope } from "./guest-shopping-policy";
export type ShoppingAccess = { actor: Actor; cookie?: string; secure?: boolean; user?: { id: string; email?: string | null; emailVerified?: boolean | null } };
function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) throw new HttpError(503, "Search is temporarily unavailable. Please try again later.");
  return value;
}
export async function shoppingAccess(request: Request, scope: ShoppingScope): Promise<ShoppingAccess> {
  try { return { actor: await principal(request) }; }
  catch (error) {
    // Suspended, unverified and restricted corporate sessions do not become guests.
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
  }
  const configured = configuredAuthBaseURL();
  if (!configured) throw new HttpError(503, "The service is temporarily unavailable. Please try again later.");
  const site = new URL(configured);
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== site.origin)) throw new HttpError(403, "Request origin rejected.");
  const key = secret();
  const existing = shoppingCookieToken(request.headers.get("cookie"));
  let identity = shoppingIdentity(existing, key);
  const token = identity ? (scope === "search" ? renewShoppingToken(existing!, key) : existing!) : issueShoppingToken(key);
  identity ??= shoppingIdentity(token, key)!;
  // Shared DB buckets fail closed across restarts. Cookie rotation cannot bypass
  // the peer/global ceilings; forwarded IP is ignored unless explicitly trusted.
  await enforceShoppingLimits(identity, scope, shoppingPeer(request, process.env.PUBLIC_SHOPPING_TRUST_PROXY === "true"), requestLimit);
  const secure = process.env.NODE_ENV === "production" || site.protocol === "https:";
  return { actor: { userId: identity, companyId: null }, secure, ...(scope === "search" ? { cookie: shoppingCookie(token, secure) } : {}) };
}
export function shoppingResponse(response: Response, access: ShoppingAccess) {
  if (access.cookie) {
    response.headers.append("Set-Cookie", access.cookie);
    response.headers.append("Set-Cookie", legacyShoppingCookieExpiry(access.secure ?? access.cookie.includes("; Secure")));
  }
  return response;
}

/** Review, extras, promo, payment and booking-status access for checkout.
 * A verified account is used when present. Otherwise the visitor continues as the
 * same anonymous shopping identity that ran the search (guest checkout): it can
 * only reach records it created, and is never issued here, only renewed.
 * Suspended, unverified or restricted corporate sessions never fall back. */
export async function checkoutAccess(request: Request): Promise<ShoppingAccess> {
  try { const actor = await principal(request); return { actor: { userId: actor.userId, companyId: actor.companyId }, user: actor.session.user }; }
  catch (error) { if (!(error instanceof HttpError) || error.status !== 401) throw error; }
  if (process.env.GUEST_CHECKOUT_ENABLED === "false") throw new HttpError(401, "Sign in to continue.");
  const configured = configuredAuthBaseURL();
  if (!configured) throw new HttpError(503, "The service is temporarily unavailable. Please try again later.");
  const site = new URL(configured);
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== site.origin)) throw new HttpError(403, "Request origin rejected.");
  const key = secret();
  const existing = shoppingCookieToken(request.headers.get("cookie"));
  const identity = shoppingIdentity(existing, key);
  if (!identity) throw new HttpError(401, "Your guest session has expired. Search again, or sign in to continue.");
  const peer = shoppingPeer(request, process.env.PUBLIC_SHOPPING_TRUST_PROXY === "true");
  await requestLimit("guest-checkout:global", "guest-checkout", 600);
  await requestLimit(`guest-checkout:peer:${peer}`, "guest-checkout", 120);
  await requestLimit(identity, "guest-checkout", 60);
  const secure = process.env.NODE_ENV === "production" || site.protocol === "https:";
  return { actor: { userId: identity, companyId: null }, secure, cookie: shoppingCookie(renewShoppingToken(existing!, key), secure) };
}
/** Only authenticated review calls this after sameOrigin. A guest cookie proves
 * control of this single anonymous search, not any account or private booking.
 * The atomic predicate prevents races from transferring an already-owned search.
 * reviewSupplier recalculates pricing for the authenticated actor afterwards. */
export async function claimGuestSearch(request: Request, searchId: string, actor: Actor) {
  if (actor.userId.startsWith("guest:")) throw new HttpError(401, "Sign in to continue.");
  const token = shoppingCookieToken(request.headers.get("cookie"));
  if (!token) return;
  const identity = shoppingIdentity(token, secret());
  if (!identity) return;
  await claimShoppingSearch(database(), searchId, identity, actor);
}
