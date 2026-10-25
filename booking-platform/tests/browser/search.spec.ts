import { test, expect, capture, departure, returning, expectNoHorizontalOverflow, expectFlightToolbarValuesFit, openFlightSearch, reviewedQuote, searchId } from './fixtures';

test('homepage carries canonical airports and selected adults into exactly one search', async ({ page, provider }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A great trip starts with a clear plan.');
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'homepage');
  const form = page.locator('.home-search-form');
  await form.getByLabel('From airport', { exact: true }).fill('Mumbai (BOM)');
  await form.getByLabel('To airport', { exact: true }).fill('del');
  await form.getByLabel(/^Departure/).fill(departure);
  await form.getByRole('combobox', { name: /^Travellers/ }).selectOption('3');
  await form.getByRole('button', { name: 'Search flights', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/book');
  const query = new URL(page.url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({ product: 'FLIGHT', from: 'BOM', to: 'DEL', adults: '3', autoSearch: '1' });
  await expect(page.locator('.airline-identity').getByText('IndiGo', { exact: true })).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/search')[0].body).toMatchObject({
    product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure, adults: 3, children: 0, infants: 0, cabin: 'ECONOMY',
  });
  await expectNoHorizontalOverflow(page);
  await expectFlightToolbarValuesFit(page);
  await capture(page, testInfo, 'flight-results');
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('same airport input is rejected locally, independent of display casing', async ({ page, provider }) => {
  await page.goto('/');
  await page.getByLabel('From airport', { exact: true }).fill('Mumbai (BOM)');
  await page.getByLabel('To airport', { exact: true }).fill('bom');
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  await expect(page.locator('.home-search-form').getByRole('alert')).toContainText('different departure and arrival');
  await expect(page).toHaveURL('/');
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
});

test('homepage hotel selection preserves selected destination and one-room adult occupancy', async ({ page, provider }) => {
  provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Synthetic Goa Beach Stay', options: [] }] } };
  await page.goto('/');
  await page.getByRole('region', { name: 'Plan your trip' }).getByRole('button', { name: 'Hotels', exact: true }).click();
  const form = page.locator('.home-search-form');
  await form.getByLabel('Destination', { exact: true }).fill('Goa');
  await form.getByRole('button', { name: 'Goa, India', exact: true }).click();
  await form.getByLabel(/^Check-in/).fill(departure);
  await form.getByLabel(/^Check-out/).fill(returning);
  await form.getByRole('combobox', { name: /^Guests/ }).selectOption('3');
  await form.getByRole('button', { name: 'Search stays', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/book');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({
    product: 'HOTEL', adults: '3', hotelIds: '10001,10002', city: 'Goa, India', autoSearch: '1',
  });
  await expect(page.getByRole('heading', { name: 'Synthetic Goa Beach Stay', exact: true })).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/search')[0].body).toMatchObject({
    product: 'HOTEL', hotelIds: ['10001', '10002'], adults: 3, checkIn: departure, checkOut: returning,
    rooms: [{ adults: 3, children: 0, childAge: [] }], nationality: '106',
  });
});

test('hotel search sends separate adults and child ages for every room', async ({ page, provider }, testInfo) => {
  provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Synthetic Goa Beach Stay', options: [] }] } };
  provider.quote = reviewedQuote({ product: 'HOTEL', hotelName: 'Synthetic Goa Beach Stay', totalMinor: 1840000,
    summary: { checkIn: departure, checkOut: returning, adults: 3, rooms: [
      { adults: 3, children: 1, childAge: [7] }, { adults: 1, children: 2, childAge: [4, 11] },
    ] }, review: { option: { compliance: {} } },
  });
  const query = new URLSearchParams({ product: 'HOTEL', city: 'Goa, India', hotelIds: '10001,10002', date: departure, end: returning, adults: '3' });
  await page.goto(`/book?${query}`);
  await page.getByRole('combobox', { name: 'Rooms', exact: true }).selectOption('2');
  const firstRoom = page.getByRole('group', { name: 'Room 1 · Guests', exact: true });
  const secondRoom = page.getByRole('group', { name: 'Room 2 · Guests', exact: true });
  await expect(firstRoom.getByRole('combobox', { name: 'Adults', exact: true })).toHaveValue('3');
  await firstRoom.getByRole('combobox', { name: 'Children', exact: true }).selectOption('1');
  await firstRoom.getByLabel('Child 1 age at check-in', { exact: true }).fill('7');
  await secondRoom.getByRole('combobox', { name: 'Adults', exact: true }).selectOption('1');
  await secondRoom.getByRole('combobox', { name: 'Children', exact: true }).selectOption('2');
  await secondRoom.getByLabel('Child 1 age at check-in', { exact: true }).fill('4');
  await secondRoom.getByLabel('Child 2 age at check-in', { exact: true }).fill('11');
  await capture(page, testInfo, 'hotel-room-occupancy');
  await page.getByRole('button', { name: 'Search stays', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic Goa Beach Stay', exact: true })).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/search')[0].body).toMatchObject({ rooms: [
    { adults: 3, children: 1, childAge: [7] }, { adults: 1, children: 2, childAge: [4, 11] },
  ] });
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'hotel-results');
  await page.getByRole('button', { name: 'Choose room', exact: true }).click();
  await page.getByRole('button', { name: 'Review stay', exact: true }).click();
  const review = page.getByRole('form', { name: 'Review and travellers' });
  await expect(review.locator('.traveller-card')).toHaveCount(7);
  await expect(review.getByRole('group', { name: 'Room 1 · Child 4', exact: true })).toBeVisible();
  await expect(review.getByRole('group', { name: 'Room 2 · Adult 5', exact: true })).toBeVisible();
  await expect(review.getByRole('group', { name: 'Room 2 · Child 7', exact: true })).toBeVisible();
  expect(provider.requests('/api/travel/review')[0].body).toEqual({ searchId, hid: '10001', optionId: 'synthetic-breakfast-room' });
});

test('zero results is a useful empty state, not a fare or a booking', async ({ page, provider }, testInfo) => {
  provider.search = { searchId, results: { searchResult: { tripInfos: { ONWARD: [] } } } };
  await openFlightSearch(page);
  await expect(page.getByRole('heading', { name: 'No flights found for these airports', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check fare & continue', exact: true })).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'no-flights');
});

test('search errors remain actionable and an explicit retry sends only one new request', async ({ page, provider }, testInfo) => {
  provider.overrides['POST /api/travel/search'] = { status: 401, body: { error: 'Sign in to continue. No supplier search was made.' } };
  await openFlightSearch(page);
  await expect(page.getByText('Sign in to continue. No supplier search was made.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sign in or create an account/i })).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  await capture(page, testInfo, 'search-sign-in-error');
  delete provider.overrides['POST /api/travel/search'];
  provider.searchDelay = 500;
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  await expect(page.locator('.airline-identity').getByText('IndiGo', { exact: true })).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(2);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('a hotel with no available room options never exposes a review action', async ({ page, provider }, testInfo) => {
  provider.search = { searchId, results: { hotels: [{ tjHotelId: '10001', name: 'Synthetic Goa Beach Stay', options: [] }] } };
  provider.overrides['POST /api/travel/hotel-detail'] = { body: { options: [] } };
  const query = new URLSearchParams({ product: 'HOTEL', city: 'Goa, India', hotelIds: '10001', date: departure, end: returning, autoSearch: '1' });
  await page.goto(`/book?${query}`);
  await page.getByRole('button', { name: 'Choose room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No rooms available', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review stay', exact: true })).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  await capture(page, testInfo, 'hotel-no-rooms');
});

test('a typed hotel city is not searched until an available destination is selected', async ({ page, provider }) => {
  provider.search = { searchId, results: { hotels: [] } };
  const query = new URLSearchParams({ product: 'HOTEL', city: 'Goa', date: departure, end: returning, autoSearch: '1' });
  await page.goto(`/book?${query}`);
  await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('Choose a destination from the suggestions');
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  await page.getByRole('button', { name: 'Goa, India', exact: true }).click();
  await page.getByRole('button', { name: 'Search stays', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No stays found', exact: true })).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});


test('traveller disclosure preserves party and cabin through keyboard close and reopen', async ({ page, provider }, testInfo) => {
  await openFlightSearch(page, { auto: false });
  const form = page.getByRole('form', { name: 'Search availability' });
  const picker = form.locator('.booking-party-picker');
  const summary = picker.locator('summary');
  await expect(picker).not.toHaveAttribute('open');
  await expect(summary).toContainText('1 adult · Economy');
  await expect(picker.getByRole('combobox', { name: 'Adults', exact: true })).not.toBeVisible();
  await summary.focus();
  await summary.press('Enter');
  await expect(picker).toHaveAttribute('open', '');
  await picker.getByRole('combobox', { name: 'Adults', exact: true }).selectOption('2');
  await picker.getByRole('combobox', { name: 'Children · age 2–11', exact: true }).selectOption('1');
  await picker.getByRole('combobox', { name: 'Infants · under 2', exact: true }).selectOption('1');
  await picker.getByRole('combobox', { name: 'Cabin', exact: true }).selectOption('PREMIUM_ECONOMY');
  await expect(summary).toContainText('2 adults · 1 child · 1 infant · Premium economy');
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'travellers-cabin-expanded');
  await summary.focus();
  await summary.press('Enter');
  await expect(picker).not.toHaveAttribute('open');
  await summary.click();
  await expect(picker.getByRole('combobox', { name: 'Adults', exact: true })).toHaveValue('2');
  await expect(picker.getByRole('combobox', { name: 'Children · age 2–11', exact: true })).toHaveValue('1');
  await expect(picker.getByRole('combobox', { name: 'Infants · under 2', exact: true })).toHaveValue('1');
  await expect(picker.getByRole('combobox', { name: 'Cabin', exact: true })).toHaveValue('PREMIUM_ECONOMY');
  await summary.click();
  // Closed disclosure fields remain successful form controls; no search on edit.
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  await form.getByRole('button', { name: 'Search flights', exact: true }).click();
  await expect(page.locator('.airline-identity').getByText('IndiGo', { exact: true })).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/search')[0].body).toMatchObject({
    product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure,
    adults: 2, children: 1, infants: 1, cabin: 'PREMIUM_ECONOMY',
  });
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const photo of ['https://pix8.agoda.net/hotelImages/123/room.jpg','https://i.travelapi.com/lodging/123/room.jpg']){
test(`hotel real supplier metadata and photos render with a truthful broken-photo fallback (${new URL(photo).hostname})`,async({page,provider},testInfo)=>{
 await page.route(photo,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#aacccc"/><text x="20" y="80">Synthetic property fixture</text></svg>'}));
 const property={address:'Example Road, Goa',starRating:4,amenities:['Wi-Fi','Restaurant'],photos:[{url:photo,caption:'Supplier room view',isHero:true}]};
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Fixture stay',customerEstimateMinor:1200000,property}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property,options:[{optionId:'room1',roomInfo:[{name:'Deluxe room'}],inclusions:['Breakfast included'],mealBasis:'Breakfast',pricing:{totalPrice:12000,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,autoSearch:'1'}));
 await expect(page.getByText('Example Road, Goa',{exact:true})).toBeVisible();
 await expect(page.getByText('Property category: 4 stars',{exact:true})).toBeVisible();
 await expect(page.getByRole('list',{name:'Property amenities'}).getByText('Wi-Fi',{exact:true})).toBeVisible();
 await expect(page.getByRole('list',{name:'Property amenities'}).getByText('Restaurant',{exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:'Fixture stay · Supplier room view'})).toBeVisible();
 await expect(page.getByRole('img',{name:'Fixture stay · Supplier room view'})).toHaveAttribute('loading','lazy');
 await expect(page.getByRole('img',{name:'Fixture stay · Supplier room view'})).toHaveAttribute('referrerpolicy','no-referrer');
 await page.getByRole('button',{name:'Choose room',exact:true}).click();
 await expect(page.locator('.room-option-card').getByRole('heading',{name:'Deluxe room',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View all 1 photo',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'hotel-real-metadata-gallery');
 await page.locator('.stay-gallery-stage img').dispatchEvent('error');
 await expect(page.getByRole('dialog')).toContainText('These photos could not be loaded');
 await page.getByRole('button',{name:'Close photo gallery',exact:true}).click();
 await expect(page.locator('.stay-photo-placeholder')).toContainText('No property photos supplied');
});

}
