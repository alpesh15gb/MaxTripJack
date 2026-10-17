import { administrator } from "@/lib/access";
import { database } from "@/lib/db";
import { json, failure } from "@/lib/http";
export async function GET(request: Request) {
  try {
    await administrator(request, "bookings:read");
    const result = await database().query("SELECT (SELECT count(*)::int FROM orders) AS bookings, (SELECT count(*)::int FROM orders WHERE status='MANUAL_REVIEW') AS exceptions, (SELECT count(*)::int FROM cancellation_requests WHERE status='REQUESTED') AS cancellations, (SELECT count(*)::int FROM outbox_events WHERE attempts>0 AND delivered_at IS NULL) AS sync_retries");
    return json(result.rows[0]);
  } catch (e) { return failure(e); }
}
