import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export const departure = futureDate(14);
export const returning = futureDate(18);
export const searchId = '11111111-1111-4111-8111-111111111111';
export const quoteId = '22222222-2222-4222-8222-222222222222';
export const bookingId = '33333333-3333-4333-8333-333333333333';

export function syntheticSession(userId = '55555555-5555-4555-8555-555555555555') {
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  return {
    user: { id: userId, name: 'Synthetic Traveller', email: 'signed-in@example.test', emailVerified: true, createdAt, updatedAt: createdAt },
    session: { id: 'synthetic-session-id', userId, token: 'synthetic-session-not-a-credential',
      createdAt, updatedAt: createdAt, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  };
}

function futureDate(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export function flight(group: 'ONWARD' | 'RETURN' = 'ONWARD', fareId = `${group.toLowerCase()}-standard`) {
  const inbound = group === 'RETURN';
  const date = inbound ? returning : departure;
  return {
    sI: [{
      id: inbound ? 'synthetic-segment-return' : 'synthetic-segment-onward',
      dt: `${date}T09:15:00`, at: `${date}T11:25:00`, duration: 130,
      fD: { aI: { name: 'IndiGo', code: '6E' }, fN: inbound ? '204' : '201' },
      da: { code: inbound ? 'DEL' : 'BOM', city: inbound ? 'New Delhi' : 'Mumbai' },
      aa: { code: inbound ? 'BOM' : 'DEL', city: inbound ? 'Mumbai' : 'New Delhi' },
    }],
    totalPriceList: [{
      id: fareId, fareIdentifier: 'STANDARD', customerEstimateMinor: 654000,
      fD: { ADULT: { cc: 'ECONOMY', rT: 2, fC: { TF: 6540 }, bI: { iB: '15 Kg', cB: '7 Kg' } } },
    }],
  };
}

export function flightResults(roundTrip = false) {
  return { searchId, results: { searchResult: { tripInfos: {
    ONWARD: [flight()], ...(roundTrip ? { RETURN: [flight('RETURN')] } : {}),
  } } } };
}

export function reviewedQuote(overrides: Record<string, unknown> = {}) {
  return {
    quoteId, product: 'FLIGHT', totalMinor: 654000,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    summary: { from: 'BOM', to: 'DEL', date: departure, adults: 1, children: 0, infants: 0 },
    review: { conditions: {}, fareRules: { cancellation: 'Supplier charges apply; review before payment.' } },
    ...overrides,
  };
}

export const hotelOption = {
  optionId: 'synthetic-breakfast-room', mealBasis: 'Breakfast included',
  pricing: { totalPrice: 18400, mf: 0, mft: 0 },
  cancellation: { policy: 'Cancellation charges apply after the displayed deadline.' },
  bookingNotes: 'Synthetic fixture room. No supplier reservation is made.',
};

type Reply = { status?: number; body: unknown };
type Call = { method: string; path: string; query: Record<string, string>; body: unknown };
export type ProviderFixture = {
  session: unknown;
  search: unknown;
  quote: ReturnType<typeof reviewedQuote>;
  overrides: Record<string, Reply>;
  calls: Call[];
  unexpected: string[];
  searchDelay: number;
  bookingsPages: Record<string, unknown>;
  requests: (path: string) => Call[];
};

// A deliberately tiny replacement for the SDK, delivered at the same script
// URL by route.fulfill. Nothing contacts Razorpay; callbacks are driven only by
// a test. It never shows a pretend booking-success screen.
const syntheticGateway = `
(() => {
  const state = window.__syntheticGateway = { opens: [], options: null,
    dismiss() { if (!this.options) throw Error('Checkout was not opened'); this.options.modal.ondismiss(); },
    complete() { if (!this.options) throw Error('Checkout was not opened'); return this.options.handler({
      razorpay_order_id: this.options.order_id,
      razorpay_payment_id: 'pay_SYNTHETICONLY', razorpay_signature: '0'.repeat(64)
    }); },
    fail() { if (this.failed) this.failed(); }
  };
  window.Razorpay = class {
    constructor(options) { this.options = options; }
    open() { state.options = this.options; state.opens.push(this.options.order_id); }
    on(event, callback) { if (event === 'payment.failed') state.failed = callback; }
  };
})();
`;

export const test = base.extend<{ provider: ProviderFixture }>({
  provider: [async ({ page }, use, testInfo) => {
    const provider: ProviderFixture = {
      session: syntheticSession(), search: flightResults(), quote: reviewedQuote(), overrides: {}, calls: [], unexpected: [], searchDelay: 0, bookingsPages: {},
      requests(path) { return this.calls.filter(call => call.path === path); },
    };
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.href === 'https://checkout.razorpay.com/v1/checkout.js') {
        await route.fulfill({ contentType: 'application/javascript', body: syntheticGateway });
        return;
      }
      if (url.origin !== new URL(testInfo.project.use.baseURL??'http://127.0.0.1:3100').origin) {
        // Photos and fonts are local. Any external provider/auth request,
        // image, future SDK dependency or iframe fails closed.
        provider.unexpected.push(`External ${request.method()} ${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        await route.continue();
        return;
      }
      const key = `${request.method()} ${url.pathname}`;
      const body = request.postData() ? request.postDataJSON() : null;
      provider.calls.push({ method: request.method(), path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      let reply: Reply | undefined = provider.overrides[key];
      if (!reply) switch (key) {
        case 'GET /api/packages': reply = { body: {packages:[],truncated:false,unavailableCount:0} }; break;
        case 'GET /api/travel/airports': reply = { body: { airports: [
          { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India' },
          { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'India' },
        ] } }; break;
        case 'GET /api/travel/destinations': reply = { body: { destinations: [{ region_id: '1001', label: 'Goa, India' }] } }; break;
        case 'POST /api/travel/destination-hotels': reply = { body: { hotelIds: ['10001', '10002'], hasMore: false } }; break;
        case 'GET /api/travel/nationalities': reply = { body: { nationalities: [{ countryId: '106', name: 'India' }] } }; break;
        case 'POST /api/travel/search/warm': reply = { body: { status: 'ready' } }; break;
        case 'GET /api/travel/fare-calendar': reply = { body: { days: { [departure]: { minor: 562000, band: 'low' }, [returning]: { minor: 918000, band: 'high' } } } }; break;
        case 'POST /api/travel/fare-calendar': reply = { status: 202, body: {} }; break;
        case 'POST /api/travel/search':
          if (provider.searchDelay) await new Promise(resolve => setTimeout(resolve, provider.searchDelay));
          reply = { body: provider.search }; break;
        case 'POST /api/travel/review': reply = { body: provider.quote }; break;
        case 'POST /api/travel/hotel-detail': reply = { body: { options: [hotelOption] } }; break;
        case 'GET /api/travel/checkout-extras': reply = { body: { segments: [], travellerTypes: ['ADULT'], choices: [] } }; break;
        case 'GET /api/travellers': reply = { body: { travellers: [] } }; break;
        case 'GET /api/payments/config': reply={body:{provider:'RAZORPAY',configured:true}};break;
        case 'POST /api/payments/create': reply = { body: {
          bookingId, orderId: 'order_SYNTHETICONLY', amount: 654000, currency: 'INR', keyId: 'rzp_test_SYNTHETICONLY',
        } }; break;
        case 'POST /api/payments/verify': reply = { body: { bookingId, status: 'PAYMENT_VERIFIED', message: 'Supplier booking is processing.' } }; break;
        case 'GET /api/bookings': reply = { body: provider.bookingsPages[url.searchParams.get('page') ?? '1'] ?? { bookings: [], hasMore: false } }; break;
        case 'GET /api/payments/status': reply = { body: {
          found: true, bookingId, status: 'PAYMENT_PENDING', canResume: true, checkoutResolved: false,
          orderId: 'order_SYNTHETICONLY', amount: 654000,
          currency: 'INR', keyId: 'rzp_test_SYNTHETICONLY', quoteExpiresAt: provider.quote.expiresAt,
        } }; break;
        case 'GET /api/admin/context': reply={body:{userId:'synthetic-staff',name:'Synthetic operations',permissions:['bookings:read','bookings:reconcile','companies:manage','pricing:manage','finance:read','payments:manage','cancellations:manage','cancellations:execute','refunds:manage','refunds:execute','integrations:manage','audit:read']}};break;
        case 'GET /api/auth/get-session': reply = { body: provider.session }; break;
        case 'GET /api/auth/channels': reply = { body: { email: true, whatsapp: false } }; break;
        case 'GET /api/auth/list-accounts': reply = { body: [{ id: 'synthetic-credential', providerId: 'credential', accountId: syntheticSession().user.id }] }; break;
      }
      if (!reply) {
        provider.unexpected.push(key);
        reply = { status: 501, body: { error: `Unmocked UI fixture request: ${key}` } };
      }
      await route.fulfill({ status: reply.status ?? 200, json: reply.body });
    });
    testInfo.annotations.push({ type: 'provider', description: 'Synthetic API and SDK fixtures. No real booking, credentials or payment.' });
    await use(provider);
    await testInfo.attach('synthetic-api-calls.json', { body: JSON.stringify(provider.calls, null, 2), contentType: 'application/json' });
    expect(provider.unexpected, 'All API/provider calls must be explicitly intercepted').toEqual([]);
    expect(pageErrors, 'The real application must not raise browser errors').toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function mainNavigation(page: Page) {
  const navigation = page.getByRole('navigation', {name:'Main navigation'});
  if (!(await navigation.isVisible())) await page.getByRole('button', {name:'Open navigation'}).click();
  return navigation;
}

export async function toggleResultSearch(page: Page) {
  const summary = page.locator('#booking-search > summary');
  const edit = page.getByRole('button', {name: 'Edit search', exact: true});
  await expect(summary.locator('.booking-criteria-field').first()).toBeAttached();
  if (await summary.isVisible()) await summary.click();
  else await edit.click();
}

export async function openFlightSearch(page: Page, options: { auto?: boolean; roundTrip?: boolean } = {}) {
  const query = new URLSearchParams({ product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure, adults: '1' });
  if (options.auto !== false) query.set('autoSearch', '1');
  if (options.roundTrip) query.set('returnDate', returning);
  await page.goto(`/book?${query}`);
}

export async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const image = await page.screenshot({ path: testInfo.outputPath(`${name}-${testInfo.project.name}-synthetic.png`), fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${name} · ${testInfo.project.name} · synthetic provider data`, { body: image, contentType: 'image/png' });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(widths.document, 'Mobile and desktop screens must not scroll horizontally').toBeLessThanOrEqual(widths.viewport + 1);
}

export async function expectFlightToolbarValuesFit(page: Page) {
  const dialog=page.getByRole('dialog',{name:'Filter flights',exact:true});
  // The sort remains outside the native modal and becomes inert while it is open.
  if(await dialog.isVisible())await dialog.getByRole('button',{name:'Close filters',exact:true}).click();
  await expect(page.getByRole('group', { name: 'Sort flights', exact: true })).toBeVisible();
  const filters=page.getByRole('button',{name:/^Filters/});
  if(!(await filters.isVisible())){
    const sidebar=page.getByRole('complementary',{name:'Flight result controls'});
    await expect(sidebar.getByRole('combobox')).toHaveCount(0);
    await expect(sidebar.getByRole('button',{name:'Filter by Non-stop'})).toBeVisible();
    return;
  }
  await filters.click();
  // Phones use the same one-click facets as the desktop sidebar, not dropdowns.
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Filter by Non-stop'})).toBeVisible();
  if(await dialog.isVisible())await dialog.getByRole('button',{name:'Close filters',exact:true}).click();
}

export async function chooseFlightFilter(page: Page, field: 'Stops'|'Airline (any segment)'|'Departure time', value: string) {
  const select=page.getByRole('combobox',{name:field,exact:true});
  if(await select.isVisible()){await select.selectOption(value);return;}
  const dialog=page.getByRole('dialog',{name:'Filter flights',exact:true});
  const toggle=page.getByRole('button',{name:/^Filters/});
  if(!(await dialog.isVisible())&&await toggle.isVisible())await toggle.click();
  const sidebar=await dialog.isVisible()?dialog:page.getByRole('complementary',{name:'Flight result controls'});
  const label=field==='Stops'?['Non-stop','1 stop','2 stops'][Number(value)]:value;
  const times:Record<string,string>={EARLY:'Early morning',MORNING:'Morning',AFTERNOON:'Afternoon',EVENING:'Evening'};
  const button=field==='Departure time'?sidebar.getByRole('button',{name:new RegExp(`^${times[value]} \\d`)}):sidebar.getByRole('button',{name:`Filter by ${label}`,exact:true});
  await button.click();
}

/** Choose a day in the homepage fare calendar (label: Departure, Return, Check-in, Check-out). */
export async function pickHomeDate(scope: Locator, label: string, date: string) {
  await scope.getByRole('button', { name: new RegExp('^' + label + '\\b') }).click();
  const calendar = scope.getByRole('dialog', { name: `Choose ${label.toLowerCase()}` });
  for (let step = 0; step < 14 && !(await calendar.locator(`[data-date="${date}"]`).count()); step++) await calendar.getByRole('button', { name: 'Next month' }).click();
  await calendar.locator(`[data-date="${date}"]`).click();
  await expect(calendar).toHaveCount(0);
}

/** Set the homepage "Travellers & class" (or hotel "Guests") panel. */
export async function setHomeTravellers(scope: Locator, party: { adults?: number; children?: number; infants?: number; cabin?: string }) {
  await scope.locator('.travellers-trigger').click();
  const panel = scope.locator('.travellers-panel');
  const set = async (label: string, target: number | undefined) => {
    if (target === undefined) return;
    const group = panel.getByRole('group', { name: label, exact: true });
    for (let guard = 0; guard < 12; guard++) {
      const value = Number(await group.locator('output').textContent());
      if (value === target) return;
      await group.getByRole('button', { name: value < target ? `More ${label.toLowerCase()}` : `Fewer ${label.toLowerCase()}` }).click();
    }
    throw new Error(`Could not set ${label} to ${target}`);
  };
  await set('Adults', party.adults); await set('Children', party.children); await set('Infants', party.infants);
  if (party.cabin) await panel.getByRole('radio', { name: party.cabin, exact: true }).check({ force: true });
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
}
