/** Shared report contract: dates select order creation, never capture or refund dates. */
export const REPORT_STATUSES = ["DRAFT", "QUOTED", "PAYMENT_PENDING", "PAID", "BOOKING_PENDING", "CONFIRMED", "TICKETED", "BOOKING_FAILED", "MANUAL_REVIEW", "CANCELLED", "CLOSED"] as const;
export const REPORT_SCOPES = ["ALL", "BASE", "ANCILLARY", "REISSUE"] as const;
export const REPORT_PAGE_SIZE = 50;
export const REPORT_EXPORT_LIMIT = 5000;
export type ReportFilters = {
  from: string; to: string; product: "ALL" | "FLIGHT" | "HOTEL";
  status: "ALL" | typeof REPORT_STATUSES[number]; scope: typeof REPORT_SCOPES[number];
  cursor?: { createdAt: string; id: string };
};
export class ReportFilterError extends Error {}
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function realDate(value: string) {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}
export function defaultReportFilters(now = new Date()): ReportFilters {
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { from: `${to.slice(0, 7)}-01`, to, product: "ALL", status: "ALL", scope: "ALL" };
}
export function parseReportFilters(params: URLSearchParams, now = new Date(), allowCursor = true): ReportFilters {
  const allowed = ["from", "to", "product", "status", "scope", ...(allowCursor ? ["cursor"] : [])];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new ReportFilterError("Use one value for each supported report filter.");
  const fallback = defaultReportFilters(now);
  const from = params.get("from") ?? fallback.from, to = params.get("to") ?? fallback.to;
  if (params.has("from") !== params.has("to") || !realDate(from) || !realDate(to) || to < from) throw new ReportFilterError("Choose valid start and end dates, with the end on or after the start.");
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1 > 366) throw new ReportFilterError("Choose at most 366 calendar days, including both dates.");
  const product = params.get("product") ?? "ALL", status = params.get("status") ?? "ALL", scope = params.get("scope") ?? "ALL";
  if (!["ALL", "FLIGHT", "HOTEL"].includes(product) || !["ALL", ...REPORT_STATUSES].includes(status) || !(REPORT_SCOPES as readonly string[]).includes(scope)) throw new ReportFilterError("Choose a supported product, status and order scope.");
  let cursor: ReportFilters["cursor"];
  if (params.has("cursor")) {
    const raw = params.get("cursor")!;
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z)\|([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(raw);
    // Preserve PostgreSQL microseconds in the cursor; Date is only calendar validation.
    if (!match || !Number.isFinite(Date.parse(match[1])) || new Date(match[1]).toISOString() !== match[1].replace(/(\.\d{3})\d{3}Z$/, "$1Z")) throw new ReportFilterError("This report page link is invalid. Return to the first page.");
    cursor = { createdAt: match[1], id: match[2] };
  }
  return { from, to, product: product as ReportFilters["product"], status: status as ReportFilters["status"], scope: scope as ReportFilters["scope"], ...(cursor ? { cursor } : {}) };
}
export function reportParams(filters: ReportFilters, cursor?: ReportFilters["cursor"]) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, product: filters.product, status: filters.status, scope: filters.scope });
  if (cursor) params.set("cursor", `${cursor.createdAt}|${cursor.id}`);
  return params;
}
export type ReportTotals = {
  orders: string; orderValueMinor: string; confirmedBaseBookings: string; confirmedBaseValueMinor: string;
  capturedPayments: string; capturedMinor: string; completedRefunds: string; completedRefundMinor: string;
  pendingRefunds: string; pendingRefundMinor: string;
};
export type ReportRow = {
  id: string; reference: string; createdAt: string; product: "FLIGHT" | "HOTEL"; status: string;
  scope: "BASE" | "ANCILLARY" | "REISSUE" | "OTHER"; parentOrderId: string | null; currency: "INR";
  totalMinor: string; supplierMinor: string; confirmedBase: boolean;
  capturedPayments: string; capturedMinor: string; completedRefunds: string; completedRefundMinor: string;
  pendingRefunds: string; pendingRefundMinor: string; providers: string;
};
export type BookingReport = {
  checkedAt: string; environment: "uat_only_adapter"; dateBasis: "order_created_current_state";
  timezone: "Asia/Kolkata"; currency: "INR"; filters: ReportFilters;
  totals: ReportTotals; statuses: { status: string; count: string }[];
  scopes: { scope: string; count: string }[]; rows: ReportRow[]; nextCursor: ReportFilters["cursor"] | null;
};
export const REPORT_DEFINITIONS = [
  ["Date basis", "Bookings created during the selected India dates. All payment, refund and status figures are their current state, including changes recorded later. Not cash received or refunded during those dates."],
  ["Confirmed base value", "Base flight ticketed or hotel confirmed, with a booking.confirmed event and an exact captured payment in the booking currency. Cancelled bookings, ancillary orders and reissues are excluded."],
  ["Captured payments", "Verified captured records for this order cohort. Can include pending, unsuccessful or cancelled bookings. Capture alone does not confirm travel."],
  ["Completed / pending refunds", "Refunds linked to captured INR payments. Completed is separate from requested, approved and processing; failed refunds contribute to neither bucket. Supplier cancellation alone is not a completed refund."],
  ["Scope and money", "All orders includes base, ancillary, reissue and any unclassified records. Base requires no service kind and no parent order. Values are INR, not profit, commission, bank settlement or production revenue. Supplier cost is the recorded quote, not a reconciled settlement."],
] as const;
