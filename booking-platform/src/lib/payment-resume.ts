export type PaymentResumeRecord = {
  id: string; status: string; total_minor: number | string;
  quote_expires_at: Date | string | null;
  fare_validation_state: string | null; booking_validation_state: string | null;
  intent_state: string | null; gateway_order_id: string | null;
  payment_status: string | null; amount_minor: number | string | null; currency: string | null;
};

export function paymentResumeStatus(record: PaymentResumeRecord, now = Date.now()) {
  const fresh = record.quote_expires_at !== null && new Date(record.quote_expires_at).getTime() > now;
  const amount = Number(record.total_minor);
  const canResume = record.status === "PAYMENT_PENDING" && record.intent_state === "CREATED"
    && (record.fare_validation_state === null || record.fare_validation_state === "SUCCEEDED") && record.booking_validation_state === null
    && record.payment_status === "CREATED" && fresh && /^order_[A-Za-z0-9]+$/.test(record.gateway_order_id ?? "")
    && Number.isSafeInteger(amount) && amount > 0 && Number(record.amount_minor) === amount && record.currency === "INR";
  const checkoutResolved = record.payment_status === "CAPTURED"
    || ["PAID", "BOOKING_PENDING", "TICKETED", "CONFIRMED", "BOOKING_FAILED", "CANCELLED", "CLOSED"].includes(record.status);
  return {
    bookingId: record.id, status: record.status, paymentStatus: record.payment_status,
    intentState: record.intent_state, quoteExpiresAt: record.quote_expires_at, canResume, checkoutResolved,
    message: canResume ? "Resume the existing payment order only. Payment does not confirm your booking."
      : "This checkout cannot be reopened safely. Check this booking in My trips or contact operations; do not create another payment for the same trip.",
    ...(canResume ? { orderId: record.gateway_order_id!, amount, currency: "INR" as const } : {}),
  };
}
