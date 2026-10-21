import { HttpError } from "./http";
import { assertPayGlocalTransportReady } from "./providers/payglocal";

export type PaymentProvider = "RAZORPAY" | "PAYGLOCAL";

/** New orders only. Persisted provider always wins for historic operations. */
export function selectedPaymentProvider(value = process.env.PAYMENT_PROVIDER): PaymentProvider {
  if (!value || value === "RAZORPAY") return "RAZORPAY";
  if (value === "PAYGLOCAL") return "PAYGLOCAL";
  throw new HttpError(503, "Payment provider configuration is invalid.");
}

/** Gate before order creation or any supplier/payment side effect. */
export function assertNewPaymentProviderReady(provider: PaymentProvider) {
  if (provider === "PAYGLOCAL") assertPayGlocalTransportReady();
}

export function assertRazorpayRecord(provider: string) {
  if (provider !== "RAZORPAY") throw new HttpError(409, "This payment requires its original provider. PayGlocal operations await verified merchant integration; no gateway request was sent.");
}

/** Current configuration cannot redirect a historical checkout to a new provider. */
export function checkoutPaymentProvider(storedProvider: string | undefined, configured = process.env.PAYMENT_PROVIDER): PaymentProvider {
  if (storedProvider === "RAZORPAY" || storedProvider === "PAYGLOCAL") return storedProvider;
  if (storedProvider !== undefined) throw new HttpError(409, "Stored payment provider is invalid.");
  return selectedPaymentProvider(configured);
}
