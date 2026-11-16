import type { Page } from '@playwright/test';
import { test, expect, capture, bookingId, departure, returning, searchId, reviewedQuote, syntheticSession, openFlightSearch, expectNoHorizontalOverflow, type ProviderFixture } from './fixtures';

const email = 'checkout@example.test';
const sendPath = '/api/auth/email-otp/send-verification-otp';
const verifyPath = '/api/auth/sign-in/email-otp';

function guestCheckout(provider: ProviderFixture) {
  provider.session = null;
  provider.overrides['POST /api/travel/review'] = { status: 401, body: { error: 'Sign in to continue.' } };
  provider.overrides[`POST ${sendPath}`] = { body: { success: true } };
  provider.overrides[`POST ${verifyPath}`] = { body: { token: 'synthetic-only', user: { ...syntheticSession().user, email } } };
}

async function chooseFlight(page: Page) {
  await openFlightSearch(page);
  await page.locator('.fare-comparison > summary').first().click();
  await page.getByRole('button', { name: 'Check fare & continue', exact: true }).first().click();
  await expect(page.locator('.checkout-verification')).toBeVisible();
}

async function requestCode(page: Page) {
  const verification = page.locator('.checkout-verification');
  await verification.getByLabel('Email address', { exact: true }).fill(email);
  await verification.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(verification.getByLabel('Verification code', { exact: true })).toBeVisible();
  return verification;
}

function verified(provider: ProviderFixture) {
  const session = syntheticSession();
  provider.session = { ...session, user: { ...session.user, email } };
  delete provider.overrides['POST /api/travel/review'];
}

test('flight email verification stays in checkout and preserves results and contact email', async ({ page, provider }, info) => {
  guestCheckout(provider);
  await chooseFlight(page);
  await expect(page).toHaveURL(/\/book\?/);
  await expect(page.locator('.booking-verification-summary')).toContainText('BOM');
  await expect(page.locator('.booking-verification-summary')).toContainText('DEL');
  await expect(page.locator('#booking-search')).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'flight-inline-verification');
  const verification = await requestCode(page);
  expect(provider.requests(sendPath)[0].body).toEqual({ email, type: 'sign-in' });
  await expect(verification.getByRole('button', { name: /Resend/ })).toBeDisabled();
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  verified(provider);
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  const travellers = page.getByRole('form', { name: 'Review and travellers' });
  await expect(travellers).toBeVisible();
  await expect(travellers.getByLabel('Email', { exact: true })).toHaveValue(email);
  await expect(page).toHaveURL(/\/book\?/);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(2);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'flight-verified-travellers');
  await page.getByRole('button', { name: 'Change selection', exact: true }).click();
  await expect(page.locator('#booking-results')).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('invalid email code preserves the selected flight and cannot expose checkout or start payment', async ({ page, provider }) => {
  guestCheckout(provider);
  provider.overrides[`POST ${verifyPath}`] = { status: 400, body: { code: 'INVALID_OTP', message: 'Invalid OTP' } };
  await chooseFlight(page);
  const verification = await requestCode(page);
  await verification.getByLabel('Verification code', { exact: true }).fill('999999');
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(verification.getByRole('alert')).toBeVisible();
  await expect(page.locator('.booking-verification-summary')).toContainText('Standard fare');
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await verification.getByRole('button', { name: 'Use a different email', exact: true }).click();
  await expect(verification.getByLabel('Email address', { exact: true })).toBeVisible();
  await expect(verification.getByLabel('Verification code', { exact: true })).toHaveCount(0);
});

test('email delivery failure leaves a retryable verification step with no supplier or payment side effect', async ({ page, provider }) => {
  guestCheckout(provider);
  provider.overrides[`POST ${sendPath}`] = { status: 503, body: { message: 'Email unavailable' } };
  await chooseFlight(page);
  const verification = page.locator('.checkout-verification');
  await verification.getByLabel('Email address', { exact: true }).fill(email);
  await verification.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(verification.getByRole('alert')).toBeVisible();
  await expect(verification.getByRole('button', { name: 'Send verification code', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/book\?/);
  expect(provider.requests(verifyPath)).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('email code cannot finish checkout verification without a verified server session', async ({ page, provider }) => {
  guestCheckout(provider);
  await chooseFlight(page);
  const verification = await requestCode(page);
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(verification.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('existing two-factor protection must finish before checkout resumes', async ({ page, provider }, info) => {
  guestCheckout(provider);
  provider.overrides[`POST ${verifyPath}`] = { body: { twoFactorRedirect: true } };
  provider.overrides['POST /api/auth/two-factor/verify-totp'] = { body: { token: 'synthetic-only', user: { ...syntheticSession().user, email } } };
  await chooseFlight(page);
  const verification = await requestCode(page);
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(verification.getByLabel('Authenticator code', { exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'checkout-mfa');
  await verification.getByLabel('Authenticator code', { exact: true }).fill('654321');
  verified(provider);
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toBeVisible();
  expect(provider.requests('/api/auth/two-factor/verify-totp')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('verified payment opens this booking status without claiming supplier confirmation', async ({ page, provider }) => {
  guestCheckout(provider);
  provider.overrides[`GET /api/bookings/${bookingId}/details`] = { body: {
    id: bookingId, reference: 'MX-SYNTHETIC-RECEIPT', product: 'FLIGHT', status: 'BOOKING_PENDING',
    currency: 'INR', totalMinor: '654000', paymentStatus: 'CAPTURED', createdAt: new Date().toISOString(),
    itinerary: { from: 'BOM', to: 'DEL', date: departure, adults: 1 }, passengers: [], refunds: [],
  } };
  await chooseFlight(page);
  const verification = await requestCode(page);
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  verified(provider);
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  const form = page.getByRole('form', { name: 'Review and travellers' });
  await form.getByLabel('First name', { exact: true }).fill('Aarav');
  await form.getByLabel('Last name', { exact: true }).fill('Example');
  await form.getByLabel('Indian mobile number', { exact: true }).fill('9876543210');
  await page.locator('#booking-review').getByRole('button', { name: 'Continue to review', exact: true }).click();
  await expect(page.locator('#booking-review [name="consent"]')).toHaveCount(0);
  await page.locator('#booking-review').getByRole('button', { name: /^Agree & pay / }).click();
  await expect.poll(() => page.evaluate('window.__syntheticGateway?.opens.length ?? 0')).toBe(1);
  await page.evaluate('window.__syntheticGateway.complete()');
  await expect(page).toHaveURL(new RegExp(`/my-trips/${bookingId}$`));
  await expect(page.getByRole('heading', { name: 'We’re confirming your booking.', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Payment received', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download confirmation PDF' })).toHaveCount(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(1);
  expect(provider.requests('/api/payments/verify')).toHaveLength(1);
});

test('hotel verification retains property and room and continues into guest details without another search', async ({ page, provider }, info) => {
  guestCheckout(provider);
  const option = { optionId: 'deluxe', roomInfo: [{ name: 'Deluxe twin room' }], mealBasis: 'BREAKFAST', pricing: { totalPrice: 8000 }, cancellation: { isRefundable: false, penalties: [] } };
  provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Palm House', customerEstimateMinor: 800000 }] } };
  provider.overrides['POST /api/travel/hotel-detail'] = { body: { options: [option] } };
  provider.quote = reviewedQuote({ product: 'HOTEL', totalMinor: 800000, summary: { city: 'Goa', checkIn: departure, checkOut: returning, rooms: [{ adults: 2, children: 0, childAge: [] }] }, review: { option } });
  await page.goto('/book?' + new URLSearchParams({ product: 'HOTEL', hotelIds: '10001', city: 'Goa', date: departure, end: returning, adults: '2', autoSearch: '1' }));
  await page.getByRole('button', { name: 'Choose room', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with room', exact: true }).click();
  await expect(page.locator('.booking-verification-summary')).toContainText('Palm House');
  await expect(page.locator('.booking-verification-summary')).toContainText('Deluxe twin room');
  const verification = await requestCode(page);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'hotel-inline-code');
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  verified(provider);
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  const guests = page.getByRole('form', { name: 'Review and travellers' });
  await expect(guests).toBeVisible();
  await expect(guests.locator('.traveller-card')).toHaveCount(2);
  await expect(guests.getByLabel('Email', { exact: true })).toHaveValue(email);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
  expect(provider.requests('/api/travel/review').at(-1)?.body).toEqual({ searchId, hid: '10001', optionId: 'deluxe' });
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'hotel-verified-guests');
});
