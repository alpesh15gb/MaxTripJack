import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resources, type Resource } from "@/lib/admin-resources";
import { administrator } from "@/lib/access";
import { database } from "@/lib/db";
import { failure, HttpError } from "@/lib/http";
import { day } from "@/lib/providers/contracts";
import { reportCsvCell } from "@/lib/booking-report-csv";

function csv(value: unknown) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString()
    : typeof value === "object" ? JSON.stringify(value) : String(value);
  return reportCsvCell(text);
}
export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const name = (await context.params).resource;
    if (!Object.hasOwn(resources, name)) throw new HttpError(404, "Report not found.");
    const resource = resources[name as Resource];
    const actor = await administrator(request, resource.permission);
    const params = new URL(request.url).searchParams;
    if (params.getAll("from").length !== 1 || params.getAll("to").length !== 1) throw new HttpError(400, "Choose one start and end date.");
    const dates = z.object({ from: day, to: day }).parse({ from: params.get("from"), to: params.get("to") });
    if (dates.to < dates.from) throw new HttpError(400, "End date must follow start date.");
    if ((Date.parse(dates.to) - Date.parse(dates.from)) / 86400000 + 1 > 366) throw new HttpError(400, "Choose at most 366 calendar days.");
    // Resource creation cohort, not capture/refund/settlement activity. Independent of DB session timezone.
    const result = await database().query(`SELECT * FROM (${resource.sql}) report WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND created_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') ORDER BY created_at DESC,id DESC LIMIT 5001`, [dates.from, dates.to]);
    if (result.rows.length > 5000) throw new HttpError(413, "Choose a smaller date range (maximum 5000 rows per export).");
    // Stable allowlist also prevents accidental extra DB fields from leaking into exports.
    const columns = resource.columns;
    const output = "\uFEFF" + [columns.map(csv).join(","), ...result.rows.map(row => columns.map(key => csv(row[key])).join(","))].join("\r\n");
    await database().query("INSERT INTO audit_events(id,actor_id,action,detail) VALUES($1,$2,'ADMIN_REPORT_EXPORTED',$3)", [randomUUID(), actor.userId, { report: name, ...dates, timezone: "Asia/Kolkata", dateBasis: "resource_created_current_state", rows: result.rows.length }]);
    return new Response(output, { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="maxtravel-${name}-${dates.from}-${dates.to}.csv"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "X-Report-Timezone": "Asia/Kolkata", "X-Report-Date-Basis": "resource_created_current_state",
    } });
  } catch (e) { return failure(e); }
}
