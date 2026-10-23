import test from "node:test";
import assert from "node:assert/strict";
import { resources } from "../src/lib/admin-resources";
import { reportHarness, type Harness } from "./report-harness";

for (const exported of [false, true]) {
  const entry = exported ? "src/app/api/admin/export/[resource]/route.ts" : "src/app/api/admin/[resource]/route.ts";
  test(`booking-read ${exported ? 'CSV' : 'JSON'} never selects supplier cost, including role query spoofing`, async () => {
    const state: Harness = { permissions: ["bookings:read"], events: [], async query(sql) {
      if (sql.startsWith("INSERT INTO audit_events")) return { rows: [] };
      assert.doesNotMatch(sql, /supplier_minor/);
      return { rows: [{ id: "synthetic-booking", reference: "SYNTHETIC", total_minor: "10000" }] };
    } };
    const route = await reportHarness(entry, state);
    try {
      const response = await route.GET(new Request("https://maxtravel.in/api/admin/bookings?from=2026-10-01&to=2026-10-23&permission=finance:read"), { params: Promise.resolve({ resource: "bookings" }) });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.doesNotMatch(await response.text(), /supplier_minor/);
      assert.equal(state.events[0], "authorize");
    } finally { route.cleanup(); }
  });
  for (const resource of ["__proto__", "constructor", "toString"]) {
    test(`${exported ? 'export' : 'list'} rejects inherited resource ${resource} before authorization/query`, async () => {
      const state: Harness = { permissions: [], events: [], async query() { throw Error("Database must not be touched"); } };
      const route = await reportHarness(entry, state);
      try {
        const response = await route.GET(new Request("https://maxtravel.in/api/admin/invalid"), { params: Promise.resolve({ resource }) });
        assert.equal(response.status, 404); assert.deepEqual(state.events, []);
      } finally { route.cleanup(); }
    });
  }
}
test("financial resources still require their existing permission", () => {
  assert.equal(resources.payments.permission, "finance:read");
  assert.equal(resources.bookings.permission, "bookings:read");
});
