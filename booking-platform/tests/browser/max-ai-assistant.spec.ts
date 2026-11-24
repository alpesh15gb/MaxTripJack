import {test, expect, capture, expectNoHorizontalOverflow, openFlightSearch, syntheticSession, searchId, departure} from './fixtures';
import type {Page} from '@playwright/test';
import {MAX_AI_BROWSER_TIMEOUT_MS, type MaxAiResponse} from '../../src/lib/max-ai-contract';

const endpoint = 'POST /api/travel/max-ai';
const answer = (overrides: Partial<MaxAiResponse> = {}): MaxAiResponse => ({reply: 'Where are you flying from, where would you like to go, and on which dates?', cards: [], actions: [], conversationToken: 'synthetic-conversation-token', ...overrides});
const launcher = (page: Page) => page.getByRole('button', {name: 'Open Max AI travel assistant', exact: true});
const panel = (page: Page) => page.getByRole('dialog', {name: 'Max AI', exact: true});
const input = (page: Page) => panel(page).getByRole('textbox', {name: 'Your message to Max AI', exact: true});
async function open(page: Page) {
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(input(page)).toBeVisible();
}
async function message(page: Page, text: string) {
  await input(page).fill(text);
  await panel(page).getByRole('button', {name: 'Send message to Max AI', exact: true}).click();
}

test('Max AI opens accessibly and asks for missing travel details without starting a booking', async ({page, provider}, info) => {
  provider.overrides[endpoint] = {body: answer()};
  await page.goto('/');
  await open(page);
  await expect(panel(page)).toHaveJSProperty('open', true);
  if((page.viewportSize()?.width??0)>760)await expect(input(page)).toBeFocused();
  else await expect(panel(page).locator(':focus')).toBeVisible();
  await expect(panel(page)).toContainText('Your travel request is processed by Max AI');
  await capture(page, info, 'max-ai-welcome');
  await panel(page).getByRole('button', {name: 'Find a flight', exact: true}).click();
  await expect(panel(page)).toContainText('Where are you flying from');
  expect(provider.requests('/api/travel/max-ai')[0].body).toEqual({message: 'I want to book a flight ticket.', pageContext: {pathname: '/'}});
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await expectNoHorizontalOverflow(page);
});

test('the guide keeps Max AI in the footer on mobile and restores focus there', async ({page}) => {
  await page.goto('/visa-guide');
  const footerAction = page.getByRole('button', {name: 'Ask Max AI', exact: true});
  if ((page.viewportSize()?.width ?? 0) > 760) {
    await expect(launcher(page)).toBeVisible();
    await expect(footerAction).toBeHidden();
    return;
  }
  await expect(launcher(page)).toBeHidden();
  await footerAction.click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(footerAction).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

test('Max AI shows real-result contracts and only server-authored local handoffs', async ({page, provider}, info) => {
  provider.overrides[endpoint] = {body: answer({reply: 'These are the options returned for your dates. Review current availability and terms before booking.', cards: [
    {id: 'flight-1', type: 'flight', title: 'IndiGo · Mumbai to New Delhi', subtitle: `${departure} · BOM → DEL`, details: ['09:15–11:25 · 2h 10m', 'Non-stop · Economy'], priceMinor: 654000, currency: 'INR', basis: 'Estimated total for 1 traveller', action: {label: 'Compare flight fares', href: `/book?product=FLIGHT&flightSearch=${searchId}`}},
    {id: 'hotel-1', type: 'hotel', title: 'Garden Stay', subtitle: 'New Delhi · 1 room · 2 nights', details: ['Room meals and cancellation terms checked next'], priceMinor: 1120589, currency: 'INR', basis: 'Estimated full-stay total for all rooms', action: {label: 'View rooms', href: `/book?product=HOTEL&browseSearch=${searchId}&stay=10001`}},
  ], actions: [{label: 'Ask our travel team', href: '/contact'}]})};
  await page.goto('/book?product=FLIGHT');
  await open(page);
  await message(page, 'Compare flights and hotels for my trip.');
  const flightCard = panel(page).getByRole('article', {name: 'IndiGo · Mumbai to New Delhi', exact: true});
  const hotelCard = panel(page).getByRole('article', {name: 'Garden Stay', exact: true});
  await expect(flightCard).toContainText('₹6,540');
  await expect(flightCard).toContainText('Estimated total for 1 traveller');
  await expect(flightCard.getByRole('link')).toHaveAttribute('href', `/book?product=FLIGHT&flightSearch=${searchId}`);
  await expect(hotelCard).toContainText('₹11,205.89');
  await expect(hotelCard.getByRole('link')).toHaveAttribute('href', `/book?product=HOTEL&browseSearch=${searchId}&stay=10001`);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'max-ai-live-result-contracts');
  await message(page, 'Only show non-stop flights.');
  expect(provider.requests('/api/travel/max-ai')[1].body).toEqual({message: 'Only show non-stop flights.', conversationToken: 'synthetic-conversation-token', pageContext: {pathname: '/book'}});
  await panel(page).getByRole('link', {name: 'Ask our travel team', exact: true}).last().click();
  await expect(page).toHaveURL('/contact');
  await expect(panel(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('failed AI requests preserve the draft and retry once without duplicating the user turn', async ({page, provider}) => {
  provider.overrides[endpoint] = {status: 503, body: {error: 'Max AI is temporarily unavailable. Please try again shortly.'}};
  await page.goto('/'); await open(page);
  await message(page, 'A hotel in Goa for next weekend');
  await expect(panel(page).getByRole('alert')).toContainText('temporarily unavailable');
  await expect(input(page)).toHaveValue('A hotel in Goa for next weekend');
  await expect(panel(page).getByRole('link', {name: 'Search hotels', exact: true})).toHaveAttribute('href', '/book?product=HOTEL');
  provider.overrides[endpoint] = {body: answer({reply: 'How many rooms and guests will you need?'})};
  await panel(page).getByRole('button', {name: 'Retry request', exact: true}).click();
  await expect(panel(page)).toContainText('How many rooms and guests');
  await expect(panel(page).locator('.max-ai-message--user')).toHaveCount(1);
  expect(provider.requests('/api/travel/max-ai')).toHaveLength(2);
  expect(provider.requests('/api/travel/max-ai')[1].body).toEqual(provider.requests('/api/travel/max-ai')[0].body);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('closing Max AI aborts its request and a late reply cannot reopen or replace the conversation', async ({page, provider}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  let started = false;
  await page.route('**/api/travel/max-ai', async route => {
    started = true;
    await held;
    await route.fulfill({json: answer({reply: 'LATE RESPONSE MUST BE DISCARDED'})}).catch(() => {});
  });
  await page.goto('/'); await open(page);
  await message(page, 'Find a flight tomorrow');
  await expect.poll(() => started).toBe(true);
  await expect(panel(page).getByRole('button', {name: 'Stop Max AI response', exact: true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  release();
  await open(page);
  await expect(panel(page)).toContainText('Response stopped');
  await expect(panel(page)).not.toContainText('LATE RESPONSE MUST BE DISCARDED');
  await expect(panel(page).getByRole('button', {name: 'Send message to Max AI', exact: true})).toBeVisible();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const timeout of [false,true])test(`Max AI ${timeout?'times out':'stops immediately'} and can resend the same turn without duplicating it`,async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let requests=0;
 await page.route('**/api/travel/max-ai',async route=>{
  const first=++requests===1;
  if(first)await held;
  await route.fulfill({json:answer({reply:first?'Ignored response':'The retry worked.'})}).catch(()=>{});
 });
 await page.clock.install();
 await page.goto('/');await open(page);
 const draft='Can you find a flight tomorrow?';
 try{
  await message(page,draft);
  await expect.poll(()=>requests).toBe(1);
  if(timeout){
   await page.clock.fastForward(MAX_AI_BROWSER_TIMEOUT_MS+1000);
   await expect(panel(page).getByRole('alert')).toContainText('too long');
  }else{
   await panel(page).getByRole('button',{name:'Stop Max AI response',exact:true}).click();
   await expect(panel(page).getByRole('status')).toContainText('Response stopped');
  }
  await expect(input(page)).toHaveValue(draft);
  await panel(page).getByRole('button',{name:'Send message to Max AI',exact:true}).click();
  await expect(panel(page)).toContainText('The retry worked.');
  await expect(panel(page).locator('.max-ai-message--user')).toHaveCount(1);
  expect(requests).toBe(2);
  release();
  await expect(panel(page)).not.toContainText('Ignored response');
 }finally{release();}
});

test('all Max AI starters can scroll clear of the composer',async({page})=>{
 await page.setViewportSize({width:390,height:630});
 await page.goto('/');await open(page);
 const action=panel(page).getByRole('button',{name:'Plan a trip',exact:true});
 await action.scrollIntoViewIfNeeded();
 const composer=panel(page).getByRole('form',{name:'Message Max AI'});
 const bounds=await action.boundingBox(), below=await composer.boundingBox();
 expect(bounds&&below&&bounds.y+bounds.height<=below.y).toBe(true);
 await expectNoHorizontalOverflow(page);
});

test('model prose stays plain text and unsafe result actions are never rendered', async ({page, provider}) => {
  const prose = '<img src=x onerror="window.aiInjected=true"> [Pay here](https://untrusted.invalid/pay)';
  provider.overrides[endpoint] = {body: answer({reply: prose, cards: [
    {id: 'unsafe', type: 'flight', title: 'Do not render this card', subtitle: '', details: [], action: {label: 'Unsafe checkout', href: 'javascript:alert(1)'}},
  ], actions: [{label: 'Unsafe website', href: 'https://untrusted.invalid/pay'}, {label: 'Safe support', href: '/customer-support'}]})};
  await page.goto('/book?product=FLIGHT&from=BOM&to=DEL'); await open(page);
  await message(page, 'Help with my trip');
  await expect(panel(page).locator('.max-ai-message-text').last()).toHaveText(prose);
  await expect(panel(page).locator('img')).toHaveCount(0);
  await expect(panel(page).getByRole('link', {name: /Unsafe/})).toHaveCount(0);
  await expect(panel(page).getByRole('article')).toHaveCount(0);
  await expect(panel(page).getByRole('link', {name: 'Safe support', exact: true})).toHaveAttribute('href', '/customer-support');
  const call = provider.requests('/api/travel/max-ai')[0];
  expect(call.body).toEqual({message: 'Help with my trip', pageContext: {pathname: '/book'}});
  const stored = await page.evaluate(() => JSON.stringify({session: {...sessionStorage}, local: {...localStorage}}));
  expect(stored).not.toContain('Help with my trip');
  expect(stored).not.toContain('synthetic-conversation-token');
});

test('new chat and account changes clear prior private replies and continuation tokens', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: answer({reply: 'PRIVATE BOOKING REFERENCE MT-SYNTHETIC'})};
  await page.goto('/'); await open(page);
  await message(page, 'Show my bookings');
  await expect(panel(page)).toContainText('PRIVATE BOOKING REFERENCE');
  await panel(page).getByRole('button', {name: 'New chat', exact: true}).click();
  await expect(panel(page)).not.toContainText('PRIVATE BOOKING REFERENCE');
  await expect(panel(page).getByRole('heading', {name: 'Where to next?', exact: true})).toBeVisible();
  await message(page, 'My trip status');
  expect(provider.requests('/api/travel/max-ai')[1].body).toEqual({message: 'My trip status', pageContext: {pathname: '/'}});
  await expect(panel(page)).toContainText('PRIVATE BOOKING REFERENCE');
  provider.session = syntheticSession('66666666-6666-4666-8666-666666666666');
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/get-session');
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {key: 'better-auth.message', newValue: JSON.stringify({event: 'session', data: {trigger: 'signIn'}, clientId: 'synthetic-other-tab'}), storageArea: localStorage, url: location.href})));
  await refreshed;
  await expect(panel(page)).not.toContainText('PRIVATE BOOKING REFERENCE');
  await expect(panel(page).getByRole('heading', {name: 'Where to next?', exact: true})).toBeVisible();
  await message(page, 'Help me find a flight');
  expect(provider.requests('/api/travel/max-ai')[2].body).toEqual({message: 'Help me find a flight', pageContext: {pathname: '/'}});
});

test('an expired conversation clears private results and a new send never reuses the rejected token', async ({page, provider}) => {
  provider.overrides[endpoint] = {body: answer({reply: 'PRIVATE OLD CONVERSATION', cards: [{id: 'private-booking', type: 'trip', title: 'Old private booking', subtitle: 'Private booking information', details: [], action: {label: 'View bookings', href: '/my-trips'}}]})};
  await page.goto('/'); await open(page);
  await message(page, 'Show my bookings');
  await expect(panel(page).getByRole('article', {name: 'Old private booking', exact: true})).toBeVisible();
  provider.overrides[endpoint] = {status: 409, body: {error: 'Conversation expired.'}};
  await message(page, 'What is the status now?');
  await expect(panel(page).getByRole('alert')).toContainText('conversation has expired');
  await expect(input(page)).toHaveValue('What is the status now?');
  await expect(panel(page)).not.toContainText('PRIVATE OLD CONVERSATION');
  await expect(panel(page).getByRole('article')).toHaveCount(0);
  await expect(panel(page).getByRole('button', {name: 'Retry request', exact: true})).toHaveCount(0);
  expect(provider.requests('/api/travel/max-ai')[1].body).toMatchObject({conversationToken: 'synthetic-conversation-token'});
  provider.overrides[endpoint] = {body: answer({reply: 'Starting a fresh conversation.'})};
  await panel(page).getByRole('button', {name: 'Send message to Max AI', exact: true}).click();
  await expect(panel(page)).toContainText('Starting a fresh conversation.');
  expect(provider.requests('/api/travel/max-ai')[2].body).toEqual({message: 'What is the status now?', pageContext: {pathname: '/'}});
});

test('a payment SDK container retained after dismissal cannot hide the Max AI launcher', async ({page, provider}) => {
  await page.goto('/');
  // Exercise the CSS integration condition without invoking a real payment SDK.
  await page.evaluate(() => {
    const retained = document.createElement('div');
    retained.className = 'razorpay-container';
    retained.hidden = true;
    retained.style.display = 'none';
    document.body.append(retained);
  });
  await expect(launcher(page)).toBeVisible();
  await open(page);
  if((page.viewportSize()?.width??0)>760)await expect(input(page)).toBeFocused();
  else await expect(panel(page).locator(':focus')).toBeVisible();
  await panel(page).getByRole('button', {name: 'Close Max AI', exact: true}).click();
  await expect(launcher(page)).toBeVisible();
  await expect(launcher(page)).toBeFocused();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('320px checkout keeps payment reachable without an AI detour', async ({page, provider}, info) => {
  await page.setViewportSize({width: 320, height: 740});
  await openFlightSearch(page);
  await page.locator('.fare-comparison-trigger').first().click();
  await page.getByRole('button', {name: 'Check fare & continue', exact: true}).click();
  const bar = page.locator('.mobile-booking-action');
  await expect(bar).toBeVisible();
  await expect(launcher(page)).toBeHidden();
  await expect(page.getByRole('button',{name:'Ask Max AI about this booking',exact:true})).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'checkout-320px-no-ai-detour');
  await expect(bar.getByRole('button', {name: /^Agree & pay /})).toBeEnabled();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('the visa and contact enquiry buttons open the in-chat workflow without sending anything',async({page,provider})=>{
  await page.goto('/visa-guide');
  const visa=page.getByRole('button',{name:'Start a visa enquiry with Max AI',exact:true});
  await visa.click();
  await expect(input(page)).toHaveValue('I want to prepare a visa enquiry.');
  await page.keyboard.press('Escape');
  await expect(visa).toBeFocused();
  await page.goto('/contact');
  await page.getByRole('button',{name:'Start a travel enquiry with Max AI',exact:true}).click();
  await expect(input(page)).toBeVisible();
  expect(provider.requests('/api/travel/enquiries')).toHaveLength(0);
  expect(provider.requests('/api/travel/max-ai')).toHaveLength(0);
});
