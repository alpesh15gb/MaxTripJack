import type { BookingReport, ReportRow } from "../src/lib/booking-report";
export const reportRow: ReportRow = {
  id: "11111111-1111-4111-8111-111111111111", reference: "SYNTHETIC-MX-001", createdAt: "2026-10-22T18:30:00.123456Z",
  product: "FLIGHT", status: "TICKETED", scope: "BASE", parentOrderId: null, currency: "INR",
  totalMinor: "10000", supplierMinor: "9000", confirmedBase: true,
  capturedPayments: "1", capturedMinor: "10000", completedRefunds: "0", completedRefundMinor: "0",
  pendingRefunds: "0", pendingRefundMinor: "0", providers: "RAZORPAY",
};
export const reportFixture: BookingReport = {
  checkedAt: "2026-10-23T10:00:00.000Z", environment: "uat_only_adapter", dateBasis: "order_created_current_state", timezone: "Asia/Kolkata", currency: "INR",
  filters: { from: "2026-10-23", to: "2026-10-23", product: "ALL", status: "ALL", scope: "ALL" },
  totals: { orders: "1", orderValueMinor: "10000", confirmedBaseBookings: "1", confirmedBaseValueMinor: "10000", capturedPayments: "1", capturedMinor: "10000", completedRefunds: "0", completedRefundMinor: "0", pendingRefunds: "0", pendingRefundMinor: "0" },
  statuses: [{ status: "TICKETED", count: "1" }], scopes: [{ scope: "BASE", count: "1" }], rows: [reportRow], nextCursor: null,
};
export function databaseReport(rows = reportFixture.rows) {
  return { checked_at: new Date(reportFixture.checkedAt), totals: reportFixture.totals, statuses: reportFixture.statuses, scopes: reportFixture.scopes, rows };
}
