import {test, expect, capture, expectNoHorizontalOverflow} from './fixtures';

const endpoint = 'GET /api/admin/enquiries';
const patch = 'PATCH /api/admin/enquiries';
const retry = 'POST /api/admin/enquiries';
const row = (overrides: Record<string, unknown> = {}) => ({
  id: '77777777-7777-4777-8777-777777777777', reference: 'ME-SYNTHETIC-ADMIN', service: 'VISA', status: 'NEW', version: 1,
  createdAt: '2026-11-17T09:30:00Z', updatedAt: '2026-11-17T09:30:00Z',
  draft: {service: 'VISA', destination: 'United Arab Emirates', travelWindow: 'December 2026', adults: 2, childAges: [6], nationality: 'India', purpose: 'Tourism', countryOfResidence: 'India'},
  contact: {name: 'Synthetic Enquiry Customer', email: 'enquiry@example.test', phone: '+919876543210', preferredChannel: 'WHATSAPP'},
  contactVerified: false, internalNote: '', crmStatus: 'PENDING', crmEnvironment: 'test', ...overrides,
});
const listing = (rows = [row()], extras: Record<string, unknown> = {}) => ({rows, total: rows.length, page: 1, hasMore: false, canManage: true, canRetryCrm: true, ...extras});

test('admin sees enquiry details and CRM delivery status, then saves a versioned follow-up', async ({page, provider}, info) => {
  provider.overrides[endpoint] = {body: listing()};
  await page.goto('/operations/enquiries');
  const card = page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN', exact: true});
  await expect(card).toContainText('Safar delivery pending');
  await expect(card).toContainText('Safar · Test enquiries');
  await expect(card).toContainText('separate from live customer enquiries');
  await expect(card).toContainText('Customer-provided contact; not verified');
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  await expect(card).toContainText('Passport nationality');
  await expect(card).toContainText('Tourism');
  const form = card.getByRole('form', {name: 'Update ME-SYNTHETIC-ADMIN', exact: true});
  await form.getByLabel('Enquiry status', {exact: true}).selectOption('CONTACTED');
  await form.getByLabel('Internal follow-up note', {exact: true}).fill('Customer requested a callback tomorrow.');
  const updated = row({status: 'CONTACTED', version: 2, internalNote: 'Customer requested a callback tomorrow.'});
  provider.overrides[patch] = {body: {enquiry: updated}};
  provider.overrides[endpoint] = {body: listing([updated])};
  await form.getByRole('button', {name: 'Save follow-up', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'ME-SYNTHETIC-ADMIN updated.'})).toBeVisible();
  expect(provider.requests('/api/admin/enquiries').find(call => call.method === 'PATCH')?.body).toEqual({id: updated.id, version: 1, status: 'CONTACTED', internalNote: updated.internalNote});
  await expect(card).toContainText('Contacted');
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'enquiry-admin-follow-up');
});

test('admin filters submit bounded query criteria and empty results are recoverable', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: listing()};
  await page.goto('/operations/enquiries');
  const filters = page.getByRole('form', {name: 'Filter enquiries', exact: true});
  await filters.getByLabel('Search enquiries', {exact: true}).fill('Hyderabad');
  await filters.getByLabel('Service', {exact: true}).selectOption('HOLIDAY');
  await filters.getByLabel('Status', {exact: true}).selectOption('NEW');
  provider.overrides[endpoint] = {body: listing([])};
  await filters.getByRole('button', {name: 'Apply filters', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'No enquiries match', exact: true})).toBeVisible();
  expect(provider.requests('/api/admin/enquiries').at(-1)?.query).toEqual({page: '1', q: 'Hyderabad', service: 'HOLIDAY', status: 'NEW'});
  await filters.getByLabel('Search enquiries', {exact: true}).clear();
  await filters.getByLabel('Service', {exact: true}).selectOption('');
  await filters.getByLabel('Status', {exact: true}).selectOption('');
  provider.overrides[endpoint] = {body: listing()};
  await filters.getByRole('button', {name: 'Apply filters', exact: true}).click();
  await expect(page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN'})).toBeVisible();
});

test('read-only staff can inspect enquiries without status changes or CRM retry controls', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: listing([row({crmStatus: 'ACTION_REQUIRED', internalNote: 'Existing internal follow-up.'})], {canManage: false, canRetryCrm: false})};
  await page.goto('/operations/enquiries');
  const card = page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN'});
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  await expect(card).toContainText('Existing internal follow-up.');
  await expect(page.getByRole('button', {name: 'Save follow-up', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Retry Safar delivery', exact: true})).toHaveCount(0);
  expect(provider.requests('/api/admin/enquiries').every(call => call.method === 'GET')).toBe(true);
});

test('a conflicting admin update requires refresh and preserves the newer server version', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: listing()};
  provider.overrides[patch] = {status: 409, body: {error: 'This enquiry changed. Refresh before editing.'}};
  await page.goto('/operations/enquiries');
  const card = page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN'});
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  await card.getByLabel('Internal follow-up note', {exact: true}).fill('This stale edit must not replace the newer note.');
  await card.getByRole('button', {name: 'Save follow-up', exact: true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Refresh the list');
  await expect(card.getByRole('button', {name: 'Save follow-up', exact: true})).toBeDisabled();
  provider.overrides[endpoint] = {body: listing([row({version: 2, status: 'QUOTED', internalNote: 'Latest staff update.'})])};
  await page.getByRole('button', {name: 'Refresh enquiries', exact: true}).click();
  await expect(card).toContainText('Quoted');
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  await expect(card.getByLabel('Internal follow-up note', {exact: true})).toHaveValue('Latest staff update.');
  expect(provider.requests('/api/admin/enquiries').filter(call => call.method === 'PATCH')).toHaveLength(1);
});

test('Safar retry queues existing enquiry delivery in its recorded mode without creating another customer enquiry', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: listing([row({crmStatus: 'ACTION_REQUIRED'})])};
  provider.overrides[retry] = {body: {ok: true}};
  await page.goto('/operations/enquiries');
  const card = page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN'});
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  provider.overrides[endpoint] = {body: listing([row({crmStatus: 'PENDING', version: 2})])};
  await card.getByRole('button', {name: 'Retry Safar delivery', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'Safar delivery queued for retry in the recorded mode'})).toBeVisible();
  await expect(card).toContainText('Safar delivery pending');
  await expect(card).toContainText('Safar · Test enquiries');
  expect(provider.requests('/api/admin/enquiries').find(call => call.method === 'POST')?.body).toEqual({id: row().id, version: 1, action: 'retry_crm'});
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
});

test('Safar live delivery is clearly distinguished from test enquiries', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: listing([row({crmStatus: 'DELIVERED', crmEnvironment: 'live', crmReference: 'ME-SAFAR-LIVE'})])};
  await page.goto('/operations/enquiries');
  const card = page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN', exact: true});
  await expect(card).toContainText('Saved in Safar');
  await expect(card).toContainText('Safar · Live enquiries');
  await expect(card).not.toContainText('Test enquiries');
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  await expect(card).toContainText('Safar reference');
  await expect(card.getByRole('button', {name: 'Retry Safar delivery', exact: true})).toHaveCount(0);
});

for (const crmStatus of ['DESTINATION_REVIEW', 'LEGACY_DELIVERY'] as const) test(`${crmStatus} records explain their previous destination and cannot be retried to Safar`, async ({page, provider}) => {
  provider.overrides[endpoint] = {body: listing([row({crmStatus, crmEnvironment: undefined, crmReference: 'LEGACY-REFERENCE'})])};
  await page.goto('/operations/enquiries');
  const card = page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN', exact: true});
  await expect(card).toContainText(crmStatus === 'DESTINATION_REVIEW' ? 'Automatic delivery is held' : 'not confirmation in Safar');
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  await expect(card).toContainText('Previous CRM reference');
  await expect(card).not.toContainText('Safar · Live enquiries');
  await expect(card).not.toContainText('Safar · Test enquiries');
  await expect(card.getByRole('button', {name: 'Retry Safar delivery', exact: true})).toHaveCount(0);
  expect(provider.requests('/api/admin/enquiries').every(call => call.method === 'GET')).toBe(true);
});

test('a missing optional delivery mode is shown as unavailable and never assumed live', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: listing([row({crmStatus: 'ACTION_REQUIRED', crmEnvironment: undefined})])};
  await page.goto('/operations/enquiries');
  const card = page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN', exact: true});
  await expect(card).toContainText('Safar mode unavailable');
  await expect(card).toContainText('retry is disabled here');
  await card.getByText('Travel details & follow-up', {exact: true}).click();
  await expect(card.getByRole('button', {name: 'Retry Safar delivery', exact: true})).toHaveCount(0);
  expect(provider.requests('/api/admin/enquiries').every(call => call.method === 'GET')).toBe(true);
});

test('denied admin access never shows contact records and can be checked again after sign-in', async ({page, provider}) => {
  provider.session = null;
  provider.overrides[endpoint] = {status: 403, body: {error: 'Operations access requires a verified staff account.'}};
  await page.goto('/operations/enquiries');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('verified staff');
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Account & security', exact: true})).toBeVisible();
  provider.overrides[endpoint] = {body: listing()};
  await page.getByRole('button', {name: 'Refresh enquiries', exact: true}).click();
  await expect(page.getByRole('article', {name: 'ME-SYNTHETIC-ADMIN'})).toBeVisible();
});
