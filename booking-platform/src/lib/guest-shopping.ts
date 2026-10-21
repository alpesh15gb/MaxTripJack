import "server-only";
import { claimShoppingSearch } from "./guest-search-claim";
import { principal } from "./access";
import { database } from "./db";
import { HttpError } from "./http";
import { requestLimit } from "./request-limit";
import type { Actor } from "./supplier-flow";
import { issueShoppingToken, renewShoppingToken, shoppingIdentity, shoppingCookieToken, shoppingCookie } from "./guest-shopping-identity";

import { enforceShoppingLimits, shoppingPeer, type ShoppingScope } from "./guest-shopping-policy";
export type ShoppingAccess = { actor: Actor; cookie?: string };
function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) throw new HttpError(503, "Shopping access is not configured.");
  return value;
}
export async function shoppingAccess(request: Request, scope: ShoppingScope): Promise<ShoppingAccess> {
  try { return { actor: await principal(request) }; }
  catch (error) {
    // Suspended, unverified and restricted corporate sessions do not become guests.
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
  }
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(process.env.BETTER_AUTH_URL!).origin)) throw new HttpError(403, "Request origin rejected.");
  const key = secret();
  const existing = shoppingCookieToken(request.headers.get("cookie"));
  let identity = shoppingIdentity(existing, key);
  const token = identity ? (scope === "search" ? renewShoppingToken(existing!, key) : existing!) : issueShoppingToken(key);
  identity ??= shoppingIdentity(token, key)!;
  // Shared DB buckets fail closed across restarts. Cookie rotation cannot bypass
  // the peer/global ceilings; forwarded IP is ignored unless explicitly trusted.
  await enforceShoppingLimits(identity, scope, shoppingPeer(request, process.env.PUBLIC_SHOPPING_TRUST_PROXY === "true"), requestLimit);
  return { actor: { userId: identity, companyId: null }, ...(scope === "search" ? { cookie: shoppingCookie(token, process.env.NODE_ENV === "production" || new URL(process.env.BETTER_AUTH_URL!).protocol === "https:") } : {}) };
}
export function shoppingResponse(response: Response, access: ShoppingAccess) {
  if (access.cookie) response.headers.append("Set-Cookie", access.cookie);
  return response;
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
