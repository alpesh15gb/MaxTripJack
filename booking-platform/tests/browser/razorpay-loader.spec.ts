import type { Page, Route } from '@playwright/test';
import {mainNavigation, test, expect, openFlightSearch, bookingId, quoteId, type ProviderFixture } from './fixtures';
import { RAZORPAY_CHECKOUT_SCRIPT, RAZORPAY_CHECKOUT_LOAD_TIMEOUT } from '../../src/lib/razorpay-checkout-loader';

async function readyToPay(page: Page) {
  await openFlightSearch(page);
  await page.locator('.fare-comparison-trigger').first().click();
  await page.getByRole('button', { name: 'Check fare & continue', exact: true }).first().click();
  const form = page.getByRole('form', { name: 'Review and travellers' });
  await form.getByLabel('First name', { exact: true }).fill('Aarav');
  await form.getByLabel('Last name', { exact: true }).fill('Example');
  await form.getByLabel('Email', { exact: true }).fill('traveller@example.test');
  await form.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await expect(page.locator('#booking-review [name="consent"]')).toHaveCount(0);
  await page.locator('#booking-summary').getByRole('button', { name: /^Agree & pay / }).click();
}

async function expectExistingOrderRetry(page: Page, provider: ProviderFixture) {
  await expect(page.locator('#booking-feedback')).toContainText('Your existing payment order is preserved');
  const resume = page.getByRole('button', { name: 'Resume secure checkout', exact: true });
  await expect(resume).toBeEnabled();
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('maxtravel.pending-checkout.v1')!))).toEqual({ quoteId, bookingId });
  await resume.click();
  await expect.poll(() => page.evaluate('window.__syntheticGateway?.opens.length ?? 0')).toBe(1);
  expect(await page.evaluate('window.__syntheticGateway.opens')).toEqual(['order_SYNTHETICONLY']);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/status').at(-1)?.query).toEqual({ bookingId });
}

test('failed Razorpay script can retry the same checked order without another payment creation', async ({ page, provider }) => {
  let requests = 0;
  await page.route(RAZORPAY_CHECKOUT_SCRIPT, async route => {
    requests += 1;
    if (requests === 1) await route.abort('failed'); else await route.fallback();
  });
  await readyToPay(page);
  await expect(page.locator('#booking-feedback')).toContainText('Secure checkout could not load');
  await expectExistingOrderRetry(page, provider);
  expect(requests).toBe(2);
});

test('stalled Razorpay script reaches a deadline and an explicit retry resumes the original order', async ({ page, provider }) => {
  await page.clock.install();
  let requests = 0, held: Route | null = null;
  await page.route(RAZORPAY_CHECKOUT_SCRIPT, async route => {
    requests += 1;
    if (requests === 1) { held = route; return; }
    await route.fallback();
  });
  await readyToPay(page);
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByRole('button', { name: 'Processing…', exact: true })).toBeDisabled();
  await page.clock.fastForward(RAZORPAY_CHECKOUT_LOAD_TIMEOUT + 100);
  await expect(page.locator('#booking-feedback')).toContainText('Secure checkout took too long to load');
  // Releasing the abandoned download must not silently open checkout.
  const abandoned = held as Route | null;
  if (abandoned) await abandoned.abort('failed').catch(() => {});
  expect(await page.evaluate('window.__syntheticGateway?.opens.length ?? 0')).toBe(0);
  await expectExistingOrderRetry(page, provider);
  expect(requests).toBe(2);
});

test('a loaded script without the Razorpay API fails clearly and allows the same-order retry', async ({ page, provider }) => {
  let requests = 0;
  await page.route(RAZORPAY_CHECKOUT_SCRIPT, async route => {
    requests += 1;
    if (requests === 1) await route.fulfill({ contentType: 'application/javascript', body: 'window.__syntheticMissingCheckout = true;' });
    else await route.fallback();
  });
  await readyToPay(page);
  await expect(page.locator('#booking-feedback')).toContainText('Secure checkout could not load');
  await expectExistingOrderRetry(page, provider);
  expect(requests).toBe(2);
});

for (const phase of ['constructor', 'open'] as const) {
  test(`Razorpay ${phase} exception is contained and cannot create a duplicate order`, async ({ page, provider }) => {
    await page.route(RAZORPAY_CHECKOUT_SCRIPT, route => route.fulfill({ contentType: 'application/javascript', body: `
      (() => {
        let first = true;
        const state = window.__syntheticGateway = { opens: [] };
        window.Razorpay = class {
          constructor(options) {
            this.options = options;
            if (${JSON.stringify(phase)} === 'constructor' && first) { first = false; throw Error('Synthetic constructor failure'); }
          }
          on() {}
          open() {
            if (${JSON.stringify(phase)} === 'open' && first) { first = false; throw Error('Synthetic open failure'); }
            state.opens.push(this.options.order_id);
          }
        };
      })();
    ` }));
    await readyToPay(page);
    await expect(page.locator('#booking-feedback')).toContainText('Secure checkout could not open');
    await expectExistingOrderRetry(page, provider);
  });
}

test('a delayed SDK cannot open the old checkout after leaving its booking workspace', async ({ page, provider }) => {
  let held: Route | null = null;
  await page.route(RAZORPAY_CHECKOUT_SCRIPT, route => { held = route; });
  await readyToPay(page);
  await expect.poll(() => held !== null).toBe(true);
  await mainNavigation(page);
  await page.getByRole('banner').getByRole('link', { name: 'My Trips', exact: true }).click();
  await expect(page).toHaveURL(/\/my-trips$/);
  const delayed = held as Route | null;
  if (!delayed) throw Error('SDK request was not intercepted');
  await delayed.fulfill({ contentType: 'application/javascript', body: `
    window.__syntheticGateway = { opens: [] };
    window.Razorpay = class { constructor(options) { this.options = options; } on() {} open() { window.__syntheticGateway.opens.push(this.options.order_id); } };
  ` });
  await expect.poll(() => page.evaluate('Boolean(window.Razorpay)')).toBe(true);
  expect(await page.evaluate('window.__syntheticGateway.opens')).toEqual([]);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
});
