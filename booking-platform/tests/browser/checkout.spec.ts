import type { Page } from '@playwright/test';
import { test, expect, bookingId, capture, departure, returning, expectNoHorizontalOverflow, flight, flightResults, openFlightSearch, quoteId, reviewedQuote, searchId, syntheticSession } from './fixtures';

async function selectVisibleFare(page: Page) {
  await page.locator('.fare-comparison > summary').first().click();
  await page.getByRole('button', { name: 'Select fare', exact: true }).first().click();
}

async function openReviewedFlight(page: Page) {
  await openFlightSearch(page);
  await selectVisibleFare(page);
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toBeVisible();
}

async function fillDomesticTraveller(page: Page) {
  const form = page.getByRole('form', { name: 'Review and travellers' });
  await form.getByLabel('First name', { exact: true }).fill('Aarav');
  await form.getByLabel('Last name', { exact: true }).fill('Example');
  await form.getByLabel('Email', { exact: true }).fill('traveller@example.test');
  await form.getByLabel('Indian mobile number', { exact: true }).fill('9876543210');
}

async function showPaymentReview(page: Page) {
  await fillDomesticTraveller(page);
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your total, before you pay.', exact: true })).toBeVisible();
}

async function openSyntheticPayment(page: Page) {
  await page.getByRole('checkbox', { name: /I accept the reviewed total and supplier rules/ }).check();
  await page.getByRole('button', { name: /^Pay .* securely$/ }).click();
  await expect.poll(() => page.evaluate('window.__syntheticGateway.opens.length')).toBe(1);
}

test('fare comparison selects a server fare id and shows a reviewed party total', async ({ page, provider }, testInfo) => {
  await openFlightSearch(page);
  await page.locator('.fare-comparison > summary').first().click();
  await expect(page.getByText('Cabin baggage: 7 Kg', { exact: true })).toBeVisible();
  await expect(page.getByText('Checked baggage: 15 Kg', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'fare-comparison');
  await page.getByRole('button', { name: 'Select fare', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toBeVisible();
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')[0].body).toEqual({ searchId, priceIds: ['onward-standard'] });
  await expect(page.getByRole('complementary', { name: 'Your journey summary' })).toContainText('₹6,540');
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'traveller-review');
});

test('return journeys require one outbound and one return fare in canonical order', async ({ page, provider }) => {
  provider.search = flightResults(true);
  provider.quote = reviewedQuote({ totalMinor: 1308000, summary: { from: 'BOM', to: 'DEL', date: departure, returnDate: returning, adults: 1 } });
  await openFlightSearch(page, { roundTrip: true });
  await expect(page.getByRole('button', { name: /Review selected journey \(0\/2\)/ })).toBeDisabled();
  await selectVisibleFare(page);
  await expect(page.getByRole('button', { name: /^Return/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Review selected journey \(1\/2\)/ })).toBeDisabled();
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  await selectVisibleFare(page);
  await page.getByRole('button', { name: /Review selected journey \(2\/2\)/ }).click();
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toBeVisible();
  expect(provider.requests('/api/travel/review')[0].body).toEqual({ searchId, priceIds: ['onward-standard', 'return-standard'] });
});

test('domestic adult documents remain optional rather than blocking checkout', async ({ page, provider }) => {
  await openReviewedFlight(page);
  const form = page.getByRole('form', { name: 'Review and travellers' });
  await expect(form.locator('[name="dob-0"]')).not.toBeVisible();
  await expect(form.locator('[name="passport-0"]')).not.toBeVisible();
  await expect(form.locator('[name="passport-0"]')).not.toHaveAttribute('required');
  await showPaymentReview(page);
  await expect(page.getByRole('button', { name: /^Pay .* securely$/ })).toBeEnabled();
  // Reaching payment review must not itself create a gateway order.
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await page.getByRole('button', { name: 'Back to travellers', exact: true }).click();
  await expect(form.getByLabel('First name', { exact: true })).toHaveValue('Aarav');
  await expect(form.getByLabel('Email', { exact: true })).toHaveValue('traveller@example.test');
});

test('supplier-required documents, GST and emergency details are visible and required', async ({ page, provider }, testInfo) => {
  provider.quote = reviewedQuote({ review: { conditions: { pcs: { pm: true, pped: true }, dob: { adobr: true }, ipa: true, gst: { igm: true }, iecr: true } } });
  await openReviewedFlight(page);
  const form = page.getByRole('form', { name: 'Review and travellers' });
  for (const name of ['dob-0', 'passport-0', 'expiry-0', 'nationality-0', 'pan-0', 'gstNumber', 'gstName', 'emergencyName', 'emergencyEmail', 'emergencyPhone']) {
    await expect(form.locator(`[name="${name}"]`)).toBeVisible();
    await expect(form.locator(`[name="${name}"]`)).toHaveAttribute('required', '');
  }
  await fillDomesticTraveller(page);
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your total, before you pay.', exact: true })).toHaveCount(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'supplier-required-documents');
});

test('expired quotes block payment and refresh explicitly without losing traveller details', async ({ page, provider }, testInfo) => {
  provider.quote = reviewedQuote({ expiresAt: new Date(Date.now() - 60_000).toISOString() });
  await openReviewedFlight(page);
  await fillDomesticTraveller(page);
  await expect(page.getByText('A fresh price review is required', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to payment', exact: true })).toBeDisabled();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await capture(page, testInfo, 'expired-quote');
  provider.quote = reviewedQuote({ quoteId: '44444444-4444-4444-8444-444444444444', totalMinor: 724000 });
  await page.getByRole('button', { name: 'Refresh reviewed price', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to payment', exact: true })).toBeEnabled();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Aarav');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('traveller@example.test');
  await expect(page.getByRole('complementary', { name: 'Your journey summary' })).toContainText('₹7,240');
  expect(provider.requests('/api/travel/review')).toHaveLength(2);
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /I accept the reviewed total/ })).not.toBeChecked();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('dismissing and resuming payment reuses the same order and never claims confirmation', async ({ page, provider }, testInfo) => {
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'payment-review-before-checkout');
  await openSyntheticPayment(page);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')[0].body).toMatchObject({ quoteId, acceptedTotalMinor: 654000,
    guests: { email: 'traveller@example.test', phone: '9876543210', travellers: [{ pt: 'ADULT', fN: 'Aarav', lN: 'Example' }] },
  });
  await page.evaluate('window.__syntheticGateway.dismiss()');
  await expect(page.getByRole('alert')).toContainText('Checkout closed. Your payment order is preserved.');
  await page.getByRole('button', { name: 'Resume secure checkout', exact: true }).click();
  await expect.poll(() => page.evaluate('window.__syntheticGateway.opens')).toEqual(['order_SYNTHETICONLY', 'order_SYNTHETICONLY']);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/verify')).toHaveLength(0);
  expect(provider.requests('/api/payments/status')).toHaveLength(1);
  expect(provider.requests('/api/payments/status')[0].query).toEqual({ bookingId });
  await page.evaluate('window.__syntheticGateway.dismiss()');
  await expect(page).toHaveURL(/\/book\?/);
  await expect(page.getByRole('button', { name: /View confirmation details/ })).toHaveCount(0);
  await capture(page, testInfo, 'payment-dismissed');
});

test('uncertain verification directs to status without another payment or fake ticket', async ({ page, provider }, testInfo) => {
  provider.overrides['POST /api/payments/verify'] = { status: 409, body: { error: 'Payment is not captured yet. Await verified gateway update.' } };
  provider.overrides['GET /api/bookings'] = { body: { bookings: [{
    id: bookingId, reference: 'MX-SYNTHETIC-PENDING', product: 'FLIGHT', status: 'PAYMENT_PENDING', currency: 'INR', total_minor: '654000', created_at: new Date().toISOString(),
    itinerary_summary: { from: 'BOM', to: 'DEL', date: departure, adults: 1 },
  }], hasMore: false } };
  provider.overrides[`GET /api/bookings/${bookingId}/cancellation-offer`] = { body: { requests: [] } };
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await openSyntheticPayment(page);
  await page.evaluate('window.__syntheticGateway.complete()');
  await expect(page.getByRole('alert')).toContainText('Check My trips before attempting another payment.');
  await expect(page.getByRole('button', { name: 'Resume secure checkout', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Pay .* securely$/ })).toHaveCount(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/verify')).toHaveLength(1);
  await capture(page, testInfo, 'payment-verification-uncertain');
  await page.getByRole('link', { name: 'Check payment status in My trips', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/my-trips');
  await expect(page.getByText('MX-SYNTHETIC-PENDING', { exact: true })).toBeVisible();
  await expect(page.getByText('Payment being checked', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /View confirmation details/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Download confirmation/i })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'my-trips-payment-pending');
});

test('supplier review-required errors do not automatically repeat payment creation', async ({ page, provider }) => {
  provider.overrides['POST /api/payments/create'] = { status: 409, body: { error: 'Price changed. Accept the latest review.' } };
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await page.getByRole('checkbox', { name: /I accept the reviewed total/ }).check();
  await page.getByRole('button', { name: /^Pay .* securely$/ }).click();
  await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('Price changed. Accept the latest review.');
  await expect(page.getByRole('button', { name: 'Refresh reviewed price', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pay .* securely$/ })).toBeDisabled();
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/verify')).toHaveLength(0);
  expect(await page.evaluate('window.__syntheticGateway.opens.length')).toBe(0);
});

test('unknown local-time duration is not guessed and COMBO journeys are not connecting stops', async ({ page, provider }) => {
  const unknownDuration = flight();
  unknownDuration.sI[0].duration = 0;
  provider.search = { searchId, results: { searchResult: { tripInfos: { ONWARD: [unknownDuration] } } } };
  await openFlightSearch(page);
  await expect(page.getByText('Times shown in local airport time', { exact: true })).toBeVisible();
  const combo = { ...flight(), sI: [...flight().sI, ...flight('RETURN').sI] };
  provider.search = { searchId, results: { searchResult: { tripInfos: { COMBO: [combo] } } } };
  await openFlightSearch(page, { roundTrip: true });
  await expect(page.getByText('Complete itinerary · Review every flight', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Stops', exact: true })).toBeDisabled();
  await expect(page.locator('.combo-itinerary')).toContainText('BOM → DEL');
  await expect(page.locator('.combo-itinerary')).toContainText('DEL → BOM');
  await expect(page.locator('.flight-route-track')).toHaveCount(0);
});

test('a captured order cannot reopen checkout after dismissal', async ({ page, provider }) => {
  provider.overrides['GET /api/payments/status'] = { body: { bookingId, status: 'PAID', canResume: false, message: 'Payment is already received. Supplier confirmation is pending.' } };
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await openSyntheticPayment(page);
  await page.evaluate('window.__syntheticGateway.dismiss()');
  await page.getByRole('button', { name: 'Resume secure checkout', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Check payment status in My trips', exact: true })).toBeVisible();
  expect(await page.evaluate('window.__syntheticGateway.opens.length')).toBe(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/status')).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Resume secure checkout', exact: true })).toHaveCount(0);
});

test('an expired existing order is preserved but cannot reopen or create another payment', async ({ page, provider }) => {
  await page.clock.install({ time: new Date() });
  provider.quote = reviewedQuote({ expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await openSyntheticPayment(page);
  await page.evaluate('window.__syntheticGateway.dismiss()');
  await page.clock.fastForward(6 * 60_000);
  await expect(page.getByRole('button', { name: 'Resume secure checkout', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh reviewed price', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change selection', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'View payment and booking status →', exact: true })).toBeVisible();
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/status')).toHaveLength(0);
  expect(await page.evaluate('window.__syntheticGateway.opens.length')).toBe(1);
});

for (const status of [409, 503]) test(`uncertain payment creation (${status}) locks retries and routes the traveller to status`, async ({ page, provider }, testInfo) => {
  provider.overrides['POST /api/payments/create'] = { status, body: { error: 'Payment order creation is pending reconciliation. Do not create another payment.' } };
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await page.getByRole('checkbox', { name: /I accept the reviewed total/ }).check();
  await page.getByRole('button', { name: /^Pay .* securely$/ }).click();
  await expect(page.getByRole('alert')).toContainText('Payment order creation is pending reconciliation');
  await expect(page.getByRole('link', { name: 'Check payment status in My trips', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pay .* securely$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change selection', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh reviewed price', exact: true })).toHaveCount(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/verify')).toHaveLength(0);
  expect(await page.evaluate('window.__syntheticGateway.opens.length')).toBe(0);
  await capture(page, testInfo, 'payment-creation-uncertain');
});

test('reload preserves an uncertain create marker and no-order-yet never unlocks another payment', async ({ page, provider }, testInfo) => {
  provider.overrides['POST /api/payments/create'] = { status: 503, body: { error: 'Payment order creation is pending reconciliation. Do not create another payment.' } };
  provider.overrides['GET /api/payments/status'] = { body: {
    found: false, quoteId, canResume: false, checkoutResolved: false, status: 'OUTCOME_UNCONFIRMED',
    message: 'No payment order is visible yet. An interrupted request may still be running. Do not start another payment for the same trip.',
  } };
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await page.getByRole('checkbox', { name: /I accept the reviewed total/ }).check();
  await page.getByRole('button', { name: /^Pay .* securely$/ }).click();
  await expect(page.getByRole('link', { name: 'Check payment status in My trips', exact: true })).toBeVisible();
  expect(await page.evaluate('JSON.parse(sessionStorage.getItem("maxtravel.pending-checkout.v1"))')).toEqual({ quoteId });
  await page.reload();
  const recovery = page.getByRole('region', { name: 'Interrupted checkout', exact: true });
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('No payment order is visible yet');
  await expect(page.getByRole('button', { name: 'Search flights', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Resume existing checkout/ })).toHaveCount(0);
  expect(provider.requests('/api/payments/status')[0].query).toEqual({ quoteId });
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  await recovery.getByRole('button', { name: 'Check payment status again', exact: true }).click();
  await expect(recovery).toContainText('No payment order is visible yet');
  expect(provider.requests('/api/payments/status')).toHaveLength(2);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  await capture(page, testInfo, 'interrupted-checkout-no-order-yet');
});

test('reload resumes only the owned server-checked order and stores no traveller or gateway data', async ({ page, provider }) => {
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await openSyntheticPayment(page);
  await page.evaluate('window.__syntheticGateway.dismiss()');
  expect(await page.evaluate('JSON.parse(sessionStorage.getItem("maxtravel.pending-checkout.v1"))')).toEqual({ quoteId, bookingId });
  await page.reload();
  const recovery = page.getByRole('region', { name: 'Interrupted checkout', exact: true });
  await expect(recovery).toBeVisible();
  await recovery.getByRole('button', { name: /^Resume existing checkout/ }).click();
  await expect.poll(() => page.evaluate('window.__syntheticGateway.opens')).toEqual(['order_SYNTHETICONLY']);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/status')).toHaveLength(2);
  expect(provider.requests('/api/payments/status').map(call => call.query)).toEqual([{ bookingId }, { bookingId }]);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(await page.evaluate('JSON.parse(sessionStorage.getItem("maxtravel.pending-checkout.v1"))')).toEqual({ quoteId, bookingId });
});

for (const status of [401, 404]) test(`an inaccessible checkout remains uncertain after ${status} without exposing its references or unlocking payment`, async ({ page, provider }) => {
  provider.overrides['GET /api/payments/status'] = { status, body: { error: status === 404 ? 'Booking not found.' : 'Sign in to continue.' } };
  await page.addInitScript(({ quoteId, bookingId }) => {
    sessionStorage.setItem('maxtravel.pending-checkout.v1', JSON.stringify({ quoteId, bookingId }));
  }, { quoteId, bookingId });
  await openFlightSearch(page);
  const recovery = page.getByRole('region', { name: 'Interrupted checkout', exact: true });
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('Sign in to the account that started it');
  await expect(recovery.getByRole('button', { name: 'Check payment status again', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Search flights', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Resume existing checkout/ })).toHaveCount(0);
  expect(provider.requests('/api/payments/status')).toHaveLength(1);
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  expect(await page.evaluate('JSON.parse(sessionStorage.getItem("maxtravel.pending-checkout.v1"))')).toEqual({ quoteId, bookingId });
  await expect(page.locator('body')).not.toContainText(quoteId);
  await expect(page.locator('body')).not.toContainText(bookingId);
  // A missing/inaccessible record is not proof that a prior mutation failed.
  // Repeated status checks must remain read-only and preserve that uncertainty.
  await recovery.getByRole('button', { name: 'Check payment status again', exact: true }).click();
  await expect(recovery.getByRole('button', { name: 'Check payment status again', exact: true })).toBeEnabled();
  expect(provider.requests('/api/payments/status')).toHaveLength(2);
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  expect(await page.evaluate('JSON.parse(sessionStorage.getItem("maxtravel.pending-checkout.v1"))')).toEqual({ quoteId, bookingId });
});

test('an account identity change clears private draft fields while preserving the unresolved payment marker', async ({ page, provider }) => {
  await openReviewedFlight(page);
  await showPaymentReview(page);
  await openSyntheticPayment(page);
  await page.evaluate('window.__syntheticGateway.dismiss()');
  await expect(page.locator('[name="first-0"]')).toHaveValue('Aarav');
  await expect(page.locator('[name="email"]')).toHaveValue('traveller@example.test');
  provider.session = syntheticSession('66666666-6666-4666-8666-666666666666');
  provider.overrides['GET /api/payments/status'] = { status: 404, body: { error: 'Booking not found.' } };
  const refreshedSession = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/get-session');
  // Exercise Better Auth's real cross-tab session notification, not a direct
  // mutation of React state. The refetch itself remains intercepted above.
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {
    key: 'better-auth.message',
    newValue: JSON.stringify({ event: 'session', data: { trigger: 'signIn' }, clientId: 'synthetic-other-tab' }),
    storageArea: localStorage, url: location.href,
  })));
  await refreshedSession;
  const recovery = page.getByRole('region', { name: 'Interrupted checkout', exact: true });
  await expect(recovery).toContainText('Sign in to the account that started it');
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toHaveCount(0);
  await expect(page.locator('[name="first-0"], [name="last-0"], [name="email"], [name="phone"]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Available options' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search flights', exact: true })).toBeDisabled();
  await expect(page.locator('body')).not.toContainText('traveller@example.test');
  await expect(page.locator('body')).not.toContainText(bookingId);
  expect(await page.evaluate('JSON.parse(sessionStorage.getItem("maxtravel.pending-checkout.v1"))')).toEqual({ quoteId, bookingId });
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});
