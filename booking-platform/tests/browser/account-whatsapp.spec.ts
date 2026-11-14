import { test, expect, syntheticSession, bookingId, departure, expectNoHorizontalOverflow } from './fixtures';

const phone = '+919876543210';
const channels = 'GET /api/auth/channels';
const send = 'POST /api/auth/phone-number/send-otp';
const verify = 'POST /api/auth/phone-number/verify';

test('verified email account links WhatsApp without changing account ownership', async ({ page, provider }) => {
  provider.overrides[channels] = { body: { email: true, whatsapp: true } };
  provider.overrides[send] = { body: { status: true } };
  provider.overrides[verify] = { body: { status: true } };
  await page.goto('/account');
  const section = page.getByRole('region', { name: 'WhatsApp sign-in', exact: true });
  await section.getByRole('button', { name: 'Connect WhatsApp number', exact: true }).click();
  await section.getByLabel('WhatsApp number', { exact: true }).fill('9876543210');
  await section.getByRole('button', { name: 'Send WhatsApp code', exact: true }).click();
  await expect(section.getByLabel('Verification code', { exact: true })).toBeVisible();
  expect(provider.requests('/api/auth/phone-number/send-otp')[0].body).toEqual({ phoneNumber: phone, purpose: 'link' });
  await section.getByLabel('Verification code', { exact: true }).fill('123456');
  const session = syntheticSession();
  provider.session = { ...session, user: { ...session.user, phoneNumber: phone, phoneNumberVerified: true } };
  await section.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(section).toContainText(`${phone} is verified for this account`);
  await expect(page).toHaveURL(/\/account$/);
  expect(provider.requests('/api/auth/phone-number/verify')[0].body).toEqual({ phoneNumber: phone, code: '123456', updatePhoneNumber: true });
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
});

test('phone-only account shows its number without exposing the internal email or unusable password reset', async ({ page, provider }) => {
  const session = syntheticSession();
  provider.session = { ...session, user: { ...session.user, email: 'synthetic@phone.maxtravel.invalid', emailVerified: false, phoneNumber: phone, phoneNumberVerified: true } };
  provider.overrides[channels] = { body: { email: true, whatsapp: true } };
  provider.overrides['GET /api/auth/list-accounts'] = { body: [] };
  await page.goto('/account');
  await expect(page.getByRole('region', { name: 'WhatsApp sign-in', exact: true })).toContainText(phone);
  await expect(page.getByRole('region', { name: 'WhatsApp account', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('@phone.maxtravel.invalid');
  await expect(page.getByRole('button', { name: 'Set up a password', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View signed-in devices', exact: true })).toBeVisible();
  expect(provider.requests('/api/auth/request-password-reset')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
});

test('WhatsApp account sign-in returns to the owned booking status', async ({ page, provider }) => {
  provider.session = null;
  provider.overrides[channels] = { body: { email: true, whatsapp: true } };
  provider.overrides[send] = { body: { status: true } };
  provider.overrides[verify] = { body: { status: true } };
  provider.overrides[`GET /api/bookings/${bookingId}/details`] = { body: {
    id: bookingId, reference: 'MT-WHATSAPP-RETURN', product: 'FLIGHT', status: 'BOOKING_PENDING', currency: 'INR', totalMinor: '654000',
    paymentStatus: 'CAPTURED', createdAt: new Date().toISOString(), itinerary: { from: 'BOM', to: 'DEL', date: departure, adults: 1 }, passengers: [], refunds: [],
  } };
  await page.goto('/account?' + new URLSearchParams({ returnTo: `/my-trips/${bookingId}` }));
  await page.getByRole('button', { name: 'Sign in with a code', exact: true }).click();
  const verification = page.locator('.checkout-verification');
  await verification.getByRole('button', { name: 'WhatsApp', exact: true }).click();
  await verification.getByLabel('WhatsApp number', { exact: true }).fill(phone);
  await verification.getByRole('button', { name: 'Send WhatsApp code', exact: true }).click();
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  const session = syntheticSession();
  provider.session = { ...session, user: { ...session.user, email: 'synthetic@phone.maxtravel.invalid', emailVerified: false, phoneNumber: phone, phoneNumberVerified: true } };
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/my-trips/${bookingId}$`));
  await expect(page.getByRole('heading', { name: 'We’re confirming your booking.', exact: true })).toBeVisible();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('rejected phone link keeps the email account and offers a retry without a new account', async ({ page, provider }) => {
  provider.overrides[channels] = { body: { email: true, whatsapp: true } };
  provider.overrides[send] = { status: 400, body: { message: 'This number cannot be connected.' } };
  await page.goto('/account');
  const section = page.getByRole('region', { name: 'WhatsApp sign-in', exact: true });
  await section.getByRole('button', { name: 'Connect WhatsApp number', exact: true }).click();
  await section.getByLabel('WhatsApp number', { exact: true }).fill(phone);
  await section.getByRole('button', { name: 'Send WhatsApp code', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('couldn’t request a WhatsApp code');
  await expect(page.locator('.account-identity')).toContainText(syntheticSession().user.email);
  expect(provider.requests('/api/auth/phone-number/verify')).toHaveLength(0);
  expect(provider.requests('/api/auth/sign-up/email')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
