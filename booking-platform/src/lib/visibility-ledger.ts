import "server-only";
import { database } from "./db";
import type { VisibilityLedgerSnapshot } from "./visibility-readiness";

type LedgerRow = {
  checked_at: Date;
  confirmed_count: string;
  confirmed_value: string;
  captured_count: string;
  captured_value: string;
  refunded_count: string;
  refunded_value: string;
};

/** Call only after finance:read authorization. Aggregates only; no customer or booking identifiers. */
export async function readVisibilityLedger(): Promise<VisibilityLedgerSnapshot> {
  // One statement gives the panels a consistent MVCC snapshot. EXISTS avoids
  // duplicate outbox deliveries/payment rows multiplying the booking total.
  const result = await database().query<LedgerRow>(`
    WITH confirmed AS (
      SELECT o.total_minor FROM orders o
      WHERE o.service_kind IS NULL AND o.parent_order_id IS NULL
        AND ((o.product='FLIGHT' AND o.status='TICKETED') OR (o.product='HOTEL' AND o.status='CONFIRMED'))
        AND EXISTS (SELECT 1 FROM outbox_events e WHERE e.aggregate_id=o.id AND e.event_type='booking.confirmed')
        AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='CAPTURED' AND p.currency=o.currency AND p.amount_minor=o.total_minor)
    ), captured AS (
      SELECT amount_minor FROM payments WHERE status='CAPTURED'
    ), refunded AS (
      SELECT r.amount_minor FROM refunds r JOIN payments p ON p.id=r.payment_id
      WHERE r.status='COMPLETED' AND p.status='CAPTURED'
    )
    SELECT statement_timestamp() AS checked_at,
      (SELECT count(*)::text FROM confirmed) AS confirmed_count,
      (SELECT COALESCE(sum(total_minor),0)::text FROM confirmed) AS confirmed_value,
      (SELECT count(*)::text FROM captured) AS captured_count,
      (SELECT COALESCE(sum(amount_minor),0)::text FROM captured) AS captured_value,
      (SELECT count(*)::text FROM refunded) AS refunded_count,
      (SELECT COALESCE(sum(amount_minor),0)::text FROM refunded) AS refunded_value
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Visibility snapshot unavailable.");
  return {
    checkedAt: row.checked_at.toISOString(), environment: "uat_only_adapter", scope: "all_time_current_state", currency: "INR",
    confirmedBaseBookings: row.confirmed_count, confirmedBaseBookingValueMinor: row.confirmed_value,
    capturedPayments: row.captured_count, capturedPaymentValueMinor: row.captured_value,
    completedRefunds: row.refunded_count, completedRefundValueMinor: row.refunded_value,
    organicAttribution: null, productionRevenue: null, agencyNetRevenue: null,
  };
}
