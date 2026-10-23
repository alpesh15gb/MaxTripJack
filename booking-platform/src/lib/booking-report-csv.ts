import type { BookingReport, ReportRow } from "./booking-report";

/** Human-readable CSV. Re-import as text; spreadsheet applications differ on re-saving escapes. */
export function reportCsvCell(value: string | boolean) {
  let text = String(value);
  if (/^[\t\r\n]|^[\s\uFEFF]*[=+@\-＝＋＠－]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function reportInrDecimal(minor: string) {
  if (!/^\d+$/.test(minor)) throw new Error("Invalid non-negative minor amount.");
  const amount = BigInt(minor);
  return `${amount / BigInt(100)}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}
const moneyColumns = [
  ["order_value_inr", "totalMinor"], ["quoted_supplier_cost_inr", "supplierMinor"],
  ["captured_inr", "capturedMinor"], ["completed_refund_inr", "completedRefundMinor"], ["pending_refund_inr", "pendingRefundMinor"],
] as const;
const columns: [string, keyof ReportRow][] = [
  ["booking_id", "id"], ["booking_reference", "reference"], ["order_created_utc", "createdAt"],
  ["product", "product"], ["current_status", "status"], ["order_scope", "scope"], ["parent_order_id", "parentOrderId"],
  ["currency", "currency"], ["order_value_minor", "totalMinor"], ["quoted_supplier_cost_minor", "supplierMinor"],
  ["currently_confirmed_base", "confirmedBase"], ["captured_payment_records", "capturedPayments"], ["captured_minor", "capturedMinor"],
  ["completed_refund_records", "completedRefunds"], ["completed_refund_minor", "completedRefundMinor"],
  ["pending_refund_records", "pendingRefunds"], ["pending_refund_minor", "pendingRefundMinor"], ["payment_providers", "providers"],
];
export function bookingReportCsv(report: BookingReport) {
  const metadata = ["cohort_from", "cohort_to", "cohort_timezone", "filter_product", "filter_status", "filter_scope", "date_basis", "generated_at_utc", "environment"];
  const prefix = [report.filters.from, report.filters.to, report.timezone, report.filters.product, report.filters.status, report.filters.scope, report.dateBasis, report.checkedAt, report.environment];
  return "\uFEFF" + [
    [...metadata, ...columns.map(([name]) => name), ...moneyColumns.map(([name]) => name)].map(reportCsvCell).join(","),
    ...report.rows.map(row => [...prefix, ...columns.map(([, key]) => row[key] ?? ""), ...moneyColumns.map(([, key]) => reportInrDecimal(row[key]))].map(reportCsvCell).join(",")),
  ].join("\r\n");
}
