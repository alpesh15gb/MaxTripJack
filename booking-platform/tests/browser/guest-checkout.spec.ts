import {continueToTravellerDetails,  test, expect, openFlightSearch } from './fixtures';

test('a signed-out guest goes from fare to payment without an email or WhatsApp code', async ({ page, provider }) => {
  provider.session = null;
  await openFlightSearch(page);
  await page.locator('.flight-shopping-list .fare-comparison-trigger').first().click();
  await page.getByRole('button', { name: 'Check fare & continue', exact: true }).first().click();
  await continueToTravellerDetails(page);
  const form = page.getByRole('form', { name: 'Review and travellers' });
  await expect(form).toBeVisible();
  await expect(page.locator('#booking-signin-title')).toHaveCount(0);
  await expect(form.locator('.guest-checkout-note')).toContainText('Booking as a guest');
  await expect(form.getByRole('link', { name: 'Sign in instead' })).toBeVisible();
  await expect(form.getByRole('button', { name: /saved traveller/i })).toHaveCount(0);
  await form.getByLabel('First name', { exact: true }).fill('Aarav');
  await form.getByLabel('Last name', { exact: true }).fill('Example');
  await form.getByLabel('Email', { exact: true }).fill('guest@example.test');
  await form.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await page.locator('#booking-review').getByRole('button', { name: /^Agree & pay / }).click();
  await expect.poll(() => provider.requests('/api/payments/create').length).toBe(1);
  expect(provider.requests('/api/payments/create')[0].body).toMatchObject({ guests: { email: 'guest@example.test', phone: '9876543210' } });
  expect(provider.requests('/api/auth/email-otp/send-verification-otp')).toHaveLength(0);
});
