import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpError } from "./http";

// A recovery eligibility delay, never permission to submit another gateway
// order. The provider request itself has a 20-second timeout.
export const PAYMENT_INTENT_STALE_MS = 120_000;

export type PaymentIntent = {
  provider?: string;
  total_minor: string | number;
  status: string;
  state: string;
  gateway_order_id: string | null;
  created_at: Date | string;
};
type GatewayOrder = { id?: unknown; amount?: unknown; currency?: unknown; receipt?: unknown };

export function assertRecoverablePaymentIntent(intent: PaymentIntent | undefined, gatewayOrderId: string, now = Date.now()) {
  if (intent?.provider && intent.provider !== "RAZORPAY") throw new HttpError(409, "Payment belongs to another provider.");
  // Repeated recovery can observe a captured/ticketed order: verify its link
  // without resetting its state.
  if (intent?.state === "CREATED" && intent.gateway_order_id === gatewayOrderId) return;
  const age = intent ? now - new Date(intent.created_at).getTime() : NaN;
  if (!intent || (intent.provider !== undefined && intent.provider !== "RAZORPAY") || intent.gateway_order_id || !["PAYMENT_PENDING", "MANUAL_REVIEW"].includes(intent.status)
    || !(intent.state === "UNKNOWN" || (intent.state === "STARTED" && age >= PAYMENT_INTENT_STALE_MS))) {
    throw new HttpError(409, "Payment order is not awaiting recovery. A recent creation attempt must finish before reconciliation.");
  }
}

/** Caller supplies a transaction. Lock both rows before checking or linking. */
export async function persistGatewayOrder(tx: Pick<PoolClient, "query">, bookingId: string, gateway: GatewayOrder, mode: "CREATE" | "RECOVER") {
  const found = await tx.query<PaymentIntent>(
    "SELECT g.provider,o.total_minor,o.status,g.state,g.gateway_order_id,g.created_at FROM orders o JOIN gateway_intents g ON g.order_id=o.id WHERE o.id=$1 FOR UPDATE OF o,g", [bookingId],
  );
  const intent = found.rows[0];
  if (typeof gateway.id !== "string" || !/^order_[A-Za-z0-9]+$/.test(gateway.id) || !intent
    || (intent.provider !== undefined && intent.provider !== "RAZORPAY")
    || gateway.amount !== Number(intent.total_minor) || gateway.currency !== "INR"
    || (mode === "RECOVER" && gateway.receipt !== bookingId)) {
    throw new HttpError(409, "Gateway order does not match this booking and amount.");
  }
  if (mode === "RECOVER") assertRecoverablePaymentIntent(intent, gateway.id);
  const payments = await tx.query<{ order_id: string; gateway_order_id: string; amount_minor: string; currency: string }>(
    "SELECT order_id,gateway_order_id,amount_minor::text,currency FROM payments WHERE order_id=$1 OR gateway_order_id=$2", [bookingId, gateway.id],
  );
  if (intent.state === "CREATED" && intent.gateway_order_id === gateway.id && payments.rows.length === 1) {
    const payment = payments.rows[0];
    if (payment.order_id === bookingId && payment.gateway_order_id === gateway.id
      && Number(payment.amount_minor) === gateway.amount && payment.currency === gateway.currency) return { linked: false };
  }
  if (payments.rowCount || intent.gateway_order_id || !["STARTED", "UNKNOWN"].includes(intent.state)
    || !["PAYMENT_PENDING", "MANUAL_REVIEW"].includes(intent.status)) {
    throw new HttpError(409, "Payment recovery has already progressed or requires investigation.");
  }
  await tx.query("INSERT INTO payments(id,order_id,gateway_order_id,amount_minor) VALUES($1,$2,$3,$4)", [randomUUID(), bookingId, gateway.id, intent.total_minor]);
  await tx.query("UPDATE gateway_intents SET state='CREATED',gateway_order_id=$2 WHERE order_id=$1", [bookingId, gateway.id]);
  // No linked payment existed above. Paid/processing/terminal orders never
  // reach this mutation, so only creation uncertainty is cleared.
  if (intent.status === "MANUAL_REVIEW") {
    await tx.query("UPDATE orders SET status='PAYMENT_PENDING',revision=revision+1,updated_at=now() WHERE id=$1 AND status='MANUAL_REVIEW'", [bookingId]);
  }
  return { linked: true };
}

/** A late failing creator must not undo a concurrent recovery or capture. */
export async function markGatewayIntentUnknown(tx: Pick<PoolClient, "query">, bookingId: string) {
  const found = await tx.query<PaymentIntent>(
    "SELECT g.provider,o.total_minor,o.status,g.state,g.gateway_order_id,g.created_at FROM orders o JOIN gateway_intents g ON g.order_id=o.id WHERE o.id=$1 FOR UPDATE OF o,g", [bookingId],
  );
  const intent = found.rows[0];
  if (!intent || (intent.provider !== undefined && intent.provider !== "RAZORPAY") || intent.gateway_order_id || !["STARTED", "UNKNOWN"].includes(intent.state)
    || !["PAYMENT_PENDING", "MANUAL_REVIEW"].includes(intent.status)) return;
  await tx.query("UPDATE gateway_intents SET state='UNKNOWN' WHERE order_id=$1", [bookingId]);
  if (intent.status === "PAYMENT_PENDING") {
    await tx.query("UPDATE orders SET status='MANUAL_REVIEW',revision=revision+1,updated_at=now() WHERE id=$1 AND status='PAYMENT_PENDING'", [bookingId]);
  }
}
