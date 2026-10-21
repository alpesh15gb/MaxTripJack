import { isDeepStrictEqual } from "node:util";

/** UAT search uses fd; the published contract uses fD. Never combine the two:
 * conflicting aliases could mix a price with different baggage/cabin terms. */
export function flightFareDetails(price: Record<string, unknown>): Record<string, unknown> {
  if (Object.hasOwn(price, "fd") && Object.hasOwn(price, "fD") && !isDeepStrictEqual(price.fd, price.fD)) {
    throw new Error("Conflicting supplier fare details");
  }
  const value = Object.hasOwn(price, "fd") ? price.fd : price.fD;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
