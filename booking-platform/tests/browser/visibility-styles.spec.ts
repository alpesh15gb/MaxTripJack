import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import type { VisibilityLedgerSnapshot } from '../../src/lib/visibility-readiness';

// Exercise the real production denial page separately from the actual client
// component fixture. No staff login, server auth bypass or live ledger is used.
test('production visibility access boundary retains its scoped layout', async ({ page }, info) => {
  const response = await page.goto('/operations/visibility');
  expect(response?.ok()).toBe(true);
  const main = page.locator('.visibility-page');
  await expect(main).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Visibility dashboard', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: /Authorised access required|Access verification unavailable/ })).toBeVisible();
  await expect(main).toContainText('No reporting data has been loaded.');
  await expect(main).toHaveCSS('background-color', 'rgb(245, 247, 250)');
  await expect(main.locator('.visibility-notice')).toHaveCSS('border-radius', '18px');
  await expect(main).toHaveCSS('padding-left', page.viewportSize()!.width <= 600 ? '16px' : '40px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`visibility-production-access-${info.project.name}.png`), fullPage: true });
});

let compiled: Promise<{ script: string; css: string }> | undefined;
function assets() {
  return compiled ??= build({
    stdin: { contents: `import {createRoot} from 'react-dom/client'; import Dashboard from './src/components/visibility-dashboard'; createRoot(document.getElementById('root')).render(<Dashboard/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    outfile: resolve('.visibility-browser-fixture/client.js'), bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', logLevel: 'silent',
    plugins: [{ name: 'fixture-link', setup(plugin) {
      plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: "import {createElement} from 'react';export default function Link(props){return createElement('a',props);}", loader: 'js', resolveDir: process.cwd() }));
    } }],
  }).then(result => ({ script: result.outputFiles.find(file => file.path.endsWith('.js'))!.text, css: result.outputFiles.find(file => file.path.endsWith('.css'))!.text }));
}

async function clientShell(page: Page) {
  const asset = await assets();
  await page.route('**/__visibility_client_fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: asset.script }));
  await page.route('**/__visibility_client_fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${asset.css}</style></head><body><div id="root"></div><script src="/__visibility_client_fixture.js"></script></body></html>` }));
}

const snapshot: VisibilityLedgerSnapshot = {
  checkedAt: '2026-10-25T12:00:00Z', environment: 'uat_only_adapter', scope: 'all_time_current_state', currency: 'INR',
  confirmedBaseBookings: '3', confirmedBaseBookingValueMinor: '1250000', capturedPayments: '4', capturedPaymentValueMinor: '1500000',
  completedRefunds: '1', completedRefundValueMinor: '50000', organicAttribution: null, productionRevenue: null, agencyNetRevenue: null,
};

test('actual visibility client shows responsive cards and removes stale values when access is lost', async ({ page }, info) => {
  await clientShell(page);
  let denied = false;
  await page.route('**/api/admin/visibility', route => route.fulfill(denied ? { status: 403, json: { error: 'Synthetic finance access revoked.' } } : { json: snapshot }));
  await page.goto('/__visibility_client_fixture');
  await expect(page.getByRole('button', { name: 'Refresh ledger' })).toBeEnabled();
  await expect(page.locator('.visibility-heading')).toHaveCSS('background-color', 'rgb(20, 45, 64)');
  const metrics = page.locator('.visibility-metrics');
  await expect(metrics).toHaveCSS('display', 'grid');
  await expect(metrics).toHaveCSS('gap', '16px');
  await expect(metrics.locator('.visibility-metric')).toHaveCount(3);
  await expect(metrics).toContainText('₹12,500.00');
  const cards = await metrics.locator('.visibility-metric').evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }));
  if (page.viewportSize()!.width <= 900) {
    expect(cards[1].y - cards[0].bottom).toBeGreaterThanOrEqual(15.5);
    expect(cards[2].y - cards[1].bottom).toBeGreaterThanOrEqual(15.5);
  } else {
    expect(Math.abs(cards[1].y - cards[0].y)).toBeLessThanOrEqual(1);
    expect(cards[1].x - cards[0].right).toBeGreaterThanOrEqual(15.5);
  }
  const table = page.getByRole('region', { name: 'Search and growth baseline' });
  await expect(table).toHaveCSS('overflow-x', 'auto');
  expect(await table.evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`visibility-client-fixture-${info.project.name}.png`), fullPage: true });
  denied = true;
  await page.getByRole('button', { name: 'Refresh ledger' }).click();
  await expect(page.getByRole('alert')).toContainText('Values are unknown, not zero.');
  await expect(metrics).toHaveCount(0);
  await expect(page.locator('.visibility-error')).toHaveCSS('background-color', 'rgb(255, 241, 240)');
  await expect(page.getByText('₹12,500.00', { exact: false })).toHaveCount(0);
});
