import { test, expect, syntheticSession, expectNoHorizontalOverflow } from './fixtures';

const saved = { id: 'synthetic-profile', name: 'Alex Example', profile: { pt: 'ADULT', ti: 'Mr', fN: 'Alex', lN: 'Example' } };

for (const status of [401, 403]) {
  for (const method of ['PUT', 'DELETE']) {
    test(`traveller ${method} access denial ${status} clears profiles and unsaved private fields`, async ({ page, provider }) => {
      provider.overrides['GET /api/travellers'] = { body: { travellers: [saved] } };
      provider.overrides[`${method} /api/travellers`] = { status, body: { error: 'Synthetic access revoked' } };
      await page.goto('/travellers');
      await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
      await page.getByLabel('First name', { exact: true }).fill('Private unsaved name');
      if (method === 'PUT') await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      else {
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Remove saved profile', exact: true }).click();
      }
      await expect(page.getByRole('heading', { name: 'Sign in to manage your travellers.', exact: true })).toBeVisible();
      await expect(page.getByRole('main')).not.toContainText(saved.name);
      await expect(page.getByLabel('First name', { exact: true })).not.toBeVisible();
      expect(await page.locator('input[name="fN"]').inputValue()).toBe('');
      await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
      expect(provider.requests('/api/travellers').filter(call => call.method === method)).toHaveLength(1);
      await expectNoHorizontalOverflow(page);
    });
  }
}

test('background sign-out clears saved travellers and editor without another profile request', async ({ page, provider }) => {
  provider.overrides['GET /api/travellers'] = { body: { travellers: [saved] } };
  await page.goto('/travellers');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  provider.session = null;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Sign in to manage your travellers.', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(saved.name);
  await expect(page.locator('#traveller-editor')).toHaveCount(0);
  expect(provider.requests('/api/travellers')).toHaveLength(1);
  expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([]);
});

test('a changed session mounts only the new account traveller profiles', async ({ page, provider }) => {
  provider.overrides['GET /api/travellers'] = { body: { travellers: [saved] } };
  await page.goto('/travellers');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  provider.session = syntheticSession('66666666-6666-4666-8666-666666666666');
  provider.overrides['GET /api/travellers'] = { body: { travellers: [{ ...saved, id: 'other-profile', name: 'Jordan Example', profile: { ...saved.profile, fN: 'Jordan' } }] } };
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Jordan Example', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(saved.name);
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('');
  expect(provider.requests('/api/travellers')).toHaveLength(2);
  expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([]);
});

test('an uncertain session check hides traveller details and preserves write reconciliation on recovery', async ({ page, provider }) => {
  await page.goto('/travellers');
  await expect(page.getByRole('button', { name: 'Save traveller', exact: true })).toBeEnabled();
  await page.getByLabel('First name', { exact: true }).fill('Private');
  await page.getByLabel('Last name', { exact: true }).fill('Example');
  let writes = 0;
  await page.route('**/api/travellers', async route => {
    if (route.request().method() === 'POST') { writes++; await route.abort('failed'); }
    else await route.fallback();
  });
  await page.getByRole('button', { name: 'Save traveller', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload saved profiles', exact: true })).toBeVisible();
  provider.overrides['GET /api/auth/get-session'] = { status: 503, body: { message: 'Synthetic access check unavailable' } };
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Check account access', exact: true })).toBeVisible();
  await expect(page.getByLabel('First name', { exact: true })).not.toBeVisible();
  delete provider.overrides['GET /api/auth/get-session'];
  await page.getByRole('button', { name: 'Check account access', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload saved profiles', exact: true })).toBeVisible();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Private');
  await expect(page.getByRole('button', { name: 'Save traveller', exact: true })).toBeDisabled();
  expect(provider.requests('/api/travellers')).toHaveLength(1);
  expect(writes).toBe(1);
  await expectNoHorizontalOverflow(page);
});
