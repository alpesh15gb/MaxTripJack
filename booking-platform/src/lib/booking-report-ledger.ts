import "server-only";
import { database } from "./db";
import { HttpError } from "./http";
import { bookingReportQuery } from "./booking-report-query";
import { REPORT_EXPORT_LIMIT, REPORT_PAGE_SIZE, type BookingReport, type ReportFilters } from "./booking-report";

/** Caller must authorize finance:read. No provider, customer data or credentials are read. */
export async function readBookingReport(filters: ReportFilters, exporting = false): Promise<BookingReport> {
  const query = bookingReportQuery(filters, exporting);
  const result = await database().query(query.sql, query.values);
  const data = result.rows[0];
  if (!data) throw new Error("Booking report unavailable.");
  if (exporting && data.rows.length > REPORT_EXPORT_LIMIT) throw new HttpError(413, "This report exceeds 5,000 rows. Narrow the dates or filters before exporting.");
  const more = !exporting && data.rows.length > REPORT_PAGE_SIZE;
  const rows = exporting ? data.rows : data.rows.slice(0, REPORT_PAGE_SIZE);
  const last = rows.at(-1);
  return { checkedAt: new Date(data.checked_at).toISOString(), environment: "uat_only_adapter", dateBasis: "order_created_current_state", timezone: "Asia/Kolkata", currency: "INR", filters,
    totals: data.totals, statuses: data.statuses, scopes: data.scopes, rows,
    nextCursor: more && last ? { createdAt: last.createdAt, id: last.id } : null };
}
