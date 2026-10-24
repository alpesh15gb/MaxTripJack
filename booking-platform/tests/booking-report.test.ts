import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import BookingReportRows from "../src/components/booking-report-rows";
import { defaultReportFilters, parseReportFilters, reportParams } from "../src/lib/booking-report";
import { bookingReportQuery } from "../src/lib/booking-report-query";
import { bookingReportCsv, reportCsvCell, reportInrDecimal } from "../src/lib/booking-report-csv";
import { reportHarness, type Harness } from "./report-harness";
import { reportFixture, reportRow, databaseReport, reportFixtureForProduct } from "./booking-report-fixture";

test("synthetic hotel confirmation and status buckets agree; responsive rows share one identity and financial record", () => {
  for (const product of ["ALL", "FLIGHT", "HOTEL"] as const) {
    const fixture = reportFixtureForProduct(product), row = fixture.rows[0];
    assert.equal(row.status, row.product === "HOTEL" ? "CONFIRMED" : "TICKETED");
    assert.deepEqual(fixture.statuses, [{ status: row.status, count: fixture.totals.orders }]);
    assert.equal(row.totalMinor, fixture.totals.confirmedBaseValueMinor);
    assert.equal(row.capturedMinor, fixture.totals.capturedMinor);
    const html = renderToStaticMarkup(createElement(BookingReportRows, { rows: fixture.rows }));
    assert.equal(html.split(row.reference).length - 1, 1, "one responsive row, not duplicate mobile/desktop copies");
    assert.equal(html.split('role="rowheader"').length - 1, 1);
    assert.match(html, /role="table"/); assert.match(html, /role="columnheader"/);
    assert.ok(html.indexOf(row.reference) < html.indexOf('class="reports-row-status"'));
    assert.match(html, /<summary>View breakdown<\/summary>/);
    assert.match(html, /Quoted supplier cost/); assert.ok(html.includes(row.id));
    assert.match(html, /reports-cell-label" aria-hidden="true">Order value/);
  }
});

test("strict IST creation dates, enum filters and inclusive 366-day ceiling", () => {
  assert.deepEqual(defaultReportFilters(new Date("2026-10-31T19:00Z")), { from: "2026-11-01", to: "2026-11-01", product: "ALL", status: "ALL", scope: "ALL" });
  const parse = (input: string) => parseReportFilters(new URLSearchParams(input));
  assert.equal(parse("from=2024-01-01&to=2024-12-31").to, "2024-12-31");
  for (const input of ["from=2024-01-01&to=2025-01-01", "from=2026-02-30&to=2026-03-01", "from=2026-10-24&to=2026-10-23", "from=2026-10-23", "from=&to=", "from=2026-10-23&from=2026-10-24&to=2026-10-24", "product=CAR", "status=PAID&status=FAILED", "scope=BASE&scope=ALL", "role=admin", "companyId=other"]) assert.throws(() => parse(input), input);
});
test("query preserves confirmation/currency boundaries, no private columns, and shared full-cohort aggregates", () => {
  const filters = { ...reportFixture.filters, cursor: { createdAt: reportRow.createdAt, id: reportRow.id } };
  assert.deepEqual(parseReportFilters(reportParams(filters, filters.cursor)), filters);
  const page = bookingReportQuery(filters), csv = bookingReportQuery(filters, true);
  assert.deepEqual(page.values.slice(0, 5), csv.values);
  assert.deepEqual(page.values.slice(5), [reportRow.createdAt, reportRow.id]);
  assert.match(page.sql, /AT TIME ZONE 'Asia\/Kolkata'/);
  assert.match(page.sql, /created_at,id\) < \(\$6::timestamptz,\$7::uuid\)/);
  assert.match(page.sql, /SS.US/); assert.match(page.sql, /LIMIT 51/); assert.match(csv.sql, /LIMIT 5001/);
  for (const required of ["p.currency=o.currency", "o.currency='INR'", "p.currency='INR'", "p.amount_minor=o.total_minor", "e.event_type='booking.confirmed'", "o.parent_order_id IS NULL", "o.service_kind IS NULL", "r.status='COMPLETED'", "r.status IN ('REQUESTED','APPROVED','PROCESSING')"]) assert.ok(page.sql.includes(required), required);
  assert.doesNotMatch(page.sql, /guests_encrypted|itinerary_summary|policy_snapshot|delivered_at|Number\(/);
  assert.match(page.sql, /FROM facts\) AS totals/); assert.match(page.sql, /FROM page\) AS rows/);
  assert.throws(() => parseReportFilters(reportParams(filters, filters.cursor), new Date(), false));
});
test("CSV has stable columns, complete filters, exact money and formula/control escaping", () => {
  const csv = bookingReportCsv({ ...reportFixture, rows: [{ ...reportRow, reference: '=HYPERLINK("synthetic")', totalMinor: "9007199254740993123" }] });
  assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes('"9007199254740993123"')); assert.ok(csv.includes('"filter_product","filter_status","filter_scope"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""synthetic"")"'));
  const empty = bookingReportCsv({ ...reportFixture, rows: [] }); assert.equal(empty, csv.split("\r\n")[0]);
  for (const value of ["=1", "+1", "-1", "@x", "\t=1", "\r=1", "\n=1", "  =1", "＝1", "＋1", "－1", "＠1"]) assert.ok(reportCsvCell(value).startsWith('"\''), value);
  assert.equal(reportCsvCell('name, "value"'), '"name, ""value"""');
  assert.equal(reportInrDecimal("9007199254740993123"), "90071992547409931.23");
  assert.equal(reportInrDecimal("1"), "0.01"); assert.equal(reportInrDecimal("0"), "0.00");
  assert.ok(csv.includes('"90071992547409931.23"')); assert.ok(csv.includes('"order_value_inr"'));
});
for (const exporting of [false, true]) {
  const entry = exporting ? "src/app/api/admin/reports/export/route.ts" : "src/app/api/admin/reports/route.ts";
  for (const denied of [401, 403, 503, 0]) test(`${exporting ? 'CSV' : 'JSON'} denies ${denied || 'booking-only'} before financial query`, async () => {
    const state: Harness = { permissions: ["bookings:read"], denied: denied || undefined, events: [], async query() { throw Error("No report query authorized"); } };
    const route = await reportHarness(entry, state);
    try { const response = await route.GET(new Request("https://maxtravel.in/api/admin/reports?role=admin")); assert.equal(response.status, denied || 403); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.ok(!state.events.includes("query")); } finally { route.cleanup(); }
  });
  test(`${exporting ? 'CSV' : 'JSON'} authorizes finance before exact query and preserves bigint`, async () => {
    const huge = "9007199254740993123";
    const state: Harness = { permissions: ["finance:read"], events: [], async query(sql, values) {
      if (sql.startsWith("INSERT INTO audit_events")) { assert.equal(exporting, true); return { rows: [] }; }
      assert.match(sql, /supplier_minor/); assert.deepEqual(values, ["2026-10-23", "2026-10-23", "ALL", "ALL", "ALL"]);
      const data = databaseReport([{ ...reportRow, totalMinor: huge }]);
      return { rows: [{ ...data, totals: { ...data.totals, orderValueMinor: huge } }] };
    } };
    const route = await reportHarness(entry, state);
    try { const response = await route.GET(new Request(`https://maxtravel.in/api/admin/reports?${reportParams(reportFixture.filters)}`)); assert.equal(response.status, 200); assert.equal(state.events[0], "authorize"); assert.ok((await response.text()).includes(huge)); if (exporting) { assert.equal(response.headers.get("x-report-timezone"), "Asia/Kolkata"); assert.ok(response.headers.get("x-report-filters")?.includes("scope=ALL")); } } finally { route.cleanup(); }
  });
}
test("page continuation retains microseconds and summary covers the full cohort", async () => {
  const state: Harness = { permissions: ["finance:read"], events: [], async query() { const data = databaseReport(Array.from({ length: 51 }, () => reportRow)); return { rows: [{ ...data, totals: { ...data.totals, orders: "9000" } }] }; } };
  const route = await reportHarness("src/app/api/admin/reports/route.ts", state);
  try { const response = await route.GET(new Request("https://maxtravel.in/api/admin/reports")); const body = await response.json(); assert.equal(body.rows.length, 50); assert.equal(body.totals.orders, "9000"); assert.deepEqual(body.nextCursor, { createdAt: reportRow.createdAt, id: reportRow.id }); } finally { route.cleanup(); }
});
test("CSV refuses 5001 rows before an audit/download rather than truncating", async () => {
  const state: Harness = { permissions: ["finance:read"], events: [], async query(sql) { assert.ok(!sql.startsWith("INSERT")); return { rows: [databaseReport(Array.from({ length: 5001 }, () => reportRow))] }; } };
  const route = await reportHarness("src/app/api/admin/reports/export/route.ts", state);
  try { const response = await route.GET(new Request("https://maxtravel.in/api/admin/reports/export")); assert.equal(response.status, 413); assert.match((await response.json()).error, /5,000/); } finally { route.cleanup(); }
});
test("invalid filters never run a report query; database failure is not a zero report", async () => {
  const state: Harness = { permissions: ["finance:read"], events: [], async query() { throw Error("Synthetic database failure"); } };
  const route = await reportHarness("src/app/api/admin/reports/route.ts", state);
  try { assert.equal((await route.GET(new Request("https://maxtravel.in/api/admin/reports?product=CAR"))).status, 400); assert.ok(!state.events.includes("query")); const response = await route.GET(new Request("https://maxtravel.in/api/admin/reports")); assert.equal(response.status, 500); assert.equal((await response.json()).totals, undefined); } finally { route.cleanup(); }
});
for (const denied of [401, 403, 503, 0]) test(`server report page ${denied || 'authorized'} guards before private component render`, async () => {
  const state: Harness = { permissions: ["finance:read"], denied: denied || undefined, events: [], async query() { throw Error("Server shell never queries reports"); } };
  const route = await reportHarness("src/app/operations/reports/page.tsx", state);
  try { const html = renderToStaticMarkup(await route.default()); assert.equal(html.includes("SYNTHETIC_PRIVATE_REPORTS"), !denied); assert.equal(state.events.includes("render"), !denied); assert.ok(!state.events.includes("query")); if (denied) assert.match(html, /No reporting data has been loaded/); } finally { route.cleanup(); }
});
