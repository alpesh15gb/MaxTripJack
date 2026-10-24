import { test, expect, departure, expectNoHorizontalOverflow, capture } from './fixtures';

const ticketId = '81111111-1111-4111-8111-111111111111';
const pendingId = '82222222-2222-4222-8222-222222222222';
function trip(id: string, reference: string, status: string, to: string) {
  return {
    id, reference, status, product: 'FLIGHT', currency: 'INR', total_minor: '654000',
    created_at: '2026-10-01T12:00:00Z',
    itinerary_summary: { from: 'BOM', to, date: departure, adults: 1 },
  };
}

test('trip history search and status filters compose and reset without changing bookings', async ({ page, provider }, testInfo) => {
  provider.bookingsPages['1'] = { hasMore: false, bookings: [
    trip(ticketId, 'MX-SYNTHETIC-DELHI', 'TICKETED', 'DEL'),
    trip(pendingId, 'MX-SYNTHETIC-GOA', 'PAID', 'GOI'),
  ] };
  await page.goto('/my-trips');
  await expect(page.getByRole('article')).toHaveCount(2);
  const search = page.getByRole('searchbox', { name: /Search loaded bookings/ });
  await search.fill('synthetic-goa');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('MX-SYNTHETIC-GOA');
  await page.getByRole('button', { name: 'In progress', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await search.fill('synthetic-delhi');
  await expect(page.getByRole('heading', { name: 'No bookings in this view.' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all trips', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('button', { name: 'All trips', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('complementary', { name: 'Trip help' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([]);
  await capture(page, testInfo, 'trip-dashboard-search-and-filter-reset');
});

test('private trips and temporary failures have distinct recovery states', async ({ page, provider }) => {
  provider.overrides['GET /api/bookings'] = { status: 401, body: { error: 'Sign in to view your bookings.' } };
  await page.goto('/my-trips');
  await expect(page.getByRole('heading', { name: 'Let’s get you to your bookings.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open account', exact: true })).toHaveAttribute('href', '/account?returnTo=%2Fmy-trips');
  await expect(page.getByRole('button', { name: 'Refresh booking updates' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  provider.overrides['GET /api/bookings'] = { status: 503, body: { error: 'Booking history is temporarily unavailable.' } };
  await page.reload();
  await expect(page.getByRole('heading', { name: 'We couldn’t load your trips.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open account', exact: true })).toHaveCount(0);
  provider.overrides['GET /api/bookings'] = { body: { bookings: [], hasMore: false } };
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([]);
});

test('cancellation history failures do not imply no request and offer a safe retry', async ({ page, provider }, testInfo) => {
  provider.bookingsPages['1'] = { hasMore: false, bookings: [trip(ticketId, 'MX-SYNTHETIC-CANCEL', 'TICKETED', 'DEL')] };
  const path = `/api/bookings/${ticketId}/cancellation-offer`;
  provider.overrides[`GET ${path}`] = { status: 503, body: { error: 'Cancellation history is temporarily unavailable.' } };
  await page.goto('/my-trips');
  await page.locator('.trip-management > summary').click();
  await expect(page.getByText('Cancellation history is temporarily unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByText('No cancellation request for this booking.', { exact: true })).toHaveCount(0);
  provider.overrides[`GET ${path}`] = { body: { requests: [] } };
  await page.getByRole('button', { name: 'Retry cancellation updates', exact: true }).click();
  await expect(page.getByText('No cancellation request for this booking.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry cancellation updates', exact: true })).toHaveCount(0);
  await page.locator('.trip-management > summary').click();
  await expect(page.locator('.trip-management')).not.toHaveAttribute('open');
  await page.locator('.trip-management > summary').click();
  await expect(page.getByText('No cancellation request for this booking.', { exact: true })).toBeVisible();
  expect(provider.requests(path)).toHaveLength(2);
  expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'trip-cancellation-retry-reopened');
});


test('cancellation submission refreshes progress immediately and uncertain retry reuses its request', async ({ page, provider }) => {
  provider.bookingsPages['1'] = { hasMore: false, bookings: [trip(ticketId, 'MX-SYNTHETIC-CANCEL', 'TICKETED', 'DEL')] };
  const history = `/api/bookings/${ticketId}/cancellation-offer`;
  const submit = `/api/bookings/${ticketId}/cancellation`;
  provider.overrides[`GET ${history}`] = { body: { requests: [] } };
  provider.overrides[`POST ${submit}`] = { status: 503, body: { error: 'Temporary failure' } };
  await page.goto('/my-trips');
  await page.locator('.trip-management > summary').click();
  await expect(page.getByText('No cancellation request for this booking.', { exact: true })).toBeVisible();
  await page.getByLabel('Reason for cancellation').fill('Synthetic change of plans');
  await page.getByRole('button', { name: 'Request cancellation terms', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry existing cancellation request', exact: true })).toBeVisible();
  await expect(page.getByLabel('Reason for cancellation')).toBeDisabled();
  provider.overrides[`GET ${history}`] = { body: { requests: [{ id: 'synthetic-request', status: 'REQUESTED', is_partial: false, review_note: null, refund_offer_minor: null, penalty_minor: null, offer_version: null, offer_expires_at: null, accepted_at: null }] } };
  provider.overrides[`POST ${submit}`] = { status: 202, body: { message: 'Request received.' } };
  await page.getByRole('button', { name: 'Retry existing cancellation request', exact: true }).click();
  await expect(page.locator('.cancellation-progress')).toContainText('REQUESTED');
  await expect(page.getByText('No cancellation request for this booking.', { exact: true })).toHaveCount(0);
  expect(provider.requests(submit)).toHaveLength(2);
  expect(provider.requests(submit)[1].body).toEqual(provider.requests(submit)[0].body);
});

test('trip organiser groups real travel dates, keeps pending separate and explains refund progress', async ({ page, provider },testInfo) => {
  provider.bookingsPages['1'] = { hasMore: true, bookings: [
    {...trip('far-trip','MX-FAR','TICKETED','DEL'),itinerary_summary:{from:'BOM',to:'DEL',date:'2099-12-01'}},
    {...trip('near-trip','MX-NEAR','TICKETED','DEL'),itinerary_summary:{from:'BOM',to:'DEL',date:'2099-01-01'}},
    {...trip('past-trip','MX-PAST','TICKETED','DEL'),itinerary_summary:{from:'BOM',to:'DEL',date:'2020-01-01'}},
    {...trip('cancelled-trip','MX-CANCELLED','CANCELLED','DEL'),refunds:[{id:'refund-synthetic',amountMinor:'12300',status:'PROCESSING'}]},
    trip('pending-trip','MX-PENDING','PAID','DEL'),
  ] };
  await page.goto('/my-trips');
  const upcoming=page.getByRole('region',{name:'Upcoming & current',exact:true});
  await expect(upcoming.getByRole('article')).toHaveCount(2);
  await expect(upcoming.getByRole('article').first()).toContainText('MX-NEAR');
  await expect(page.getByRole('region',{name:'Past travel',exact:true})).toContainText('MX-PAST');
  await expect(page.getByRole('region',{name:'Booking updates & undated trips',exact:true})).toContainText('MX-PENDING');
  await expect(page.getByRole('region',{name:'Cancelled trips',exact:true})).toContainText('Refund processing');
  await expect(page.getByText('Processing or awaiting payment-provider confirmation. Completion is not yet confirmed.')).toBeVisible();
  await expect(page.getByText(/Search, filters and counts cover 5 loaded bookings only/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page,testInfo,'journey-studio-trip-organiser');
  await page.getByRole('button',{name:'Past travel',exact:true}).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

for (const scenario of [
  {name:'valid bounded disclosure',review:{version:1,blocked:false,lines:[{label:'Supplier quote validity (seconds)',text:'180'},{label:'Service restriction',text:'Extras cannot be refunded'},{label:'Supplier notice',text:'Seat eligibility still applies'}]},blocked:false},
  {name:'blocked disclosure',review:{version:1,blocked:true,lines:[]},blocked:true},
  {name:'missing disclosure',review:undefined,blocked:true},
  {name:'legacy raw sensitive terms',review:{conditions:{st:180,apiKey:'never-display-this-secret'},alerts:['never-display-this-secret']},blocked:true},
  {name:'malformed disclosure line',review:{version:1,blocked:false,lines:[{label:'Supplier notice',text:{secret:'never-display-this-secret'}}]},blocked:true},
  {name:'unrecognized financial field',review:{version:1,blocked:false,lines:[{label:'Commission',text:'never-display-this-secret'}]},blocked:true},
]) test(`flight extras: ${scenario.name}`, async ({ page, provider }, testInfo) => {
  provider.bookingsPages['1']={hasMore:false,bookings:[trip(ticketId,'MX-SERVICES','TICKETED','DEL')]};
  provider.overrides[`GET /api/bookings/${ticketId}/cancellation-offer`]={body:{requests:[]}};
  provider.overrides[`POST /api/bookings/${ticketId}/services`]={body:{searchId:'synthetic-service-search',kind:'ANCILLARY',results:{segments:[{id:'segment1',label:'BOM → DEL',pax:[{id:'pax1',name:'Synthetic Traveller',type:'ADULT'}],options:[{kind:'MEAL',code:'MEAL1',label:'Vegetarian meal',amountMinor:50000}]}]}}};
  provider.overrides['POST /api/travel/service-review']={body:{quoteId:'synthetic-service-quote',kind:'ANCILLARY',parentReference:'MX-SERVICES',totalMinor:50000,expiresAt:'2099-01-01T12:00:00Z',review:scenario.review}};
  await page.goto('/my-trips');
  await page.locator('.trip-management > summary').click();
  await page.getByRole('button',{name:'Add seats, meals & baggage'}).click();
  await page.getByRole('combobox',{name:'meal for Synthetic Traveller · BOM → DEL',exact:true}).selectOption('MEAL1');
  await page.getByRole('button',{name:'Review extras total'}).click();
  const terms=page.getByRole('region',{name:'Supplier conditions'});
  if(scenario.blocked){
    await expect(terms).toContainText('Confirmation is unavailable');
    await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();
    // Programmatic form submission must also refuse, not just the disabled button.
    await page.locator('form').filter({has:terms}).evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  }else{
    await expect(terms).toContainText('Supplier quote validity (seconds)');
    await expect(terms).toContainText('180');
    await expect(terms).toContainText('Extras cannot be refunded');
    await expect(terms).toContainText('Seat eligibility still applies');
    await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeEnabled();
  }
  await expect(page.getByText('never-display-this-secret')).toHaveCount(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page,testInfo,`service-disclosure-synthetic-${scenario.name.replaceAll(' ','-')}`);
});
