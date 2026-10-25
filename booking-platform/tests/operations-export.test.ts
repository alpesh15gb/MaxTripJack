import test from "node:test";
import assert from "node:assert/strict";
import { resources } from "../src/lib/admin-resources";
import { reportHarness, type Harness } from "./report-harness";

const entry = "src/app/api/admin/export/[resource]/route.ts";
const request = (query = "from=2026-10-01&to=2026-10-25") => new Request(`https://maxtravel.in/api/admin/export/bookings?${query}`);
const context = { params: Promise.resolve({ resource: "bookings" }) };
for (const empty of [true, false]) test(`generic CSV has stable cost-safe columns, explicit IST and safe text (${empty ? 'empty' : 'populated'})`, async () => {
  const state: Harness = { permissions: ["bookings:read"], events: [], async query(sql, values) {
    if (sql.startsWith("INSERT")) { assert.equal((values[2] as {timezone: string}).timezone, "Asia/Kolkata"); return { rows: [] }; }
    assert.match(sql, /AT TIME ZONE 'Asia\/Kolkata'/);
    assert.match(sql, /ORDER BY created_at DESC,id DESC LIMIT 5001/);
    assert.deepEqual(values, ["2026-10-01", "2026-10-25"]);
    return { rows: empty ? [] : [{ id: "synthetic", reference: " \uFEFF＝1+1", created_at: new Date("2026-10-01T00:00:00Z"), total_minor: "9007199254740993", supplier_minor: "SECRET", extra: "SECRET" }] };
  } };
  const route = await reportHarness(entry, state);
  try {
    const response = await route.GET(request(), context);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Report-Date-Basis"), "resource_created_current_state");
    assert.equal(response.headers.get("X-Report-Timezone"), "Asia/Kolkata");
    const csv = await response.text();
    assert.equal(csv.split("\r\n")[0], resources.bookings.columns.map(c => `"${c}"`).join(","));
    assert.doesNotMatch(csv, /SECRET|supplier_minor|No records/);
    if (!empty) { assert.ok(csv.includes(`"' \uFEFF＝1+1"`)); assert.ok(csv.includes('"2026-10-01T00:00:00.000Z"')); assert.ok(csv.includes('"9007199254740993"')); }
  } finally { route.cleanup(); }
});
for (const query of ["from=2026-10-01&from=2026-10-02&to=2026-10-25", "from=2025-01-01&to=2026-10-25", "from=2026-02-30&to=2026-10-25"]) test(`generic CSV rejects invalid or oversized dates: ${query}`, async () => {
  const state: Harness = { permissions: ["bookings:read"], events: [], async query() { throw Error("No data query allowed"); } };
  const route = await reportHarness(entry, state);
  try { assert.equal((await route.GET(request(query), context)).status, 400); assert.deepEqual(state.events, ["authorize"]); } finally { route.cleanup(); }
});
test("generic CSV rejects oversized result without audit or partial download", async () => {
  const state: Harness = { permissions: ["bookings:read"], events: [], async query(sql) { assert.ok(!sql.startsWith("INSERT")); return {rows: Array.from({length:5001}, () => ({}))}; } };
  const route = await reportHarness(entry, state);
  try { assert.equal((await route.GET(request(), context)).status, 413); } finally { route.cleanup(); }
});
