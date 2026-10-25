import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

// Bundle the ACTUAL route/page against deterministic boundary doubles. No DB,
// real session, remote browser, provider or payment operation is involved.
type HarnessState = {
  deniedStatus: number | null; events: string[]; dashboardRenders: number;
  requestCookie?: string; permission?: string; sql?: string;
};
let serial = 0;
const require = createRequire(import.meta.url);

async function harness(entry: string, deniedStatus: number | null = null) {
  const key = `__visibility_test_${++serial}`;
  const state: HarnessState = { deniedStatus, events: [], dashboardRenders: 0 };
  (globalThis as unknown as Record<string, unknown>)[key] = state;
  const stateSource = `const state = globalThis[${JSON.stringify(key)}];`;
  const mocks: Record<string, string> = {
    "@/lib/access": `${stateSource}
      import { HttpError } from ${JSON.stringify(resolve("src/lib/http.ts"))};
      export async function administrator(request, permission) {
        state.events.push("authorize"); state.permission = permission; state.requestCookie = request.headers.get("cookie");
        if (state.deniedStatus !== null) throw new HttpError(state.deniedStatus, "Synthetic access denied");
        return { userId: "synthetic-authorized-admin", companyId: null };
      }`,
    "@/lib/visibility-ledger": `${stateSource}
      export async function readVisibilityLedger() {
        state.events.push("ledger");
        if (state.deniedStatus !== null) throw new Error("Ledger touched before permission check");
        return { confirmedBaseBookings: "3", productionRevenue: null, organicAttribution: null };
      }`,
    "@/components/visibility-dashboard": `${stateSource}
      export default function Dashboard() { state.dashboardRenders++; return "SYNTHETIC_PRIVATE_DASHBOARD"; }`,
    "next/headers": `export async function headers() { return new Headers({ cookie: "synthetic-session-cookie" }); }`,
    "next/navigation": `export function unstable_rethrow(error) { if (error?.digest?.startsWith("NEXT_")) throw error; }`,
    "next/link": `export default function Link(props) { return props.children; }`,
    "server-only": "",
    "./db": `${stateSource}
      export function database() { return { async query(sql) {
        state.events.push("query"); state.sql = sql;
        return { rows: [{ checked_at: new Date("2026-10-20T21:00:00Z"), confirmed_count: "2", confirmed_value: "9007199254740993123", captured_count: "4", captured_value: "9007199254740993999", refunded_count: "1", refunded_value: "100" }] };
      } }; }`,
  };
  try {
    const result = await build({
      entryPoints: [resolve(entry)], bundle: true, platform: "node", format: "cjs", packages: "external", write: false, logLevel: "silent",
      plugins: [{ name: "visibility-boundary-doubles", setup(plugin) {
        plugin.onResolve({ filter: /.*/ }, args => {
          if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "mock" };
          if (args.path.endsWith(".css")) return { path: args.path, namespace: "css-mock" };
        });
        plugin.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /.*/, namespace: "css-mock" }, () => ({ contents: "export default {};", loader: "js" }));
      } }],
    });
    const compiled = { exports: {} as Record<string, unknown> };
    new Function("module", "exports", "require", result.outputFiles[0].text)(compiled, compiled.exports, require);
    return { exports: compiled.exports, state, cleanup: () => { delete (globalThis as unknown as Record<string, unknown>)[key]; } };
  } catch (error) {
    delete (globalThis as unknown as Record<string, unknown>)[key]; throw error;
  }
}

for (const status of [401, 403, 503]) {
  test(`visibility API denies ${status} before any ledger read and disables caching`, async () => {
    const { exports, state, cleanup } = await harness("src/app/api/admin/visibility/route.ts", status);
    try {
      const GET = exports.GET as (request: Request) => Promise<Response>;
      const response = await GET(new Request("https://maxtravel.in/api/admin/visibility", { headers: { cookie: "synthetic-session-cookie" } }));
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(state.events, ["authorize"]);
      assert.equal(state.permission, "finance:read");
      assert.equal(state.requestCookie, "synthetic-session-cookie");
      assert.deepEqual(await response.json(), { error: "Synthetic access denied" });
      assert.deepEqual(Object.keys(exports), ["GET"], "Dashboard endpoint must not offer mutation handlers");
    } finally { cleanup(); }
  });
}

test("visibility API reads one aggregate only after finance authorization and never grants by query input", async () => {
  const { exports, state, cleanup } = await harness("src/app/api/admin/visibility/route.ts");
  try {
    const GET = exports.GET as (request: Request) => Promise<Response>;
    const response = await GET(new Request("https://maxtravel.in/api/admin/visibility?role=admin&permission=all&userId=someone-else"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(state.events, ["authorize", "ledger"]);
    assert.equal(state.permission, "finance:read");
    const body = await response.json();
    assert.equal(body.confirmedBaseBookings, "3");
    assert.equal(body.productionRevenue, null);
  } finally { cleanup(); }
});

for (const status of [401, 403, 503]) {
  test(`visibility server page does not render private dashboard on ${status}`, async () => {
    const { exports, state, cleanup } = await harness("src/app/operations/visibility/page.tsx", status);
    try {
      const page = exports.default as () => Promise<ReactNode>;
      const html = renderToStaticMarkup(await page());
      assert.deepEqual(state.events, ["authorize"]);
      assert.equal(state.permission, "finance:read");
      assert.equal(state.requestCookie, "synthetic-session-cookie");
      assert.equal(state.dashboardRenders, 0);
      assert.ok(!html.includes("SYNTHETIC_PRIVATE_DASHBOARD"));
      assert.ok(html.includes("No reporting data has been loaded."));
      assert.ok(html.includes('class="visibility-page"'));
      assert.ok(html.includes('class="visibility-notice"'));
      assert.deepEqual((exports.metadata as { robots: unknown }).robots, { index: false, follow: false });
    } finally { cleanup(); }
  });
}

test("visibility server page mounts dashboard only after finance authorization", async () => {
  const { exports, state, cleanup } = await harness("src/app/operations/visibility/page.tsx");
  try {
    const page = exports.default as () => Promise<ReactNode>;
    const html = renderToStaticMarkup(await page());
    assert.deepEqual(state.events, ["authorize"]);
    assert.equal(state.dashboardRenders, 1);
    assert.ok(html.includes("SYNTHETIC_PRIVATE_DASHBOARD"));
  } finally { cleanup(); }
});

test("ledger is aggregate-only, exact bigint, and separates captured payment from confirmed booking", async () => {
  const { exports, state, cleanup } = await harness("src/lib/visibility-ledger.ts");
  try {
    const read = exports.readVisibilityLedger as () => Promise<Record<string, unknown>>;
    const value = await read();
    assert.deepEqual(state.events, ["query"]);
    const sql = state.sql ?? "";
    for (const condition of ["o.service_kind IS NULL", "o.parent_order_id IS NULL", "o.product='FLIGHT' AND o.status='TICKETED'", "o.product='HOTEL' AND o.status='CONFIRMED'", "e.event_type='booking.confirmed'", "p.status='CAPTURED'", "p.currency=o.currency", "p.amount_minor=o.total_minor", "r.status='COMPLETED'"]) {
      assert.ok(sql.includes(condition), `Required authoritative condition: ${condition}`);
    }
    assert.ok(sql.includes("EXISTS"), "Outbox retries may not multiply a conversion");
    assert.ok(!/\b(?:email|passport|phone|pnr|payload|travellers|user_id|company_id)\b/i.test(sql), "No private row-level data selected");
    assert.equal(value.confirmedBaseBookingValueMinor, "9007199254740993123", "Never coerce financial bigints to lossy Number");
    assert.equal(value.capturedPaymentValueMinor, "9007199254740993999");
    assert.equal(value.productionRevenue, null);
    assert.equal(value.agencyNetRevenue, null);
    assert.equal(value.organicAttribution, null);
    assert.equal(value.environment, "uat_only_adapter");
    assert.equal(value.scope, "all_time_current_state");
    assert.equal(value.checkedAt, "2026-10-20T21:00:00.000Z");
  } finally { cleanup(); }
});
