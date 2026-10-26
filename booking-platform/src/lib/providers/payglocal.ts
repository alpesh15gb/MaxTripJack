import { HttpError } from "../http";

// Contract preparation only. No network or cryptography is implemented here.
// Sources verified 2026-10-21:
// https://payglocal.in/docs/api-reference/payments-v2/paycollect/gpi
// https://payglocal.in/docs/api-reference/payments-v2/common/get-transaction-status
// https://payglocal.in/docs/api-reference/payment/refund
// https://payglocal.in/docs/key-management/request-construction
export const PAYGLOCAL_UAT_ORIGIN = "https://api.uat.payglocal.in";
export const PAYGLOCAL_INITIATE_PATH = "/gl/v1/payments/initiate/paycollect";
export type PayGlocalAttempt = {
  merchantTxnId: string; gid: string | null; merchantId: string;
  amountMinor: number; currency: "INR";
};

/** Internal normalized result, NOT the public API response or callback shape.
 * The future authenticated adapter must establish MID and resolve method-specific
 * amount/currency fields using the merchant's verified contract. A source label
 * alone is NOT authentication; never construct this from browser/webhook input.
 */
export type PayGlocalVerifiedStatus = {
  source: "SERVER_STATUS";
  merchantTxnId: string; gid: string; merchantId: string;
  totalAmount: string; txnCurrency: string; status: string;
};

export type PayGlocalBillingData = {
  firstName: string; lastName: string; emailId: string; addressCountry: string;
  addressStreet1?: string; addressCity?: string; addressState?: string;
};

/** Unsigned payload preparation, not a sendable request or UAT approval.
 * Field names: /docs/api-reference/payments-v2/paycollect/gpi and
 * https://payglocal.in/docs/api-reference/payload-templates (Flight templates).
 * Documentation disagrees about alpha-2/alpha-3 country and whether unique ID
 * is mandatory. Preserve the explicitly supplied country, include both stable
 * IDs, and resolve with the merchant before enabling the transport. Do not
 * invent a ticket number or flight risk data before supplier confirmation.
 */
export function buildPayGlocalCheckoutPayload(input: {
  attempt: PayGlocalAttempt; product: "FLIGHT" | "HOTEL";
  billingData: PayGlocalBillingData; merchantCallbackURL: string; applicationOrigin: string;
}) {
  const { attempt, billingData: billing } = input;
  if (!["FLIGHT", "HOTEL"].includes(input.product) || attempt.currency !== "INR" || !/^[A-Za-z0-9]{15,40}$/.test(attempt.merchantTxnId)) {
    throw new HttpError(400, "PayGlocal requires a stable alphanumeric payment reference and INR amount.");
  }
  const validText = (value: unknown, maximum: number) => typeof value === "string"
    && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
  if (!billing || !validText(billing.firstName, 100) || !validText(billing.lastName, 100)
    || !validText(billing.emailId, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.emailId)
    || !/^[A-Z]{2,3}$/.test(billing.addressCountry)
    || [billing.addressStreet1, billing.addressCity, billing.addressState].some(value => value !== undefined && !validText(value, 200))) {
    throw new HttpError(400, "Complete billing identity, email and country are required.");
  }
  // Conservative application policy for flights; actual merchant risk-data
  // requirements still need UAT confirmation. Never substitute traveller names
  // or country when the payer's billing details have not been collected.
  if (input.product === "FLIGHT" && [billing.addressStreet1, billing.addressCity, billing.addressState].some(value => !validText(value, 200))) {
    throw new HttpError(400, "Flight checkout requires the payer's billing address, city and state.");
  }
  let callback: URL; let origin: URL;
  try { callback = new URL(input.merchantCallbackURL); origin = new URL(input.applicationOrigin); }
  catch { throw new HttpError(400, "Invalid merchant callback URL."); }
  if (origin.protocol !== "https:" || origin.href !== `${origin.origin}/` || origin.username || origin.password
    || callback.origin !== origin.origin || callback.username || callback.password || callback.hash
    || /[\s\\]/.test(input.merchantCallbackURL)) {
    throw new HttpError(400, "Merchant callback must belong to the configured HTTPS application origin.");
  }
  // Explicit selection avoids forwarding injected card/credential/extra fields.
  return {
    merchantTxnId: attempt.merchantTxnId,
    merchantUniqueId: attempt.merchantTxnId,
    paymentData: {
      totalAmount: formatPayGlocalAmount(attempt.amountMinor), txnCurrency: attempt.currency,
      billingData: {
        firstName: billing.firstName, lastName: billing.lastName, emailId: billing.emailId, addressCountry: billing.addressCountry,
        ...(billing.addressStreet1 ? { addressStreet1: billing.addressStreet1 } : {}),
        ...(billing.addressCity ? { addressCity: billing.addressCity } : {}),
        ...(billing.addressState ? { addressState: billing.addressState } : {}),
      },
    },
    merchantCallbackURL: callback.href,
  };
}

export function formatPayGlocalAmount(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new HttpError(400, "Payment amount must be positive integer minor units.");
  }
  const amount = BigInt(amountMinor);
  return `${amount / BigInt(100)}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}

function decimalMinorUnits(amount: unknown): bigint {
  if (typeof amount !== "string" || !/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/.test(amount)) {
    throw new HttpError(409, "PayGlocal amount needs reconciliation.");
  }
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function assertPayGlocalStatusBinding(attempt: PayGlocalAttempt, result: PayGlocalVerifiedStatus): void {
  formatPayGlocalAmount(attempt.amountMinor);
  if (!result || result.source !== "SERVER_STATUS" || !attempt.gid || !attempt.merchantId
    || !attempt.merchantTxnId || attempt.currency !== "INR"
    || result.gid !== attempt.gid || result.merchantTxnId !== attempt.merchantTxnId
    || result.merchantId !== attempt.merchantId || result.txnCurrency !== attempt.currency
    || decimalMinorUnits(result.totalAmount) !== BigInt(attempt.amountMinor)) {
    throw new HttpError(409, "PayGlocal status does not match the stored payment attempt.");
  }
}

export function payGlocalPaymentState(status: unknown): "CAPTURED" | "PENDING" | "UNKNOWN" {
  // PayCollect sale success. Auth-only is deliberately not paid/fulfillable.
  if (status === "SENT_FOR_CAPTURE") return "CAPTURED";
  if (status === "AUTHORIZED" || status === "INPROGRESS") return "PENDING";
  // Includes timeout, unrecognized status and failure reports: none authorizes
  // another payment attempt. A later verified sale can still be reconciled.
  return "UNKNOWN";
}

export function payGlocalRefundState(status: unknown): "PENDING" | "UNKNOWN" {
  // Acceptance is not settlement. No unverified completion mapping is enabled.
  return status === "SENT_FOR_REFUND" ? "PENDING" : "UNKNOWN";
}

export function validatePayGlocalUrl(value: unknown, kind: "redirect" | "status", expectedGid?: string): string {
  if (typeof value !== "string" || value.length > 8192 || /[\s\\]/.test(value)) {
    throw new HttpError(409, "Unsafe PayGlocal URL.");
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(409, "Unsafe PayGlocal URL."); }
  // Never wildcard payglocal.in, accept arbitrary env URLs or follow redirects.
  // Production origins require merchant confirmation and are blocked for now.
  const pathAllowed = kind === "redirect" ? url.pathname === "/gl/payflow-ui/"
    : /^\/gl\/v1\/payments\/[A-Za-z0-9_-]{1,128}\/status$/.test(url.pathname);
  if (url.origin !== PAYGLOCAL_UAT_ORIGIN || url.username || url.password || url.hash || !pathAllowed
    || (kind === "status" && expectedGid !== undefined
      && url.pathname !== `/gl/v1/payments/${expectedGid}/status`)) {
    throw new HttpError(409, "Unsafe PayGlocal URL.");
  }
  return url.href;
}

/** Fail before reserving an attempt or making any provider-side request.
 * JWS/JWE transport, status authentication/MID binding, callback verification,
 * idempotency and refund completion semantics need merchant UAT confirmation.
 * No environment variable or browser request can bypass this guard.
 */
export function assertPayGlocalTransportReady(): never {
  throw new HttpError(503, "In Testing · Online payment is not available. No payment was initiated.");
}
