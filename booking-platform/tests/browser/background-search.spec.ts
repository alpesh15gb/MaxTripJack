import type { Page } from '@playwright/test';
import { test, expect, flight, departure, returning, searchId, expectNoHorizontalOverflow, capture } from './fixtures';

const warmPath = '/api/travel/search/warm';
const searchPath = '/api/travel/search';
type SearchCall = { body: Record<string, unknown>; intent?: string };
function observeSearches(page: Page) {
 const warm: SearchCall[] = [], search: SearchCall[] = [];
 let completedWarm = 0;
 page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (request.method() !== 'POST' || ![warmPath, searchPath].includes(path)) return;
  (path === warmPath ? warm : search).push({ body: request.postDataJSON(), intent: request.headers()['x-search-intent'] });
 });
 page.on('requestfinished', request => { if (new URL(request.url()).pathname === warmPath) completedWarm++; });
 return { warm, search, completed: () => completedWarm };
}
function flightQuery() {
 return '/book?' + new URLSearchParams({ product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure, adults: '1' });
}
function hotelQuery() {
 return '/book?' + new URLSearchParams({ product: 'HOTEL', city: 'Goa', hotelIds: '10001,10002', date: departure, end: returning, adults: '1', nationality: '106' });
}
function nextDay(day: string) {
 const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10);
}
function held() {
 let release!: () => void;
 const promise = new Promise<void>(resolve => { release = resolve; });
 return { promise, release };
}
async function warmAfterEdit(page: Page, observed: ReturnType<typeof observeSearches>, count: number, complete = true) {
 await page.clock.fastForward(1500);
 await expect.poll(() => observed.warm.length).toBe(count);
 if (complete) await expect.poll(observed.completed).toBe(count);
}

test.beforeEach(async ({ page }) => { await page.clock.install({ time: new Date() }); });

test('passive homepage defaults and focus never start a supplier warmup', async ({ page, provider }) => {
 const observed = observeSearches(page);
 await page.goto('/');
 const form = page.locator('.home-search-form');
 await expect(form.getByRole('button', { name: 'Search flights', exact: true })).toBeVisible();
 await form.getByLabel('From airport', { exact: true }).focus();
 await page.clock.fastForward(3000);
 expect(observed.warm).toHaveLength(0); expect(observed.search).toHaveLength(0);
 await page.getByRole('region', { name: 'Plan your trip' }).getByRole('button', { name: 'Hotels', exact: true }).click();
 await form.getByLabel('Destination', { exact: true }).focus();
 await page.clock.fastForward(3000);
 expect(observed.warm).toHaveLength(0); expect(observed.search).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for (const product of ['FLIGHT', 'HOTEL'] as const) {
 test(`${product} complete saved criteria stay passive until the traveller edits`, async ({ page }) => {
  const observed = observeSearches(page);
  await page.goto(product === 'FLIGHT' ? flightQuery() : hotelQuery());
  const form = page.getByRole('form', { name: 'Search availability' });
  await expect(form).toBeVisible();
  await form.getByLabel(product === 'FLIGHT' ? 'Departure' : 'Check-in', { exact: true }).focus();
  await page.clock.fastForward(3000);
  expect(observed.warm).toHaveLength(0); expect(observed.search).toHaveLength(0);
  await expect(page.locator('#booking-results')).toHaveCount(0);
 });
}

test('flight warmups follow exact route and date edits without displaying speculative fares', async ({ page, provider }) => {
 const observed = observeSearches(page);
 await page.goto('/');
 const form = page.locator('.home-search-form');
 await form.getByLabel(/^Departure/).fill(departure);
 await warmAfterEdit(page, observed, 1);
 expect(observed.warm[0].body).toEqual({ product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure, adults: 1, children: 0, infants: 0, cabin: 'ECONOMY' });
 await form.getByLabel('To airport', { exact: true }).fill('HYD');
 await warmAfterEdit(page, observed, 2);
 expect(observed.warm[1].body).toMatchObject({ from: 'BOM', to: 'HYD', date: departure });
 await form.getByLabel(/^Departure/).fill(returning);
 await warmAfterEdit(page, observed, 3);
 expect(observed.warm[2].body).toMatchObject({ from: 'BOM', to: 'HYD', date: returning });
 expect(new Set(observed.warm.map(call => call.intent)).size).toBe(3);
 for (const call of observed.warm) expect(call.intent).toMatch(/^[a-f0-9-]{36}$/i);
 expect(observed.search).toHaveLength(0);
 await expect(page.locator('.live-flight-card')).toHaveCount(0);
 await expect(form.getByRole('button', { name: 'Search flights', exact: true })).toBeEnabled();
 const current = flight(); current.sI[0].aa = { code: 'HYD', city: 'Hyderabad' };
 current.sI[0].dt = `${returning}T09:15:00`; current.sI[0].at = `${returning}T11:25:00`;
 provider.search = { searchId, results: { searchResult: { tripInfos: { ONWARD: [current] } } } };
 await form.getByRole('button', { name: 'Search flights', exact: true }).click();
 await page.waitForURL(url => url.pathname === '/book');
 await expect(page.locator('.live-flight-card')).toHaveCount(1);
 expect(observed.search).toHaveLength(1); expect(observed.search[0]).toEqual(observed.warm[2]);
 expect(observed.warm).toHaveLength(3);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('hotel warming preserves every room, child age, nationality and stay date', async ({ page, provider }) => {
 const observed = observeSearches(page);
 provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Party-matched fixture stay', customerEstimateMinor: 800000 }] } };
 provider.overrides['GET /api/travel/nationalities'] = { body: { nationalities: [{ countryId: '106', name: 'India' }, { countryId: '999', name: 'Fixture nationality' }] } };
 await page.goto(hotelQuery());
 const form = page.getByRole('form', { name: 'Search availability' });
 const first = form.getByRole('group', { name: 'Room 1 · Guests', exact: true });
 await first.getByRole('combobox', { name: 'Adults', exact: true }).selectOption('2');
 await warmAfterEdit(page, observed, 1);
 expect(observed.warm[0].body).toMatchObject({ product: 'HOTEL', hotelIds: ['10001', '10002'], rooms: [{ adults: 2, children: 0, childAge: [] }], nationality: '106', checkIn: departure, checkOut: returning });
 await form.getByRole('combobox', { name: 'Rooms', exact: true }).selectOption('2');
 await first.getByRole('combobox', { name: 'Children', exact: true }).selectOption('1');
 await first.getByLabel('Child 1 age at check-in', { exact: true }).fill('7');
 await form.getByRole('group', { name: 'Room 2 · Guests', exact: true }).getByRole('combobox', { name: 'Adults', exact: true }).selectOption('1');
 await form.getByRole('combobox', { name: 'Guest nationality', exact: true }).selectOption('999');
 await warmAfterEdit(page, observed, 2);
 expect(observed.warm[1].body).toMatchObject({ rooms: [{ adults: 2, children: 1, childAge: [7] }, { adults: 1, children: 0, childAge: [] }], childrenAges: [7], nationality: '999', checkIn: departure });
 await form.getByLabel('Check-in', { exact: true }).fill(nextDay(departure));
 await warmAfterEdit(page, observed, 3);
 expect(observed.warm[2].body).toMatchObject({ checkIn: nextDay(departure), checkOut: returning, rooms: observed.warm[1].body.rooms, nationality: '999' });
 expect(new Set(observed.warm.map(call => call.intent)).size).toBe(3);
 expect(observed.search).toHaveLength(0);
 await form.getByRole('button', { name: 'Search stays', exact: true }).click();
 await expect.poll(() => observed.search.length).toBe(1);
 expect(observed.search[0]).toEqual(observed.warm[2]);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for (const product of ['FLIGHT', 'HOTEL'] as const) {
 test(`${product} Search submits immediately with matching intent while background work is pending`, async ({ page, provider }, info) => {
  const observed = observeSearches(page), gate = held();
  const result = product === 'FLIGHT' ? provider.search : { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Current fixture stay', customerEstimateMinor: 800000 }] } };
  await page.route(`**${warmPath}`, async route => { await gate.promise; await route.fulfill({ json: { status: 'ready' } }).catch(() => {}); });
  await page.route(`**${searchPath}`, async route => { await gate.promise; await route.fulfill({ json: result }).catch(() => {}); });
  try {
   await page.goto(product === 'FLIGHT' ? flightQuery() : hotelQuery());
   const form = page.getByRole('form', { name: 'Search availability' });
   await form.getByLabel(product === 'FLIGHT' ? 'Departure' : 'Check-in', { exact: true }).fill(nextDay(departure));
   await warmAfterEdit(page, observed, 1, false);
   expect(observed.warm[0].intent).toMatch(/^[a-f0-9-]{36}$/i);
   await expect(page.locator('#booking-pending')).toHaveCount(0);
   await form.getByRole('button', { name: product === 'FLIGHT' ? 'Search flights' : 'Search stays', exact: true }).click();
   await expect.poll(() => observed.search.length).toBe(1);
   expect(observed.search[0]).toEqual(observed.warm[0]);
   await expect(page.getByRole('status', { name: 'Search and booking activity' })).toContainText('Waiting for live supplier availability');
   await expectNoHorizontalOverflow(page);
   await capture(page, info, `${product.toLowerCase()}-search-adopts-pending-warm`);
   expect(observed.warm).toHaveLength(1);
   gate.release();
   await expect(page.locator('#booking-results')).toBeVisible();
   await expect(page.locator('#booking-pending')).toHaveCount(0);
   expect(provider.requests('/api/travel/review')).toHaveLength(0);
   expect(provider.requests('/api/payments/create')).toHaveLength(0);
  } finally { gate.release(); }
 });

 test(`${product} failed warmup stays quiet and normal Search still succeeds`, async ({ page, provider }) => {
  const observed = observeSearches(page);
  provider.overrides[`POST ${warmPath}`] = { status: 503, body: { error: 'Synthetic background availability unavailable' } };
  if (product === 'HOTEL') provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Available fallback stay', customerEstimateMinor: 800000 }] } };
  await page.goto(product === 'FLIGHT' ? flightQuery() : hotelQuery());
  const form = page.getByRole('form', { name: 'Search availability' });
  await form.getByLabel(product === 'FLIGHT' ? 'Departure' : 'Check-in', { exact: true }).fill(nextDay(departure));
  await warmAfterEdit(page, observed, 1);
  await expect(page.locator('#booking-feedback')).toBeEmpty();
  await expect(page.getByText('Synthetic background availability unavailable', { exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: product === 'FLIGHT' ? 'Search flights' : 'Search stays', exact: true }).click();
  await expect(page.locator('#booking-results')).toBeVisible();
  expect(observed.search).toHaveLength(1);
  expect(observed.search[0].body).toEqual(observed.warm[0].body);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 });
}

test('homepage hotel warmup carries the selected property batch into Search across navigation', async ({ page, provider }) => {
 const observed = observeSearches(page), gate = held();
 provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Selected destination stay', customerEstimateMinor: 800000 }] } };
 await page.route(`**${warmPath}`, async route => { await gate.promise; await route.fulfill({ json: { status: 'ready' } }).catch(() => {}); });
 try {
  await page.goto('/');
  await page.getByRole('region', { name: 'Plan your trip' }).getByRole('button', { name: 'Hotels', exact: true }).click();
  const form = page.locator('.home-search-form');
  await form.getByLabel(/^Check-in/).fill(departure);
  await form.getByLabel(/^Check-out/).fill(returning);
  await form.getByRole('combobox', { name: /^Guests/ }).selectOption('2');
  await form.getByLabel('Destination', { exact: true }).fill('Goa');
  await form.getByRole('button', { name: 'Goa, India', exact: true }).click();
  await warmAfterEdit(page, observed, 1, false);
  expect(observed.warm[0].intent).toMatch(/^[a-f0-9-]{36}$/i);
  expect(observed.warm[0].body).toMatchObject({ product: 'HOTEL', hotelIds: ['10001', '10002'], checkIn: departure, checkOut: returning, rooms: [{ adults: 2, children: 0, childAge: [] }] });
  await form.getByRole('button', { name: 'Search stays', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/book');
  await expect.poll(() => observed.search.length).toBe(1);
  expect(observed.search[0]).toEqual(observed.warm[0]);
  await expect(page.getByRole('article', { name: 'Selected destination stay' })).toBeVisible();
  expect(observed.warm).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 } finally { gate.release(); }
});
