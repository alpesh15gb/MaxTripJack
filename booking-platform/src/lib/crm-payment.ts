type PaymentRow = {
  id: string;
  gateway_payment_id: string | null;
  provider: "RAZORPAY" | "PAYGLOCAL";
  method: string | null;
  amount_minor: string;
  status: string;
  created_at: Date;
};

/** Explicit public event projection: never forward provider credentials or payloads. */
export function crmPayment(payment: PaymentRow) {
  return {
    id: payment.id,
    reference: payment.gateway_payment_id,
    provider: payment.provider,
    method: payment.method,
    amountMinor: Number(payment.amount_minor),
    status: payment.status,
    createdAt: payment.created_at,
  };
}
