/** Real SQL + loopback HTTP with synthetic session identity. Never reads DATABASE_URL.
 * Explicit TEST_DATABASE_URL must name the disposable CI database. No provider calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { bookingReportQuery } from "../src/lib/booking-report-query";
import { parseReportFilters, reportParams, type BookingReport, type ReportFilters, type ReportRow } from "../src/lib/booking-report";
import { resources } from "../src/lib/admin-resources";
import { reportHarness, type Harness } from "./report-harness";

const input = process.env.TEST_DATABASE_URL;
if (!input) throw Error("Explicit TEST_DATABASE_URL for disposable loopback reporting tests is required.");
const url = new URL(input);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/payglocal_disposable" || url.search || url.hash) throw Error("Reporting tests require the loopback payglocal_disposable database without URL options.");
const schema = `report_test_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: input, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
let created = false;
async function query(sql: string, values: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO ${schema},public`);
    // Intentionally not IST: application bounds must be independent of DB/session timezone.
    await client.query("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
    const result = await client.query(sql, values); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
const filters = (date: string, extra: Partial<ReportFilters> = {}): ReportFilters => ({ from: date, to: date, product: "ALL", status: "ALL", scope: "ALL", ...extra });
async function read(filter: ReportFilters, exporting = false) { const q = bookingReportQuery(filter, exporting); return (await query(q.sql, q.values)).rows[0]; }
async function order(amount: string, status = "TICKETED", options: { product?: string; kind?: string; parent?: string; at?: string; capture?: string; event?: boolean; reference?: string } = {}) {
  const id = randomUUID(), paymentId = randomUUID();
  await query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor,service_kind,parent_order_id,created_at) VALUES($1,$2,'synthetic-report-user',$3,$4,$5,0,$6,$7,$8)", [id, options.reference ?? `SYNTHETIC-${id}`, options.product ?? "FLIGHT", status, amount, options.kind ?? null, options.parent ?? null, options.at ?? "2026-10-23T05:00:00.000123Z"]);
  if (options.capture !== undefined) await query("INSERT INTO payments(id,order_id,gateway_order_id,gateway_payment_id,amount_minor,status,created_at) VALUES($1,$2,$3,$4,$5,'CAPTURED','2026-11-20T00:00:00Z')", [paymentId, id, `order_${id}`, `pay_${id}`, options.capture]);
  if (options.event) for (let i = 0; i < 2; i++) await query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'booking.confirmed','{}')", [randomUUID(), id]);
  return { id, paymentId };
}
let routes: Awaited<ReturnType<typeof reportHarness>>[] = [];
const server = createServer();
try {
  await pool.query(`CREATE SCHEMA ${schema}`); created = true;
  const files = (await readdir(new URL("../db/", import.meta.url))).filter(name => /^\d{3}-.*\.sql$/.test(name)).sort();
  for (const file of files) await query(await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"));
  await query("INSERT INTO admin_grants(user_id,active,permissions) VALUES('synthetic-report-user',true,ARRAY['finance:read'])");
  const base = await order("10000", "TICKETED", { capture: "10000", event: true });
  await order("20000", "CONFIRMED", { product: "HOTEL", capture: "20000", event: true });
  await order("5000", "BOOKING_PENDING", { capture: "5000" });
  const cancelled = await order("8000", "CANCELLED", { capture: "8000", event: true });
  await order("1200", "TICKETED", { kind: "ANCILLARY", parent: base.id, capture: "1200", event: true });
  await order("2000", "TICKETED", { kind: "REISSUE", parent: base.id, capture: "2000", event: true });
  await order("6000", "TICKETED", { capture: "5500", event: true });
  await order("4000", "TICKETED", { capture: "4000" });
  for (const [amount, status] of [["1000", "COMPLETED"], ["2000", "COMPLETED"], ["500", "APPROVED"], ["200", "FAILED"]]) await query("INSERT INTO refunds(id,payment_id,amount_minor,status,created_at) VALUES($1,$2,$3,$4,'2026-12-01T00:00:00Z')", [randomUUID(), cancelled.paymentId, amount, status]);
  const all = await read(filters("2026-10-23"));
  assert.deepEqual(all.totals, { orders: "8", orderValueMinor: "56200", confirmedBaseBookings: "2", confirmedBaseValueMinor: "30000", capturedPayments: "8", capturedMinor: "55700", completedRefunds: "2", completedRefundMinor: "3000", pendingRefunds: "1", pendingRefundMinor: "500" });
  const baseReport = await read(filters("2026-10-23", { scope: "BASE" }));
  assert.equal(baseReport.totals.orders, "6"); assert.equal(baseReport.totals.capturedMinor, "52500"); assert.equal(baseReport.totals.confirmedBaseValueMinor, "30000");
  const hotel = await read(filters("2026-10-23", { product: "HOTEL" })); assert.equal(hotel.totals.capturedMinor, "20000");
  const closed = await read(filters("2026-10-23", { status: "CANCELLED" })); assert.equal(closed.totals.capturedMinor, "8000"); assert.equal(closed.totals.confirmedBaseValueMinor, "0"); assert.equal(closed.totals.completedRefundMinor, "3000");
  console.log("PASS real PostgreSQL: exact cohort reconciliation, late payment/refund rows, duplicate confirmation events, partial refunds, current status/product/scope filters");

  const boundary = [];
  for (const at of ["2026-10-19T18:29:59.999999Z", "2026-10-19T18:30:00.000000Z", "2026-10-20T18:29:59.999999Z", "2026-10-20T18:30:00.000000Z"]) boundary.push(await order("1", "DRAFT", { at }));
  const day = await read(filters("2026-10-20")); assert.equal(day.totals.orders, "2"); assert.deepEqual(new Set(day.rows.map((row: ReportRow) => row.id)), new Set([boundary[1].id, boundary[2].id]));
  const huge = "9007199254740993123";
  await order(huge, "TICKETED", { at: "2026-10-25T06:00:00Z", capture: huge, event: true });
  const hugeReport = await read(filters("2026-10-25")); assert.equal(hugeReport.totals.orderValueMinor, huge); assert.equal(hugeReport.totals.capturedMinor, huge);
  assert.equal((await read(filters("2026-01-01"))).totals.orders, "0");
  const excluded = await order("1000", "CONFIRMED", { at: "2026-10-27T05:00:00Z", capture: "1000", event: true });
  for (const status of ["CREATED", "AUTHORIZED", "FAILED"]) {
    const id = randomUUID();
    await query("INSERT INTO payments(id,order_id,gateway_order_id,amount_minor,status) VALUES($1,$2,$3,900,$4)", [id, excluded.id, `order_${id}`, status]);
    await query("INSERT INTO refunds(id,payment_id,amount_minor,status) VALUES($1,$2,100,'COMPLETED')", [randomUUID(), id]);
  }
  const noncaptured = await read(filters("2026-10-27"));
  assert.equal(noncaptured.totals.capturedPayments, "1"); assert.equal(noncaptured.totals.capturedMinor, "1000"); assert.equal(noncaptured.totals.completedRefundMinor, "0");
  assert.equal(noncaptured.totals.confirmedBaseBookings, "0", "FLIGHT/CONFIRMED is not ticketed confirmation");
  console.log("PASS real PostgreSQL: IST midnight boundaries under Honolulu session timezone; exact bigint beyond JS safe range; true empty cohort");

  const pageIds = new Set<string>();
  for (let i = 0; i < 61; i++) pageIds.add((await order("1", "DRAFT", { at: i < 60 ? "2026-10-26T05:00:00.123456Z" : "2026-10-26T05:00:00.123457Z" })).id);
  const first = await read(filters("2026-10-26")); assert.equal(first.rows.length, 51); assert.equal(first.totals.orders, "61");
  const last = first.rows[49];
  const secondFilters = filters("2026-10-26", { cursor: { createdAt: last.createdAt, id: last.id } });
  assert.deepEqual(parseReportFilters(reportParams(secondFilters, secondFilters.cursor)), secondFilters);
  const second = await read(secondFilters); assert.equal(second.totals.orders, "61");
  const combined = [...first.rows.slice(0, 50), ...second.rows]; assert.equal(combined.length, 61); assert.deepEqual(new Set(combined.map(row => row.id)), pageIds);
  const exported = await read(secondFilters, true); assert.equal(exported.rows.length, 61);
  console.log("PASS real PostgreSQL: microsecond + UUID cursor tie-break, full-cohort summaries across pages, export ignores visible-page cursor");

  const state: Harness = { permissions: [], databaseAuthorization: true, events: [], async query(sql, values) { const result = await query(sql, values); return { rows: result.rows, rowCount: result.rowCount ?? undefined }; } };
  routes = await Promise.all([reportHarness("src/app/api/admin/reports/route.ts", state), reportHarness("src/app/api/admin/reports/export/route.ts", state)]);
  server.on("request", async (req, res) => {
    try {
      const request = new Request(`http://127.0.0.1${req.url}`);
      const response = await routes[request.url.includes("/export?") ? 1 : 0].GET(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end("Fixture transport failure"); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`, params = reportParams(filters("2026-10-23"));
  const response = await fetch(`${origin}/api/admin/reports?${params}`); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = await response.json() as BookingReport; assert.deepEqual(data.totals, all.totals);
  const csvResponse = await fetch(`${origin}/api/admin/reports/export?${params}`); assert.equal(csvResponse.status, 200);
  const csv = await csvResponse.text(); assert.equal(csv.split("\r\n").length, 9);
  for (const row of data.rows) assert.ok(csv.includes(row.id));
  assert.equal(data.rows.reduce((sum, row) => sum + BigInt(row.capturedMinor), BigInt(0)).toString(), data.totals.capturedMinor);
  assert.equal(data.rows.reduce((sum, row) => sum + BigInt(row.completedRefundMinor), BigInt(0)).toString(), data.totals.completedRefundMinor);
  await query("UPDATE admin_grants SET permissions=ARRAY['bookings:read'] WHERE user_id='synthetic-report-user'");
  const generic = await reportHarness("src/app/api/admin/export/[resource]/route.ts", state);
  routes.push(generic);
  const genericContext = { params: Promise.resolve({ resource: "bookings" }) };
  const genericResponse = await generic.GET(new Request("http://127.0.0.1/api/admin/export/bookings?from=2026-10-20&to=2026-10-20"), genericContext);
  assert.equal(genericResponse.status, 200);
  assert.equal(genericResponse.headers.get("X-Report-Timezone"), "Asia/Kolkata");
  const genericCsv = await genericResponse.text();
  assert.equal(genericCsv.split("\r\n").length, 3);
  for (const index of [1, 2]) assert.ok(genericCsv.includes(boundary[index].id));
  for (const index of [0, 3]) assert.ok(!genericCsv.includes(boundary[index].id));
  assert.ok(!genericCsv.includes("supplier_minor"));
  const emptyGeneric = await generic.GET(new Request("http://127.0.0.1/api/admin/export/bookings?from=2026-01-01&to=2026-01-01"), genericContext);
  assert.equal(emptyGeneric.status, 200);
  assert.equal(await emptyGeneric.text(), resources.bookings.columns.map(column => `"${column}"`).join(","));
  console.log("PASS real generic export route: IST midnight cohort under Honolulu session, empty stable columns and cost-safe bookings-only export");
  for (const path of ["/api/admin/reports", "/api/admin/reports/export"]) { const denied = await fetch(`${origin}${path}?${params}&role=admin`); assert.equal(denied.status, 403); assert.ok(!(await denied.text()).includes("supplierMinor")); }
  console.log("PASS loopback HTTP: actual report routes + actual administrator/principal with synthetic session and real grant/ledger SQL, JSON/CSV reconciliation, booking-only denial");
} finally {
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  for (const route of routes) route.cleanup();
  try { if (created) await pool.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await pool.end(); }
}
