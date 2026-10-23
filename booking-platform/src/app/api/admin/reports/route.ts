import { administrator } from "@/lib/access";
import { failure, HttpError, json } from "@/lib/http";
import { parseReportFilters, ReportFilterError } from "@/lib/booking-report";
import { readBookingReport } from "@/lib/booking-report-ledger";

export async function GET(request: Request) {
  try {
    await administrator(request, "finance:read");
    const filters = parseReportFilters(new URL(request.url).searchParams);
    return json(await readBookingReport(filters));
  } catch (error) { return failure(error instanceof ReportFilterError ? new HttpError(400, error.message) : error); }
}
