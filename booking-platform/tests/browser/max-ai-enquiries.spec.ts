import type {Locator, Page} from '@playwright/test';
import type {EnquiryDraft, EnquiryReceipt, EnquiryService, EnquirySubmission} from '../../src/lib/travel-enquiry-contract';
import {test, expect, capture, departure, returning, expectNoHorizontalOverflow, syntheticSession, type ProviderFixture} from './fixtures';

const chat = 'POST /api/travel/max-ai';
const submit = 'POST /api/travel/enquiries';
const lookup = 'GET /api/travel/enquiries';
const drafts: Record<EnquiryService, EnquiryDraft> = {
  VISA: {service: 'VISA', destination: 'United Arab Emirates', travelWindow: 'December 2026, dates flexible', adults: 0, childAges: [6], nationality: 'India', purpose: 'Tourism', countryOfResidence: 'India'},
  INSURANCE: {service: 'INSURANCE', destination: 'Europe', travelWindow: 'Next month, one week', adults: 2, childAges: [6], travellerAges: [35, 32, 6], travelStart: departure, travelEnd: returning},
  HOLIDAY: {service: 'HOLIDAY', destination: 'Bali', travelWindow: 'December 2026', adults: 2, childAges: [], departureCity: 'Hyderabad', durationNights: 5, budgetRupees: 80000, budgetBasis: 'TOTAL'},
  CRUISE: {service: 'CRUISE', destination: 'Singapore', travelWindow: 'January 2027, flexible', adults: 2, childAges: [8], durationNights: 3, cabinPreference: 'Balcony', budgetRupees: 50000, budgetBasis: 'PER_PERSON'},
};
const received = (service: EnquiryService, crmStatus: EnquiryReceipt['crmStatus'] = 'PENDING'): EnquiryReceipt => ({id: '77777777-7777-4777-8777-777777777777', reference: 'ME-SYNTHETIC-001', service, status: 'NEW', createdAt: new Date().toISOString(), crmStatus});

async function openDraft(page: Page, provider: ProviderFixture, service: EnquiryService, draft = drafts[service], expand = true) {
  provider.session = null;
  provider.overrides[chat] = {body: {reply: 'Review this enquiry and submit only when you are ready.', cards: [], actions: [], enquiryDraft: draft, conversationToken: 'synthetic-enquiry-token'}};
  await page.goto('/');
  await page.getByRole('button', {name: 'Open Max AI travel assistant', exact: true}).click();
  const panel = page.getByRole('dialog', {name: 'Max AI', exact: true});
  await panel.getByRole('textbox', {name: 'Your message to Max AI', exact: true}).fill(`Help with my ${service.toLowerCase()} enquiry`);
  await panel.getByRole('button', {name: 'Send message to Max AI', exact: true}).click();
  await expect(panel.getByText('PREPARED FOR YOU · NOT SENT', {exact: true})).toBeVisible();
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
  if (expand) await panel.getByRole('button', {name: 'Review & send enquiry', exact: true}).click();
  return panel.getByRole('form', {name: 'Submit travel enquiry', exact: true});
}

test('opening and validating an enquiry never steal contact focus when animation frames are delayed', async ({page, provider}) => {
  const form = await openDraft(page, provider, 'HOLIDAY', drafts.HOLIDAY, false);
  const holdFrames = () => page.evaluateHandle(() => {
    const request = window.requestAnimationFrame;
    const queued: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => {queued.push(callback); return -queued.length;};
    return () => {window.requestAnimationFrame = request; for (const callback of queued) callback(performance.now());};
  });
  let frames = await holdFrames();
  // Dispatch without Playwright's animation-frame stability wait to reproduce a
  // slow rendering frame while a customer moves quickly to their contact form.
  await page.getByRole('button', {name: 'Review & send enquiry', exact: true}).dispatchEvent('click');
  const name = form.getByLabel('Your name', {exact: true});
  await name.focus();
  await frames.evaluate(resume => resume());
  await frames.dispose();
  await expect(name).toBeFocused();
  await page.keyboard.type('Private Enquiry Contact');
  await expect(name).toHaveValue('Private Enquiry Contact');
  await expect(form.getByLabel('Destination', {exact: true})).toHaveValue('Bali');
  frames = await holdFrames();
  await form.getByRole('button', {name: 'Submit enquiry', exact: true}).dispatchEvent('click');
  await expect(form.getByRole('alert')).toContainText('highlighted details');
  await name.focus();
  await frames.evaluate(resume => resume());
  await frames.dispose();
  await expect(name).toBeFocused();
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
});

async function fillContact(page: Page, channel: 'EMAIL' | 'PHONE' | 'WHATSAPP' = 'EMAIL', target?: Locator) {
  const form = target ?? page.getByRole('form', {name: 'Submit travel enquiry', exact: true});
  await form.getByLabel('Your name', {exact: true}).fill('Private Enquiry Contact');
  await form.getByLabel('Preferred reply method', {exact: true}).selectOption(channel);
  await form.locator('input[name="email"]').fill('Enquiry.Private@Example.Test');
  if (channel !== 'EMAIL') await form.locator('input[name="phone"]').fill('9876543210');
  await form.getByRole('checkbox', {name: /I confirm these details/}).check();
}

for (const service of ['VISA', 'INSURANCE', 'HOLIDAY', 'CRUISE'] as const) {
  test(`${service} enquiry requires customer confirmation, saves one request, and keeps contact outside AI`, async ({page, provider}, info) => {
    provider.overrides[submit] = {body: {enquiry: received(service, service === 'CRUISE' ? 'NOT_CONFIGURED' : 'PENDING')}};
    const form = await openDraft(page, provider, service);
    await expect(form.locator('input[name="adults"]')).toHaveValue(String(drafts[service].adults));
    if (service === 'VISA') await form.getByLabel('Destination country', {exact: true}).fill('Dubai, United Arab Emirates');
    const channel = service === 'CRUISE' ? 'WHATSAPP' : service === 'HOLIDAY' ? 'PHONE' : 'EMAIL';
    await fillContact(page, channel);
    expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
    await form.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
    const confirmation = page.getByRole('region', {name: 'Enquiry saved', exact: true});
    await expect(confirmation).toContainText('ME-SYNTHETIC-001');
    await expect(confirmation).toContainText('not a booking');
    await expect(confirmation).not.toContainText('CRM');
    if (service === 'VISA') await expect(confirmation).toContainText('Dubai, United Arab Emirates');
    const requests = provider.requests('/api/travel/enquiries');
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({consent: true, draft: {...drafts[service], ...(service === 'VISA' ? {destination: 'Dubai, United Arab Emirates'} : {})}, contact: {name: 'Private Enquiry Contact', email: 'enquiry.private@example.test', preferredChannel: channel}});
    const submitted = requests[0].body as EnquirySubmission;
    expect(submitted.requestId).toMatch(/^[a-f0-9-]{36}$/);
    if (channel !== 'EMAIL') expect(submitted.contact.phone).toBe('+919876543210');
    const aiRequests = JSON.stringify(provider.requests('/api/travel/max-ai'));
    expect(aiRequests).not.toContain('Enquiry Contact');
    expect(aiRequests).not.toContain('enquiry.private');
    expect(aiRequests).not.toContain('9876543210');
    expect(provider.requests('/api/payments/create')).toHaveLength(0);
    await expectNoHorizontalOverflow(page);
    await capture(page, info, `max-ai-${service.toLowerCase()}-enquiry-saved`);
  });
}

test('invalid insurance ages and unchecked consent keep the enquiry unsent with recoverable field errors', async ({page, provider}) => {
  const form = await openDraft(page, provider, 'INSURANCE');
  await fillContact(page);
  await form.getByLabel('Every traveller’s age', {exact: true}).fill('35, 32');
  await form.getByRole('checkbox', {name: /I confirm these details/}).uncheck();
  await form.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
  await expect(form.getByLabel('Every traveller’s age', {exact: true})).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('checkbox', {name: /I confirm these details/})).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('alert')).toContainText('highlighted details');
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
  await form.getByLabel('Every traveller’s age', {exact: true}).fill('35, 32, 6');
  await form.getByRole('checkbox', {name: /I confirm these details/}).check();
  provider.overrides[submit] = {body: {enquiry: received('INSURANCE')}};
  await form.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Enquiry saved'})).toBeVisible();
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(1);
});

test('uncertain save checks and retries use the original request and frozen contact instead of creating another enquiry', async ({page, provider}) => {
  provider.overrides[submit] = {status: 503, body: {error: 'The save outcome is temporarily unavailable.'}};
  provider.overrides[lookup] = {body: {enquiry: null}};
  const form = await openDraft(page, provider, 'HOLIDAY');
  await fillContact(page);
  await form.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
  await expect(form.getByText('The save outcome is not confirmed.', {exact: false})).toBeVisible();
  await expect(form.getByLabel('Your name', {exact: true})).toBeDisabled();
  const first = provider.requests('/api/travel/enquiries')[0].body as EnquirySubmission;
  await form.getByRole('button', {name: 'Check save status', exact: true}).click();
  await expect(form.getByRole('status')).toContainText('No saved result is available yet');
  expect(provider.requests('/api/travel/enquiries')[1].query.requestId).toBe(first.requestId);
  provider.overrides[submit] = {status: 429, body: {error: 'Please wait before trying again.'}};
  await form.getByRole('button', {name: 'Retry same enquiry', exact: true}).click();
  await expect(form.getByRole('alert')).toContainText('Please wait');
  await expect(form.getByLabel('Your name', {exact: true})).toBeDisabled();
  provider.overrides[submit] = {body: {enquiry: received('HOLIDAY')}};
  await form.getByRole('button', {name: 'Retry same enquiry', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Enquiry saved'})).toContainText('ME-SYNTHETIC-001');
  const writes = provider.requests('/api/travel/enquiries').filter(call => call.method === 'POST');
  expect(writes).toHaveLength(3);
  expect(writes[1].body).toEqual(first);
  expect(writes[2].body).toEqual(first);
  expect(provider.requests('/api/travel/max-ai')).toHaveLength(1);
});

test('checking an uncertain save recovers the receipt without another submission', async ({page, provider}) => {
  provider.overrides[submit] = {status: 502, body: {error: 'Connection interrupted.'}};
  provider.overrides[lookup] = {body: {enquiry: received('CRUISE', 'DELIVERED')}};
  const form = await openDraft(page, provider, 'CRUISE');
  await fillContact(page, 'WHATSAPP');
  await form.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
  await form.getByRole('button', {name: 'Check save status', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Enquiry saved'})).toContainText('ME-SYNTHETIC-001');
  expect(provider.requests('/api/travel/enquiries').filter(call => call.method === 'POST')).toHaveLength(1);
});

test('rapid submit events save once, and private enquiry fields are not retained in browser storage', async ({page, provider}) => {
  provider.overrides[submit] = {body: {enquiry: received('VISA')}};
  const form = await openDraft(page, provider, 'VISA');
  await fillContact(page);
  await form.evaluate((element: HTMLFormElement) => {element.requestSubmit(); element.requestSubmit();});
  await expect(page.getByRole('region', {name: 'Enquiry saved'})).toBeVisible();
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(1);
  const storage = await page.evaluate(() => JSON.stringify({local: {...localStorage}, session: {...sessionStorage}}));
  expect(storage).not.toContain('Enquiry Contact');
  expect(storage).not.toContain('enquiry.private');
});

test('new chat and account change clear unsent private enquiry contact without a submission', async ({page, provider}) => {
  let form = await openDraft(page, provider, 'VISA');
  await fillContact(page);
  const panel = page.getByRole('dialog', {name: 'Max AI', exact: true});
  await panel.getByRole('button', {name: 'New chat', exact: true}).click();
  await expect(form).toHaveCount(0);
  await panel.getByRole('button', {name: 'Visa assistance', exact: true}).click();
  await panel.getByRole('button', {name: 'Review & send enquiry', exact: true}).click();
  form = panel.getByRole('form', {name: 'Submit travel enquiry', exact: true});
  await expect(form.getByLabel('Your name', {exact: true})).toHaveValue('');
  await fillContact(page);
  provider.session = syntheticSession('66666666-6666-4666-8666-666666666666');
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/get-session');
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {key: 'better-auth.message', newValue: JSON.stringify({event: 'session', data: {trigger: 'signIn'}, clientId: 'synthetic-other-tab'}), storageArea: localStorage, url: location.href})));
  await refreshed;
  await expect(form).toHaveCount(0);
  await expect(panel.getByRole('heading', {name: 'Where to next?', exact: true})).toBeVisible();
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
});

test('prepared enquiry form remains usable at 320px without horizontal scrolling', async ({page, provider}, info) => {
  await page.setViewportSize({width: 320, height: 740});
  const form = await openDraft(page, provider, 'CRUISE');
  await form.getByText('Dates, budget and other preferences', {exact: true}).click();
  await fillContact(page, 'WHATSAPP');
  await expect(form.getByRole('button', {name: 'Submit enquiry', exact: true})).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const widths = await page.locator('.max-ai-messages').evaluate(element => ({width: element.clientWidth, scroll: element.scrollWidth}));
  expect(widths.scroll).toBeLessThanOrEqual(widths.width + 1);
  await capture(page, info, 'max-ai-enquiry-form-320');
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
});

test('a corrected draft supersedes only the earlier unsent enquiry for the same service', async ({page, provider}) => {
  await openDraft(page, provider, 'VISA');
  await fillContact(page);
  const panel = page.getByRole('dialog', {name: 'Max AI', exact: true});
  const send = async (draft: EnquiryDraft, message: string) => {
    provider.overrides[chat] = {body: {reply: 'Review the updated enquiry.', cards: [], actions: [], enquiryDraft: draft, conversationToken: 'synthetic-next-enquiry-token'}};
    await panel.getByRole('textbox', {name: 'Your message to Max AI', exact: true}).fill(message);
    await panel.getByRole('button', {name: 'Send message to Max AI', exact: true}).click();
  };
  await send(drafts.INSURANCE, 'I also need insurance.');
  const insurance = panel.getByRole('region', {name: 'Review travel insurance enquiry', exact: true});
  await insurance.getByRole('button', {name: 'Review & send enquiry', exact: true}).click();
  await send({...drafts.VISA, destination: 'Japan'}, 'Change my visa destination to Japan.');
  await expect(panel.getByRole('region', {name: 'Earlier visa assistance enquiry', exact: true})).toContainText('UPDATED ENQUIRY BELOW');
  await expect(insurance.getByRole('form', {name: 'Submit travel enquiry'})).toBeVisible();
  const updated = panel.getByRole('region', {name: 'Review visa assistance enquiry', exact: true});
  await updated.getByRole('button', {name: 'Review & send enquiry', exact: true}).click();
  const form = updated.getByRole('form', {name: 'Submit travel enquiry', exact: true});
  await expect(form.getByLabel('Your name', {exact: true})).toHaveValue('');
  await fillContact(page, 'EMAIL', form);
  provider.overrides[submit] = {body: {enquiry: received('VISA')}};
  await form.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
  await expect(panel.getByRole('region', {name: 'Enquiry saved'})).toContainText('Japan');
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(1);
  expect(provider.requests('/api/travel/enquiries')[0].body).toMatchObject({draft: {service: 'VISA', destination: 'Japan'}});
});

test('advanced supplied details survive review and explicitly cleared preferences are removed', async ({page, provider}) => {
  const draft: EnquiryDraft = {...drafts.HOLIDAY, nationality: 'India', purpose: 'Honeymoon', countryOfResidence: 'India', notes: 'Vegetarian meals'};
  const form = await openDraft(page, provider, 'HOLIDAY', draft);
  await expect(form.getByLabel('Passport nationality', {exact: true})).toHaveValue('India');
  await expect(form.getByLabel('Purpose of travel', {exact: true})).toHaveValue('Honeymoon');
  await form.getByText('Dates, budget and other preferences', {exact: true}).click();
  await form.getByLabel('Budget in INR (optional)', {exact: true}).clear();
  await form.getByLabel('Other travel preferences (optional)', {exact: true}).clear();
  await fillContact(page);
  provider.overrides[submit] = {body: {enquiry: received('HOLIDAY')}};
  await form.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Enquiry saved'})).toBeVisible();
  const payload = provider.requests('/api/travel/enquiries')[0].body as EnquirySubmission;
  expect(payload.draft).toMatchObject({nationality: 'India', purpose: 'Honeymoon', countryOfResidence: 'India', departureCity: 'Hyderabad', durationNights: 5});
  expect(payload.draft.budgetRupees).toBeUndefined();
  expect(payload.draft.budgetBasis).toBeUndefined();
  expect(payload.draft.notes).toBeUndefined();
});

test('an uncertain earlier enquiry can recover its receipt after a corrected draft arrives', async ({page, provider}) => {
  provider.overrides[submit] = {status: 503, body: {error: 'Save outcome unavailable.'}};
  provider.overrides[lookup] = {body: {enquiry: received('VISA')}};
  const originalForm = await openDraft(page, provider, 'VISA');
  await fillContact(page);
  await originalForm.getByRole('button', {name: 'Submit enquiry', exact: true}).click();
  await expect(originalForm.getByRole('button', {name: 'Check save status', exact: true})).toBeVisible();
  const panel = page.getByRole('dialog', {name: 'Max AI', exact: true});
  provider.overrides[chat] = {body: {reply: 'Your revised plan is prepared.', cards: [], actions: [], enquiryDraft: {...drafts.VISA, destination: 'Japan'}}};
  await panel.getByRole('textbox', {name: 'Your message to Max AI', exact: true}).fill('Change the destination to Japan.');
  await panel.getByRole('button', {name: 'Send message to Max AI', exact: true}).click();
  await expect(panel.getByText('This earlier request may already be saved.', {exact: false})).toBeVisible();
  await originalForm.getByRole('button', {name: 'Check save status', exact: true}).click();
  await expect(panel.getByRole('region', {name: 'Enquiry saved'})).toContainText('United Arab Emirates');
  await expect(panel.getByRole('button', {name: 'Review & send enquiry', exact: true})).toBeVisible();
  expect(provider.requests('/api/travel/enquiries').filter(call => call.method === 'POST')).toHaveLength(1);
});
