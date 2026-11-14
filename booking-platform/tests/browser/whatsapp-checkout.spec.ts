import type { Page } from '@playwright/test';
import { test, expect, capture, departure, returning, searchId, reviewedQuote, syntheticSession, openFlightSearch, expectNoHorizontalOverflow, type ProviderFixture } from './fixtures';

const phone = '+919876543210';
const alias = 'synthetic-phone-user@phone.maxtravel.invalid';
const sendPath = '/api/auth/phone-number/send-otp';
const verifyPath = '/api/auth/phone-number/verify';

function phoneSession(number = phone, verified = true) {
  const session = syntheticSession();
  return { ...session, user: { ...session.user, email: alias, emailVerified: false, phoneNumber: number, phoneNumberVerified: verified } };
}
function guest(provider: ProviderFixture) {
  provider.session = null;
  provider.overrides['GET /api/auth/channels'] = { body: { email: true, whatsapp: true } };
  provider.overrides['POST /api/travel/review'] = { status: 401, body: { error: 'Sign in to continue.' } };
  provider.overrides[`POST ${sendPath}`] = { body: { status: 'requested' } };
  provider.overrides[`POST ${verifyPath}`] = { body: { status: true, token: 'synthetic-only', user: phoneSession().user } };
}
async function chooseFlight(page: Page) {
  await openFlightSearch(page);
  await page.locator('.fare-comparison > summary').first().click();
  await page.getByRole('button', { name: 'Check fare & continue', exact: true }).first().click();
  await expect(page.locator('.checkout-verification')).toBeVisible();
}
async function requestPhoneCode(page: Page, input = '98765 43210') {
  const verification = page.locator('.checkout-verification');
  await verification.getByRole('button', { name: 'WhatsApp', exact: true }).click();
  await verification.getByLabel('WhatsApp number', { exact: true }).fill(input);
  await verification.getByRole('button', { name: 'Send WhatsApp code', exact: true }).click();
  await expect(verification.getByLabel('Verification code', { exact: true })).toBeVisible();
  return verification;
}
function signedIn(provider: ProviderFixture) { provider.session = phoneSession(); delete provider.overrides['POST /api/travel/review']; }

test('WhatsApp verifies a new flight customer inside checkout without presenting an internal email', async ({ page, provider }, info) => {
  guest(provider);
  await chooseFlight(page);
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const verification = await requestPhoneCode(page);
  expect(provider.requests(sendPath)[0].body).toEqual({ phoneNumber: phone, purpose: 'signin' });
  await expect(verification.getByRole('button', { name: /Resend/ })).toBeDisabled();
  await expect(page.locator('.booking-verification-summary')).toContainText('BOM');
  await expect(page.locator('#booking-search')).toBeHidden();
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'whatsapp-code-flight');
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  signedIn(provider);
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  const form = page.getByRole('form', { name: 'Review and travellers' });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Email', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('Indian mobile number', { exact: true })).toHaveValue('9876543210');
  await expect(page.locator('body')).not.toContainText(alias);
  expect(provider.requests(verifyPath)[0].body).toEqual({ phoneNumber: phone, code: '123456' });
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(2);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await page.getByRole('button', { name: 'Change selection', exact: true }).click();
  await expect(page.locator('#booking-results')).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('hotel WhatsApp verification keeps the exact property and room', async ({ page, provider }, info) => {
  guest(provider);
  const option = { optionId: 'whatsapp-room', roomInfo: [{ name: 'Garden twin room' }], mealBasis: 'BREAKFAST', pricing: { totalPrice: 8000 }, cancellation: { isRefundable: false, penalties: [] } };
  provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Palm House', customerEstimateMinor: 800000 }] } };
  provider.overrides['POST /api/travel/hotel-detail'] = { body: { options: [option] } };
  provider.quote = reviewedQuote({ product: 'HOTEL', totalMinor: 800000, summary: { city: 'Goa', checkIn: departure, checkOut: returning, rooms: [{ adults: 2, children: 0, childAge: [] }] }, review: { option } });
  await page.goto('/book?' + new URLSearchParams({ product: 'HOTEL', hotelIds: '10001', city: 'Goa', date: departure, end: returning, adults: '2', autoSearch: '1' }));
  await page.getByRole('button', { name: 'Choose room', exact: true }).click();
  await page.getByRole('button', { name: 'Review stay', exact: true }).click();
  const verification = await requestPhoneCode(page, '+91 98765 43210');
  await expect(page.locator('.booking-verification-summary')).toContainText('Palm House');
  await expect(page.locator('.booking-verification-summary')).toContainText('Garden twin room');
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  signedIn(provider);
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(page.locator('.traveller-card')).toHaveCount(2);
  expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
  expect(provider.requests('/api/travel/review').at(-1)?.body).toEqual({ searchId, hid: '10001', optionId: 'whatsapp-room' });
  await expect(page.locator('body')).not.toContainText(alias);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'whatsapp-hotel-guests');
});

test('WhatsApp delivery failure offers email without losing the fare or leaking its failed code', async ({ page, provider }) => {
  guest(provider);
  provider.overrides[`POST ${sendPath}`] = { status: 503, body: { message: 'Delivery unavailable' } };
  provider.overrides['POST /api/auth/email-otp/send-verification-otp'] = { body: { success: true } };
  await chooseFlight(page);
  const verification = page.locator('.checkout-verification');
  await verification.getByRole('button', { name: 'WhatsApp', exact: true }).click();
  await verification.getByLabel('WhatsApp number', { exact: true }).fill('9876543210');
  await verification.getByRole('button', { name: 'Send WhatsApp code', exact: true }).click();
  await expect(verification.getByRole('alert')).toContainText('choose Email');
  await verification.getByRole('button', { name: 'Email', exact: true }).click();
  await verification.getByLabel('Email address', { exact: true }).fill('email-fallback@example.test');
  await verification.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(verification.getByLabel('Verification code', { exact: true })).toHaveValue('');
  await expect(page.locator('.booking-verification-summary')).toContainText('STANDARD');
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('switching verification channel clears entered codes and preserves separate resend cooldowns', async ({ page, provider }) => {
  guest(provider);
  provider.overrides['POST /api/auth/email-otp/send-verification-otp'] = { body: { success: true } };
  await chooseFlight(page);
  const verification = await requestPhoneCode(page);
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  await verification.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(verification.getByLabel('Verification code', { exact: true })).toHaveCount(0);
  await verification.getByLabel('Email address', { exact: true }).fill('different-channel@example.test');
  await expect(verification.getByRole('button', { name: 'Send verification code', exact: true })).toBeEnabled();
  await verification.getByRole('button', { name: 'WhatsApp', exact: true }).click();
  await expect(verification.getByRole('button', { name: /Send code in/ })).toBeDisabled();
  expect(provider.requests(sendPath)).toHaveLength(1);
  expect(provider.requests(verifyPath)).toHaveLength(0);
});

test('an invalid WhatsApp code cannot unlock traveller details or payment', async ({ page, provider }) => {
  guest(provider);
  provider.overrides[`POST ${verifyPath}`] = { status: 400, body: { code: 'INVALID_OTP' } };
  await chooseFlight(page);
  const verification = await requestPhoneCode(page);
  await verification.getByLabel('Verification code', { exact: true }).fill('000000');
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(verification.getByRole('alert')).toContainText('invalid or has expired');
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for (const mismatch of ['unverified', 'different-number'] as const) {
  test(`WhatsApp success response requires a matching verified server session: ${mismatch}`, async ({ page, provider }) => {
    guest(provider);
    await chooseFlight(page);
    const verification = await requestPhoneCode(page);
    await verification.getByLabel('Verification code', { exact: true }).fill('123456');
    provider.session = phoneSession(mismatch === 'different-number' ? '+919876543211' : phone, mismatch !== 'unverified');
    await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
    await expect(verification.getByRole('alert')).toContainText('has not been verified');
    await expect(page.getByRole('form', { name: 'Review and travellers' })).toHaveCount(0);
    expect(provider.requests('/api/travel/review')).toHaveLength(1);
  });
}

test('WhatsApp sign-in still requires the existing authenticator before traveller entry', async ({ page, provider }) => {
  guest(provider);
  provider.overrides[`POST ${verifyPath}`] = { body: { twoFactorRedirect: true } };
  provider.overrides['POST /api/auth/two-factor/verify-totp'] = { body: { token: 'synthetic-only', user: phoneSession().user } };
  await chooseFlight(page);
  const verification = await requestPhoneCode(page);
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(verification.getByLabel('Authenticator code', { exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toHaveCount(0);
  await verification.getByLabel('Authenticator code', { exact: true }).fill('654321');
  signedIn(provider);
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Review and travellers' })).toBeVisible();
  expect(provider.requests('/api/auth/two-factor/verify-totp')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('unconfigured WhatsApp leaves email verification available without a broken option', async ({ page, provider }) => {
  guest(provider);
  provider.overrides['GET /api/auth/channels'] = { body: { email: true, whatsapp: false } };
  await chooseFlight(page);
  const verification = page.locator('.checkout-verification');
  await expect(verification.getByRole('button', { name: 'WhatsApp', exact: true })).toHaveCount(0);
  await expect(verification.getByLabel('Email address', { exact: true })).toBeVisible();
  await expect(verification.getByRole('button', { name: 'Send verification code', exact: true })).toBeEnabled();
  expect(provider.requests(sendPath)).toHaveLength(0);
});
