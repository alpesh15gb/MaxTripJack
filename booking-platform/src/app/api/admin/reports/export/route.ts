import { randomUUID } from "node:crypto";
import { administrator } from "@/lib/access";
import { database } from "@/lib/db";
import { failure, HttpError } from "@/lib/http";
import { parseReportFilters, ReportFilterError } from "@/lib/booking-report";
import { readBookingReport } from "@/lib/booking-report-ledger";
import { bookingReportCsv } from "@/lib/booking-report-csv";

export async function GET(request: Request) {
  try {
    const actor = await administrator(request, "finance:read");
    const filters = parseReportFilters(new URL(request.url).searchParams, new Date(), false);
    const report = await readBookingReport(filters, true);
    const output = bookingReportCsv(report);
    await database().query("INSERT INTO audit_events(id,actor_id,action,detail) VALUES($1,$2,'ADMIN_REPORT_EXPORTED',$3)",
      [randomUUID(), actor.userId, { report: "booking_creation_cohort", ...filters, timezone: report.timezone, checkedAt: report.checkedAt, rows: report.rows.length }]);
    return new Response(output, { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="maxtravel-booking-cohort-${filters.from}-${filters.to}.csv"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "X-Report-Date-Basis": report.dateBasis, "X-Report-Timezone": report.timezone,
      "X-Report-Filters": new URLSearchParams({ from: filters.from, to: filters.to, product: filters.product, status: filters.status, scope: filters.scope }).toString(),
      "X-Report-Generated-At": report.checkedAt, "X-Report-Environment": report.environment,
    } });
  } catch (error) { return failure(error instanceof ReportFilterError ? new HttpError(400, error.message) : error); }
}
