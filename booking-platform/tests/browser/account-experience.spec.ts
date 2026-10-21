import { test, expect, capture, expectNoHorizontalOverflow } from './fixtures';

test('account sign-in and registration share an accessible responsive workspace', async ({ page, provider }, testInfo) => {
  provider.session = null;
  await page.goto('/account');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create account', exact: true }).first().click();
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('minlength', '12');
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'account-registration');
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});

test('saved travellers show a useful empty state and confirm before removal', async ({ page, provider }, testInfo) => {
  await page.goto('/travellers');
  await expect(page.getByRole('heading', { name: 'A familiar face, a faster checkout.' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'travellers-empty');
  provider.overrides['GET /api/travellers'] = { body: { travellers: [{ id: 'fixture-traveller', name: 'Alex Example', profile: { pt: 'ADULT', ti: 'Mr', fN: 'Alex', lN: 'Example' } }] } };
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Alex Example' })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Remove saved profile' }).click();
  expect(provider.calls.filter(call => call.method === 'DELETE')).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Alex');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('traveller access failure is not mistaken for an empty saved list', async ({ page, provider }) => {
  provider.overrides['GET /api/travellers'] = { status: 401, body: { error: 'Sign in to view saved travellers.' } };
  await page.goto('/travellers');
  await expect(page.getByRole('heading', { name: 'We couldn’t load your profiles.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A familiar face, a faster checkout.' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('password reset keeps invalid links local and exposes clear recovery feedback', async ({ page, provider }, testInfo) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('main')).toHaveCount(1);
  await page.getByLabel('New password', { exact: true }).fill('SyntheticPasswordOnly123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toContainText('Reset link is missing or invalid.');
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'password-reset-invalid-link');
});

test('operations tables and desk navigation stay responsive without executing actions', async ({ page, provider }, testInfo) => {
  provider.overrides['GET /api/admin/bookings'] = { body: { rows: [{ id: 'synthetic-booking', reference: 'TEST-ONLY', status: 'PAYMENT_PENDING', customer: 'Synthetic account', supplier_response: { confirmation: 'Pending; not a ticket' } }], hasMore: false } };
  provider.overrides['GET /api/admin/companies'] = { body: { rows: [], hasMore: false } };
  await page.goto('/operations');
  await expect(page.getByRole('region', { name: 'bookings records', exact: true })).toContainText('TEST-ONLY');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'operations-bookings');
  await page.getByRole('navigation', { name: 'Operations desks' }).getByRole('button', { name: 'companies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approve a company account', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No records to show.', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});

test('operations access failure is shown as unavailable rather than no records', async ({ page, provider }) => {
  provider.overrides['GET /api/admin/bookings'] = { status: 403, body: { error: 'Verified staff access is required.' } };
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Records are unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No records to show.', exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
