import { checkedHostedUrl, type NativePayment, type NativePaidPayment } from "./billing-data.ts";

const bookingIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const terminalOrderStates = new Set(["PAID", "BOOKING_PENDING", "TICKETED", "CONFIRMED", "BOOKING_FAILED", "CANCELLED", "CLOSED"]);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("The payment response could not be verified. Check My trips.");
  return value as Record<string, unknown>;
}

export function checkedPayment(value: unknown, expectedAmountMinor: number): NativePayment {
  const data = asRecord(value);
  if (typeof data.bookingId !== "string" || !bookingIdPattern.test(data.bookingId) ||
      typeof data.amount !== "number" || !Number.isSafeInteger(data.amount) || data.amount < 0 ||
      data.amount !== expectedAmountMinor || data.currency !== "INR") {
    throw Error("The payment amount or booking reference could not be verified. Check My trips.");
  }
  const common = { bookingId: data.bookingId, amount: data.amount, currency: "INR" as const };
  if (data.amount === 0 && data.free === true && data.provider === undefined) {
    return { ...common, amount: 0, free: true };
  }
  if (data.free === true || data.amount === 0) throw Error("The payment response could not be verified. Check My trips.");
  if (data.provider === "PAYGLOCAL" && typeof data.checkoutUrl === "string") {
    const payment = { ...common, provider: data.provider, checkoutUrl: data.checkoutUrl } as const;
    return { ...payment, checkoutUrl: checkedHostedUrl(payment) };
  }
  if ((data.provider === undefined || data.provider === "RAZORPAY") &&
      typeof data.orderId === "string" && /^order_[A-Za-z0-9]+$/.test(data.orderId) &&
      typeof data.keyId === "string" && /^rzp_test_[A-Za-z0-9]+$/.test(data.keyId)) {
    return { ...common, provider: "RAZORPAY", orderId: data.orderId, keyId: data.keyId };
  }
  throw Error("The secure checkout details could not be verified. Check My trips.");
}

type PaymentRecovery =
  | { state: "resolved" | "expired"; message: string }
  | { state: "outstanding"; message: string; resumable: NativePaidPayment | null };

export function checkedPaymentRecovery(value: unknown, quoteId: string, now = Date.now()): PaymentRecovery {
  const data = asRecord(value);
  if (typeof data.status !== "string" || typeof data.found !== "boolean" || typeof data.canResume !== "boolean") {
    throw Error("Payment status could not be confirmed. Check My trips.");
  }
  const message = typeof data.message === "string" && data.message.trim()
    ? data.message : "Payment is awaiting verification. Check My trips.";
  if (data.found === false && data.quoteId === quoteId && data.status === "EXPIRED_WITHOUT_PAYMENT" &&
      data.checkoutResolved === true && data.canResume === false) {
    return { state: "expired", message };
  }
  if (data.found === true && typeof data.bookingId === "string" && bookingIdPattern.test(data.bookingId) &&
      data.checkoutResolved === true && data.canResume === false &&
      (data.paymentStatus === "CAPTURED" || terminalOrderStates.has(data.status))) {
    return { state: "resolved", message };
  }
  if (data.found === true && data.canResume === true && data.checkoutResolved === false &&
      data.status === "PAYMENT_PENDING" && typeof data.quoteExpiresAt === "string" &&
      Date.parse(data.quoteExpiresAt) > now && typeof data.amount === "number") {
    const payment = checkedPayment(data, data.amount);
    if (!payment.free) return { state: "outstanding", message, resumable: payment };
  }
  return { state: "outstanding", message, resumable: null };
}
