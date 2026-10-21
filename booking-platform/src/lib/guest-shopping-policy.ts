import { createHash } from "node:crypto";
import { isIP } from "node:net";
export type ShoppingScope = "search" | "detail" | "catalogue";
/** Opt in only behind a proxy which overwrites the header and denies direct app access. */
export function shoppingPeer(request: Request, trustProxy = false) {
  const value = trustProxy ? request.headers.get("x-forwarded-for")?.trim() : null;
  return value && isIP(value) ? createHash("sha256").update(value).digest("hex") : "shared";
}
export async function enforceShoppingLimits(identity: string, scope: ShoppingScope, peer: string, limit: (id: string, scope: string, max: number) => Promise<void>) {
  const supplier = scope !== "catalogue";
  await limit("public-shopping:global", scope, supplier ? 120 : 600);
  await limit(`public-shopping:peer:${peer}`, scope, supplier ? 30 : 120);
  await limit(identity, `public-shopping:${scope}`, supplier ? 12 : 60);
}
