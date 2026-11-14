import { test, expect, bookingId, departure, syntheticSession } from './fixtures';

test('account email-code sign-in returns to the exact booking status and drops unrelated query data', async ({ page, provider }) => {
  const email = 'code-account@example.test';
  const statusPath = `/my-trips/${bookingId}`;
  const session = syntheticSession();
  const signedIn = { ...session, user: { ...session.user, email } };
  provider.session = null;
  provider.overrides['POST /api/auth/email-otp/send-verification-otp'] = { body: { success: true } };
  provider.overrides['POST /api/auth/sign-in/email-otp'] = { body: { token: 'synthetic-only', user: signedIn.user } };
  provider.overrides[`GET /api/bookings/${bookingId}/details`] = { body: {
    id: bookingId, reference: 'MT-CODE-ACCOUNT', product: 'FLIGHT', status: 'BOOKING_PENDING',
    currency: 'INR', totalMinor: '654000', paymentStatus: 'CAPTURED', createdAt: new Date().toISOString(),
    itinerary: { from: 'BOM', to: 'DEL', date: departure, adults: 1 }, passengers: [], refunds: [],
  } };
  await page.goto('/account?' + new URLSearchParams({ returnTo: `${statusPath}?email=discard-me@example.test#discard` }));
  await page.getByRole('button', { name: 'Sign in with an email code', exact: true }).click();
  const verification = page.locator('.checkout-verification');
  await verification.getByLabel('Email address', { exact: true }).fill(email);
  await verification.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await verification.getByLabel('Verification code', { exact: true }).fill('123456');
  provider.session = signedIn;
  await verification.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  await expect(page).toHaveURL(statusPath);
  await expect(page.getByRole('heading', { level: 1, name: 'We’re confirming your booking.' })).toBeVisible();
  expect(provider.requests('/api/auth/email-otp/send-verification-otp')[0].body).toEqual({ email, type: 'sign-in' });
  expect(provider.requests('/api/auth/sign-in/email-otp')[0].body).toEqual({ email, otp: '123456' });
  expect(provider.requests('/api/auth/sign-in/email')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('code-only account offers optional password setup without asking for a current password', async ({ page, provider }) => {
  provider.overrides['GET /api/auth/list-accounts'] = { body: [] };
  provider.overrides['POST /api/auth/request-password-reset'] = { body: { status: true } };
  await page.goto('/account');
  const setup = page.getByRole('region', { name: 'Password setup', exact: true });
  await expect(setup).toContainText('You sign in with an email code');
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set up authenticator', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View signed-in devices', exact: true })).toBeVisible();
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
  await setup.getByRole('button', { name: 'Set up a password', exact: true }).click();
  await expect(page.locator('.account-card').getByRole('status')).toContainText('Password setup requested');
  const request = provider.requests('/api/auth/request-password-reset');
  expect(request).toHaveLength(1);
  expect(request[0].body).toMatchObject({ email: syntheticSession().user.email });
  expect(provider.requests('/api/auth/change-password')).toHaveLength(0);
  expect(provider.requests('/api/auth/two-factor/enable')).toHaveLength(0);
});

test('failed account-method lookup hides password actions and retry restores only confirmed options', async ({ page, provider }) => {
  provider.overrides['GET /api/auth/list-accounts'] = { status: 503, body: { message: 'Synthetic unavailable' } };
  await page.goto('/account');
  await expect(page.locator('.account-card').getByRole('alert')).toContainText('We couldn’t check your password options');
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set up a password', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set up authenticator', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View signed-in devices', exact: true })).toBeVisible();
  delete provider.overrides['GET /api/auth/list-accounts'];
  await page.getByRole('button', { name: 'Check password options', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set up authenticator', exact: true })).toBeVisible();
  await expect(page.locator('.account-session-security').getByLabel('Current password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up a password', exact: true })).toHaveCount(0);
  expect(provider.requests('/api/auth/list-accounts').length).toBeGreaterThanOrEqual(2);
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});
