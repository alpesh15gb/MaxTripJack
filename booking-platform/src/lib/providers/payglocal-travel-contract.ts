import { HttpError } from "../http";

/** Code-reviewed merchant contract, deliberately not environment toggles.
 * Mapping and verification primitives are implemented. These unanswered
 * questions still prevent NEW checkout before attempts/HTTP side effects. */
export const PAYGLOCAL_CONFIRMATION_BLOCKERS: readonly string[] = Object.freeze([
  "PRE_ISSUANCE_TICKET_NUMBER",
  "BILLING_COUNTRY_FORMAT",
  "MERCHANT_TRANSPORT_VERSION",
  "WEBHOOK_SIGNATURE_ENVELOPE",
  "HOTEL_CANCELLATION_POLICY_CODE",
  "MULTI_CITY_TRAVEL_REPRESENTATION",
] as const);
export function payGlocalTravelContractReady(): boolean { return PAYGLOCAL_CONFIRMATION_BLOCKERS.length === 0; }
export function assertPayGlocalTravelContract() {
  if (!payGlocalTravelContractReady()) throw new HttpError(503, "Online payment is not available yet. No payment was initiated.");
}
