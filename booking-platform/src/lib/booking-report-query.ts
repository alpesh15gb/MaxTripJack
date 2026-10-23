import { REPORT_EXPORT_LIMIT, REPORT_PAGE_SIZE, type ReportFilters } from "./booking-report";

/** One coherent MVCC snapshot. Aggregate each child relation before joining orders. */
export function bookingReportQuery(filters: ReportFilters, exporting = false) {
  const values: unknown[] = [filters.from, filters.to, filters.product, filters.status, filters.scope];
  let cursor = "";
  if (!exporting && filters.cursor) {
    values.push(filters.cursor.createdAt, filters.cursor.id);
    cursor = "WHERE (created_at,id) < ($6::timestamptz,$7::uuid)";
  }
  const limit = exporting ? REPORT_EXPORT_LIMIT + 1 : REPORT_PAGE_SIZE + 1;
  const sql = `WITH cohort AS (
    SELECT o.id,o.reference,o.created_at,o.product,o.status,o.service_kind,o.parent_order_id,
      o.currency,o.total_minor,o.supplier_minor FROM orders o
    WHERE o.currency='INR'
      AND o.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND o.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND ($3='ALL' OR o.product=$3) AND ($4='ALL' OR o.status=$4)
      AND ($5='ALL' OR ($5='BASE' AND o.service_kind IS NULL AND o.parent_order_id IS NULL)
        OR ($5 IN ('ANCILLARY','REISSUE') AND o.service_kind=$5))
  ), payment_totals AS (
    SELECT p.order_id, count(*) FILTER (WHERE p.status='CAPTURED') AS captured_count,
      COALESCE(sum(p.amount_minor) FILTER (WHERE p.status='CAPTURED'),0) AS captured_minor,
      string_agg(DISTINCT p.provider, ', ' ORDER BY p.provider) AS providers
    FROM payments p JOIN cohort o ON o.id=p.order_id
    WHERE p.currency=o.currency AND p.currency='INR' GROUP BY p.order_id
  ), refund_totals AS (
    SELECT p.order_id, count(*) FILTER (WHERE r.status='COMPLETED') AS completed_count,
      COALESCE(sum(r.amount_minor) FILTER (WHERE r.status='COMPLETED'),0) AS completed_minor,
      count(*) FILTER (WHERE r.status IN ('REQUESTED','APPROVED','PROCESSING')) AS pending_count,
      COALESCE(sum(r.amount_minor) FILTER (WHERE r.status IN ('REQUESTED','APPROVED','PROCESSING')),0) AS pending_minor
    FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN cohort o ON o.id=p.order_id
    WHERE p.status='CAPTURED' AND p.currency=o.currency AND p.currency='INR' GROUP BY p.order_id
  ), facts AS (
    SELECT o.*, CASE WHEN o.service_kind IS NULL AND o.parent_order_id IS NULL THEN 'BASE'
      WHEN o.service_kind IN ('ANCILLARY','REISSUE') THEN o.service_kind ELSE 'OTHER' END AS report_scope,
      (o.service_kind IS NULL AND o.parent_order_id IS NULL
        AND ((o.product='FLIGHT' AND o.status='TICKETED') OR (o.product='HOTEL' AND o.status='CONFIRMED'))
        AND EXISTS(SELECT 1 FROM outbox_events e WHERE e.aggregate_id=o.id AND e.event_type='booking.confirmed')
        AND EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='CAPTURED' AND p.currency=o.currency AND p.amount_minor=o.total_minor)) AS confirmed_base,
      COALESCE(p.captured_count,0) AS captured_count, COALESCE(p.captured_minor,0) AS captured_minor,
      COALESCE(r.completed_count,0) AS completed_count, COALESCE(r.completed_minor,0) AS completed_minor,
      COALESCE(r.pending_count,0) AS pending_count, COALESCE(r.pending_minor,0) AS pending_minor,
      COALESCE(p.providers,'') AS providers
    FROM cohort o LEFT JOIN payment_totals p ON p.order_id=o.id LEFT JOIN refund_totals r ON r.order_id=o.id
  ), page AS (SELECT * FROM facts ${cursor} ORDER BY created_at DESC,id DESC LIMIT ${limit})
  SELECT statement_timestamp() AS checked_at,
    (SELECT json_build_object(
      'orders',count(*)::text,'orderValueMinor',COALESCE(sum(total_minor),0)::text,
      'confirmedBaseBookings',count(*) FILTER(WHERE confirmed_base)::text,
      'confirmedBaseValueMinor',COALESCE(sum(total_minor) FILTER(WHERE confirmed_base),0)::text,
      'capturedPayments',COALESCE(sum(captured_count),0)::text,'capturedMinor',COALESCE(sum(captured_minor),0)::text,
      'completedRefunds',COALESCE(sum(completed_count),0)::text,'completedRefundMinor',COALESCE(sum(completed_minor),0)::text,
      'pendingRefunds',COALESCE(sum(pending_count),0)::text,'pendingRefundMinor',COALESCE(sum(pending_minor),0)::text
    ) FROM facts) AS totals,
    (SELECT COALESCE(json_agg(s ORDER BY status),'[]'::json) FROM (SELECT status,count(*)::text AS count FROM facts GROUP BY status) s) AS statuses,
    (SELECT COALESCE(json_agg(s ORDER BY scope),'[]'::json) FROM (SELECT report_scope AS scope,count(*)::text AS count FROM facts GROUP BY report_scope) s) AS scopes,
    (SELECT COALESCE(json_agg(json_build_object(
      'id',id,'reference',reference,'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'product',product,'status',status,'scope',report_scope,'parentOrderId',parent_order_id,'currency',currency,
      'totalMinor',total_minor::text,'supplierMinor',supplier_minor::text,'confirmedBase',confirmed_base,
      'capturedPayments',captured_count::text,'capturedMinor',captured_minor::text,
      'completedRefunds',completed_count::text,'completedRefundMinor',completed_minor::text,
      'pendingRefunds',pending_count::text,'pendingRefundMinor',pending_minor::text,'providers',providers
    ) ORDER BY created_at DESC,id DESC),'[]'::json) FROM page) AS rows`;
  return { sql, values };
}
