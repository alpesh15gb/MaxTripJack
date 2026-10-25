import { test, expect, departure, capture, expectNoHorizontalOverflow, type ProviderFixture } from './fixtures';
import type { Page } from '@playwright/test';

const id = '81111111-1111-4111-8111-111111111111';
const version = '92222222-2222-4222-8222-222222222222';
const nextVersion = '93333333-3333-4333-8333-333333333333';
const history = `/api/bookings/${id}/cancellation-offer`;
const submit = `/api/bookings/${id}/cancellation`;
const consent = 'I accept these cancellation charges and the estimated refund.';
const acceptedMessage = 'Cancellation terms accepted. The booking stays active until the supplier confirms cancellation.';
function trip(status = 'TICKETED', refundStatus?: string) {
  return { id, reference: 'MX-SYNTHETIC-CANCELLATION', status, product: 'FLIGHT', currency: 'INR', total_minor: '654000',
    created_at: '2026-10-01T12:00:00Z', itinerary_summary: { from: 'BOM', to: 'DEL', date: departure, adults: 1 },
    ...(refundStatus ? { refunds: [{ id: 'synthetic-refund', amountMinor: '500000', status: refundStatus }] } : {}) };
}
function offer(overrides: Record<string, unknown> = {}) {
  return { id: '94444444-4444-4444-8444-444444444444', status: 'AWAITING_ACCEPTANCE', is_partial: false,
    review_note: 'Synthetic supplier cancellation terms.', refund_offer_minor: '500000', penalty_minor: '154000',
    offer_version: version, offer_expires_at: new Date(Date.now() + 3_600_000).toISOString(), accepted_at: null, ...overrides };
}
async function openManagement(page: Page, provider: ProviderFixture, requests: unknown[]) {
  provider.bookingsPages['1'] = { hasMore: false, bookings: [trip()] };
  provider.overrides[`GET ${history}`] = { body: { requests } };
  await page.goto('/my-trips');
  await page.locator('.trip-management > summary').click();
  await expect(page.getByRole('heading', { name: 'Cancellation progress', exact: true })).toBeVisible();
}

// All transitions below are explicitly supplied by synthetic API fixtures. No
// supplier cancellation, refund or customer email is performed by this test.
test('ticketed trip requests terms, requires consent, accepts once and shows only server-reported cancellation and refund stages', async ({ page, provider }, info) => {
  await openManagement(page, provider, []);
  await expect(page.getByText('No cancellation request for this booking.', { exact: true })).toBeVisible();
  provider.overrides[`POST ${submit}`] = { status: 202, body: { message: 'Cancellation request received.' } };
  provider.overrides[`GET ${history}`] = { body: { requests: [offer()] } };
  await page.getByLabel('Reason for cancellation').fill('Synthetic change of travel plans');
  await page.getByRole('button', { name: 'Request cancellation terms', exact: true }).click();
  await expect(page.locator('.cancellation-progress')).toContainText('AWAITING ACCEPTANCE');
  expect(provider.requests(submit).filter(call => call.method === 'POST')).toHaveLength(1);
  await expect(page.locator('.cancellation-progress')).toContainText('Estimated refund: ₹5000.00');
  const accept = page.getByRole('button', { name: 'Accept cancellation terms', exact: true });
  await accept.click();
  expect(provider.requests(history).filter(call => call.method === 'POST')).toHaveLength(0);
  await page.getByLabel(consent, { exact: true }).check();
  const writes: unknown[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${history}`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postDataJSON());
    await held;
    await route.fulfill({ json: { message: acceptedMessage } });
  });
  try {
    await accept.click();
    await expect.poll(() => writes.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Accepting terms…', exact: true })).toBeDisabled();
    // Repeat submit after the pending UI commits must not produce another POST.
    await page.locator('.cancellation-progress form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(writes).toEqual([{ offerVersion: version }]);
    provider.overrides[`GET ${history}`] = { body: { requests: [offer({ accepted_at: new Date().toISOString(), status: 'SUPPLIER_PENDING' })] } };
  } finally { release(); }
  await expect(page.getByText(acceptedMessage, { exact: true })).toBeVisible();
  await expect(page.locator('.cancellation-progress')).toContainText('SUPPLIER PENDING');
  await expect(page.getByText('Terms accepted. Supplier confirmation is required before travel is cancelled.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept cancellation terms', exact: true })).toHaveCount(0);
  await expect(page.getByText('Refund completed', { exact: true })).toHaveCount(0);
  provider.overrides[`GET ${history}`] = { body: { requests: [offer({ accepted_at: new Date().toISOString(), status: 'CONFIRMED' })] } };
  await page.getByRole('button', { name: 'Refresh cancellation progress', exact: true }).click();
  await expect(page.locator('.cancellation-progress strong')).toHaveText('CONFIRMED');
  provider.bookingsPages['1'] = { hasMore: false, bookings: [trip('CANCELLED', 'PROCESSING')] };
  await page.getByRole('button', { name: 'Refresh booking updates', exact: true }).click();
  await expect(page.getByText('Refund processing', { exact: true })).toBeVisible();
  await expect(page.getByText('Refund completed', { exact: true })).toHaveCount(0);
  await capture(page, info, 'cancellation-confirmed-refund-still-processing');
  provider.bookingsPages['1'] = { hasMore: false, bookings: [trip('CANCELLED', 'COMPLETED')] };
  await page.getByRole('button', { name: 'Refresh booking updates', exact: true }).click();
  await expect(page.getByText('Refund completed', { exact: true })).toBeVisible();
  await expect(page.getByText('The payment provider reports this refund as processed. Contact support if you cannot identify it on your payment statement.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'cancellation-refund-server-reported-completion');
});

test('expired cancellation terms expose the rejection and recover by explicitly loading a fresh offer', async ({ page, provider }) => {
  await openManagement(page, provider, [offer()]);
  const rejection = 'Cancellation offer expired or changed. Ask operations for a fresh offer.';
  provider.overrides[`POST ${history}`] = { status: 409, body: { error: rejection } };
  await page.getByLabel(consent, { exact: true }).check();
  await page.getByRole('button', { name: 'Accept cancellation terms', exact: true }).click();
  await expect(page.locator('.cancellation-progress .info-message')).toContainText(rejection);
  await expect(page.getByText('Terms accepted. Supplier confirmation is required before travel is cancelled.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Refund completed', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(consent, { exact: true })).toBeEnabled();
  await page.getByLabel(consent, { exact: true }).check();
  provider.overrides[`GET ${history}`] = { body: { requests: [offer({ offer_version: nextVersion, refund_offer_minor: '400000', penalty_minor: '254000' })] } };
  await page.getByRole('button', { name: 'Refresh cancellation progress', exact: true }).click();
  await expect(page.getByLabel(consent, { exact: true })).not.toBeChecked();
  await page.getByLabel(consent, { exact: true }).check();
  provider.overrides[`POST ${history}`] = { body: { message: acceptedMessage } };
  provider.overrides[`GET ${history}`] = { body: { requests: [offer({ offer_version: nextVersion, accepted_at: new Date().toISOString() })] } };
  await page.getByRole('button', { name: 'Accept cancellation terms', exact: true }).click();
  await expect(page.getByText(acceptedMessage, { exact: true })).toBeVisible();
  expect(provider.requests(history).filter(call => call.method === 'POST').map(call => call.body)).toEqual([{ offerVersion: version }, { offerVersion: nextVersion }]);
});

test('lost acceptance response does not claim cancellation and explicit retry retains the same offer version', async ({ page, provider }, info) => {
  await openManagement(page, provider, [offer()]);
  const writes: unknown[] = [];
  await page.route(`**${history}`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postDataJSON());
    if (writes.length === 1) return route.abort('failed');
    provider.overrides[`GET ${history}`] = { body: { requests: [offer({ accepted_at: new Date().toISOString() })] } };
    await route.fulfill({ json: { message: acceptedMessage } });
  });
  await page.getByLabel(consent, { exact: true }).check();
  await page.getByRole('button', { name: 'Accept cancellation terms', exact: true }).click();
  await expect(page.locator('.cancellation-progress .info-message')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept cancellation terms', exact: true })).toBeEnabled();
  await expect(page.getByText(acceptedMessage, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Refund completed', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(consent, { exact: true })).not.toBeChecked();
  await page.getByLabel(consent, { exact: true }).check();
  await page.getByRole('button', { name: 'Accept cancellation terms', exact: true }).click();
  await expect(page.getByText(acceptedMessage, { exact: true })).toBeVisible();
  expect(writes).toEqual([{ offerVersion: version }, { offerVersion: version }]);
  await page.reload();
  await page.locator('.trip-management > summary').click();
  await expect(page.getByText('Terms accepted. Supplier confirmation is required before travel is cancelled.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept cancellation terms', exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(2);
  await capture(page, info, 'cancellation-accepted-reload-not-yet-cancelled');
});

test('expired displayed offer and programmatic unchecked submission never send acceptance', async ({ page, provider }) => {
  await openManagement(page, provider, [offer({ offer_expires_at: '2020-01-01T00:00:00Z' })]);
  await expect(page.getByLabel(consent, { exact: true })).toBeEnabled();
  await page.locator('.cancellation-progress form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(provider.requests(history).filter(call => call.method === 'POST')).toHaveLength(0);
  await page.getByLabel(consent, { exact: true }).check();
  await page.getByRole('button', { name: 'Accept cancellation terms', exact: true }).click();
  await expect(page.locator('.cancellation-progress .info-message')).toContainText('Cancellation offer expired or changed');
  expect(provider.requests(history).filter(call => call.method === 'POST')).toHaveLength(0);
  await expect(page.getByLabel(consent, { exact: true })).not.toBeChecked();
});

test('unknown acceptance keeps writes blocked when the owned offer cannot be rechecked', async ({ page, provider }) => {
  await openManagement(page, provider, [offer()]);
  let writes = 0;
  await page.route(`**${history}`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    provider.overrides[`GET ${history}`] = { status: 503, body: { error: 'Synthetic offer status unavailable.' } };
    await route.abort('failed');
  });
  await page.getByLabel(consent, { exact: true }).check();
  await page.getByRole('button', { name: 'Accept cancellation terms', exact: true }).click();
  await expect(page.getByText('Synthetic offer status unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept cancellation terms', exact: true })).toBeDisabled();
  await expect(page.getByLabel(consent, { exact: true })).toBeDisabled();
  await page.locator('.cancellation-progress form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(writes).toBe(1);
  provider.overrides[`GET ${history}`] = { body: { requests: [offer({ accepted_at: new Date().toISOString() })] } };
  await page.getByRole('button', { name: 'Retry cancellation updates', exact: true }).click();
  await expect(page.getByText('Terms accepted. Supplier confirmation is required before travel is cancelled.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept cancellation terms', exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
});
