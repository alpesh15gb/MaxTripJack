import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";
import { reportFixture, reportRow, reportFixtureForProduct } from "../booking-report-fixture";
import type { BookingReport } from "../../src/lib/booking-report";

// Browser coverage uses the ACTUAL client component with a bundled fixture shell.
// The production server page's actual authorization boundary is tested separately.
// No production authentication bypass, provider call or customer transaction exists.
let compiled: Promise<{ script: string; css: string }> | undefined;
function assets() {
  return compiled ??= build({
    stdin: { contents: `import {createRoot} from 'react-dom/client'; import Reports from './src/components/booking-reports'; import './src/app/operations/reports/reports.css'; createRoot(document.getElementById('root')).render(<Reports/>);`, resolveDir: process.cwd(), loader: "tsx" },
    outfile: resolve(".report-browser-fixture/client.js"), bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent",
    plugins: [{ name: "fixture-link", setup(plugin) {
      plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import {createElement} from 'react';export default function Link(props){return createElement('a',props);}", loader: "js", resolveDir: process.cwd() }));
    } }],
  }).then(result => ({ script: result.outputFiles.find(file => file.path.endsWith(".js"))!.text, css: result.outputFiles.find(file => file.path.endsWith(".css"))!.text }));
}
async function shell(page: Page) {
  const asset = await assets();
  await page.route("**/__report_client_fixture.js", route => route.fulfill({ contentType: "text/javascript", body: asset.script }));
  await page.route("**/operations/reports**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}${asset.css}</style></head><body><div id="root"></div><script src="/__report_client_fixture.js"></script></body></html>` }));
}
function fixture(product = "ALL"): BookingReport {
  return reportFixtureForProduct(product === "HOTEL" ? "HOTEL" : product === "FLIGHT" ? "FLIGHT" : "ALL");
}
test("reports keep draft filters separate, export the applied whole cohort, and fit mobile", async ({ page }, testInfo) => {
  await shell(page);
  const requests: URL[] = [];
  await page.route("**/api/admin/reports?**", route => { const url = new URL(route.request().url()); requests.push(url); return route.fulfill({ json: fixture(url.searchParams.get("product") ?? "ALL") }); });
  let exportUrl: URL | undefined;
  await page.route("**/api/admin/reports/export?**", route => { exportUrl = new URL(route.request().url()); return route.fulfill({ contentType: "text/csv", body: '"booking_reference"\r\n"SYNTHETIC-HOTEL-REPORT"' }); });
  await page.goto("/operations/reports?from=2026-10-23&to=2026-10-23");
  await expect(page.getByRole("heading", { name: "Know where every booking stands." })).toBeVisible();
  await expect(page.getByText(reportRow.reference, { exact: true })).toBeVisible();
  await expect(page.getByText("Current state, not period cash flow.", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Product", exact: true }).selectOption("HOTEL");
  await expect(page.getByText(/You have unapplied changes/)).toBeVisible();
  expect(requests).toHaveLength(1);
  await expect(page.getByLabel("Applied report filters")).toContainText("All products");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByText("SYNTHETIC-HOTEL-REPORT", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Applied report filters")).toContainText("hotel products");
  const rows = page.getByRole("region", { name: "Booking report rows", exact: true });
  const reference = rows.getByText("SYNTHETIC-HOTEL-REPORT", { exact: true });
  await expect(rows.getByText("confirmed", { exact: true })).toBeVisible();
  await expect(rows.getByText("ticketed", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^confirmed 1$/i })).toBeVisible();
  await expect(rows.getByRole("table", { name: "Booking-level reconciliation", exact: true })).toBeVisible();
  await page.getByText("View breakdown", { exact: true }).click();
  await expect(page.getByText("Quoted supplier cost", { exact: true })).toBeVisible();
  // Visibility alone passes for a horizontally clipped table. Check the actual
  // identity bounds and row scroll area after expansion, without resetting scroll.
  if ((page.viewportSize()?.width ?? 1440) <= 600) {
    const identityFits = () => reference.evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= window.innerWidth; });
    await expect.poll(identityFits).toBe(true);
    expect(await rows.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(rows.getByRole("rowheader", { name: /SYNTHETIC-HOTEL-REPORT/ })).toHaveCount(1);
    const details = rows.locator("details");
    await rows.getByText("View breakdown", { exact: true }).press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
    await expect.poll(identityFits).toBe(true);
    await rows.getByText("View breakdown", { exact: true }).press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect.poll(identityFits).toBe(true);
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full cohort CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("maxtravel-booking-cohort-2026-10-23-2026-10-23.csv");
  expect(exportUrl?.searchParams.get("product")).toBe("HOTEL"); expect(exportUrl?.searchParams.has("cursor")).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("booking-reports-cohort.png"), fullPage: true });
});
test("a newer applied cohort wins a slow response; revoked access clears all financial results", async ({ page }) => {
  await shell(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const pending = new Promise<void>(resolve => { started = resolve; });
  let routeSettled!: () => void;
  const obsoleteSettled = new Promise<void>(resolve => { routeSettled = resolve; });
  let denied = false;
  await page.route("**/api/admin/reports?**", async route => {
    if (denied) { await route.fulfill({ status: 403, json: { error: "Finance permission was revoked." } }); return; }
    const product = new URL(route.request().url()).searchParams.get("product") ?? "ALL";
    if (product === "ALL") { started(); await delayed; }
    try { await route.fulfill({ json: fixture(product) }); }
    catch { /* An obsolete request was aborted. */ }
    finally { if (product === "ALL") routeSettled(); }
  });
  await page.goto("/operations/reports?from=2026-10-23&to=2026-10-23"); await pending;
  await page.getByRole("combobox", { name: "Product", exact: true }).selectOption("HOTEL"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByText("SYNTHETIC-HOTEL-REPORT", { exact: true })).toBeVisible();
  release();
  await obsoleteSettled;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page.getByText("SYNTHETIC-HOTEL-REPORT", { exact: true })).toBeVisible();
  await expect(page.getByText(reportRow.reference, { exact: true })).toHaveCount(0);
  denied = true;
  await page.getByRole("button", { name: "Refresh report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Report unavailable", exact: true })).toBeVisible();
  await expect(page.getByText("SYNTHETIC-HOTEL-REPORT", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Cohort totals")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export full cohort CSV", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Values are unknown, not zero");
});
test("empty and invalid report filters never masquerade as failed or successful revenue", async ({ page }) => {
  await shell(page);
  let calls = 0;
  await page.route("**/api/admin/reports?**", route => {
    calls++;
    return route.fulfill({ json: { ...reportFixture, rows: [], statuses: [], scopes: [], totals: Object.fromEntries(Object.keys(reportFixture.totals).map(key => [key, "0"])) } });
  });
  await page.goto("/operations/reports?from=2026-02-30&to=2026-03-01");
  await expect(page.getByRole("alert")).toContainText("Choose valid start and end dates"); expect(calls).toBe(0);
  await page.getByLabel("Created from (IST)").fill("2026-10-23"); await page.getByLabel("Created through (IST)").fill("2026-10-23");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No bookings match this view.", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(calls).toBe(1);
});
