import assert from "node:assert/strict";
import type { BookingReport } from "../src/lib/booking-report";

/** Read-only integration checks using the EXISTING CRM fixture's real signed-in
 * session. No additional identity, grants, auth bypass or supplier calls. */
export async function verifyReportNextHttp(input: {
  base: string; cookie: string; transport: typeof fetch; date: string;
  bookingId: string; authorized: boolean;
}) {
  const { base, cookie, transport, date, bookingId, authorized } = input;
  if (new URL(base).hostname !== "127.0.0.1") throw Error("Report integration requires the loopback fixture server.");
  const params = new URLSearchParams({ from: date, to: date, product: "ALL", status: "ALL", scope: "ALL" });
  const get = (path: string) => transport(`${base}${path}`, { headers: { cookie }, cache: "no-store" });
  const response = await get(`/api/admin/reports?${params}`);
  const exported = await get(`/api/admin/reports/export?${params}`);
  const page = await get(`/operations/reports?${params}`);
  const html = await page.text();
  if (!authorized) {
    assert.equal(response.status, 403); assert.equal(exported.status, 403);
    assert.match(html, /Finance access required/);
    assert.ok(!html.includes("Know where every booking stands."));
    assert.ok(!html.includes(bookingId));
    return;
  }
  assert.equal(response.status, 200); assert.equal(exported.status, 200); assert.equal(page.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(exported.headers.get("cache-control"), "private, no-store");
  assert.equal(exported.headers.get("x-content-type-options"), "nosniff");
  const report = await response.json() as BookingReport;
  const row = report.rows.find(row => row.id === bookingId);
  assert.ok(row, "Real Next report route must include the current flow's fixture booking");
  assert.equal(row.confirmedBase, true); assert.equal(row.totalMinor, "675000");
  assert.equal(row.capturedMinor, "675000"); assert.equal(row.currency, "INR");
  assert.equal(report.dateBasis, "order_created_current_state");
  const csv = await exported.text();
  assert.ok(csv.includes(bookingId)); assert.ok(csv.includes('"6750.00"'));
  assert.match(html, /Know where every booking stands\./);
  assert.match(html, /Current state, not period cash flow\./);
  assert.match(html, /noindex/);
  assert.match(html, /_next\/static\/[^" ]+\.css/);
  const generic = await get("/api/admin/bookings"); assert.equal(generic.status, 200);
  const desk = await generic.json() as { rows: Record<string, unknown>[] };
  assert.ok(desk.rows.some(row => row.id === bookingId));
  for (const row of desk.rows) assert.equal(Object.hasOwn(row, "supplier_minor"), false);
}
