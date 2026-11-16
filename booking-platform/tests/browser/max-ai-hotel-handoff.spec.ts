import type {Page} from '@playwright/test';
import type {MaxAiResponse} from '../../src/lib/max-ai-contract';
import {travelDateLabel} from '../../src/lib/travel-date';
import {test, expect, capture, departure, searchId, expectNoHorizontalOverflow, type ProviderFixture} from './fixtures';

// Synthetic inventory only. The AI links carry a public destination label;
// availability, dates and occupancy must still come from the owned snapshot.
const destination = 'Hyderabad, India';
const hotelName = 'Neem Tree · synthetic property';
const hotelId = '10001';
const checkOut = (() => {
  const date = new Date(`${departure}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 2);
  return date.toISOString().slice(0, 10);
})();
const rooms = [{adults: 2, childAge: [6]}, {adults: 2, childAge: []}];
const property = {starRating: 3, address: 'Synthetic Road, Hyderabad', amenities: ['Wi-Fi']};
const option = {
  optionId: 'exact-ai-two-room-combination',
  roomInfo: [{id: 'family', name: 'Family room'}, {id: 'double', name: 'Double room'}],
  mealBasis: 'BREAKFAST', inclusions: ['Breakfast', 'Wi-Fi'],
  pricing: {totalPrice: 9661.05, currency: 'INR'},
  cancellation: {isRefundable: false, penalties: []},
};
const criteria = {
  product: 'HOTEL', hotelIds: hotelId, date: departure, end: checkOut,
  adults: '2', rooms: JSON.stringify(rooms), nationality: '106',
};
const hotels = [{tjHotelId: hotelId, name: hotelName, customerEstimateMinor: 966105, property}];
const propertyHref = '/book?' + new URLSearchParams({product: 'HOTEL', browseSearch: searchId, stay: hotelId, city: destination});
const browseHref = '/book?' + new URLSearchParams({product: 'HOTEL', browseSearch: searchId, city: destination});

function fixture(provider: ProviderFixture) {
  // Deliberately omit city: hotel-search-snapshot stores authoritative criteria,
  // while the server-authored Max AI href supplies this cosmetic destination label.
  provider.overrides['POST /api/travel/hotel-search-snapshot'] = {body: {
    searchId, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), criteria, results: {hotels},
  }};
  provider.overrides['POST /api/travel/hotel-detail'] = {body: {property, options: [option]}};
  const response: MaxAiResponse = {
    reply: 'These checked stays match your dates and guests. Choose a stay to compare its current room rates.',
    cards: [{
      id: hotelId, type: 'hotel', title: hotelName, subtitle: destination,
      details: ['2 rooms · 4 adults · 1 child', '2 nights'],
      priceMinor: 966105, currency: 'INR', basis: 'Estimated full-stay total for all rooms',
      action: {label: 'View rooms and rates', href: propertyHref},
    }],
    actions: [{label: 'Compare all checked stays', href: browseHref}],
    conversationToken: 'synthetic-hotel-conversation-token',
  };
  provider.overrides['POST /api/travel/max-ai'] = {body: response};
}

async function expectPreservedCriteria(page: Page) {
  const summary = page.locator('#booking-search>summary');
  await expect(summary).toContainText(destination);
  await expect(summary).not.toContainText('Selected destination');
  await summary.click();
  const form = page.getByRole('form', {name: 'Search availability', exact: true});
  await expect(form.getByLabel('Destination', {exact: true})).toHaveValue(destination);
  await expect(form.locator('input[name="hotelIds"]')).toHaveValue(hotelId);
  await expect(form.getByLabel('Check-in', {exact: true})).toHaveValue(departure);
  await expect(form.getByLabel('Check-out', {exact: true})).toHaveValue(checkOut);
  await expect(form.getByRole('combobox', {name: 'Rooms', exact: true})).toHaveValue('2');
  await expect(form.getByRole('combobox', {name: 'Guest nationality', exact: true})).toHaveValue('106');
  const first = form.getByRole('group', {name: 'Room 1 · Guests', exact: true});
  const second = form.getByRole('group', {name: 'Room 2 · Guests', exact: true});
  await expect(first.getByRole('combobox', {name: 'Adults', exact: true})).toHaveValue('2');
  await expect(first.getByRole('combobox', {name: 'Children', exact: true})).toHaveValue('1');
  await expect(first.getByLabel('Child 1 age at check-in', {exact: true})).toHaveValue('6');
  await expect(second.getByRole('combobox', {name: 'Adults', exact: true})).toHaveValue('2');
  await expect(second.getByRole('combobox', {name: 'Children', exact: true})).toHaveValue('0');
  await summary.click();
}

for (const handoff of ['property', 'compare-all'] as const) {
  test(`Max AI ${handoff} hotel handoff preserves destination and owned multi-room criteria through refresh`, async ({page, provider}, info) => {
    fixture(provider);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto('/');
    await page.getByRole('button', {name: 'Open Max AI travel assistant', exact: true}).click();
    const panel = page.getByRole('dialog', {name: 'Max AI', exact: true});
    await panel.getByRole('textbox', {name: 'Your message to Max AI', exact: true}).fill(
      `Find Hyderabad hotels from ${departure} to ${checkOut}, 2 rooms, 2 adults and a child aged 6 in room 1, 2 adults in room 2, Indian nationality.`,
    );
    await panel.getByRole('button', {name: 'Send message to Max AI', exact: true}).click();
    const card = panel.getByRole('article', {name: hotelName, exact: true});
    await expect(card).toContainText('₹9,661.05');
    const link = panel.getByRole('link', {name: handoff === 'property' ? 'View rooms and rates' : 'Compare all checked stays', exact: true});
    await expect(link).toHaveAttribute('href', handoff === 'property' ? propertyHref : browseHref);
    await link.click();
    await expect(panel).toBeHidden();
    if (handoff === 'compare-all') {
      const hotel = page.getByRole('article', {name: hotelName, exact: true});
      await expect(hotel).toBeVisible();
      await expect(page.locator('#booking-search>summary')).toContainText(destination);
      await hotel.locator('h3').getByRole('link').click();
    }
    await expect(page.locator('#hotel-detail-title')).toHaveText(hotelName);
    const rate = page.locator('[data-room-option-id="exact-ai-two-room-combination"]');
    await expect(rate).toContainText('₹9,661.05');
    await expect(rate).toContainText('BREAKFAST');
    await expect(page.locator('.room-option-card')).toHaveCount(1);
    await expect(page.locator('.stay-date-strip')).toContainText(travelDateLabel(departure));
    await expect(page.locator('.stay-date-strip')).toContainText(travelDateLabel(checkOut));
    await expect(page.locator('.stay-date-strip')).toContainText('2 rooms · 5 guests');
    await expectPreservedCriteria(page);
    expect(provider.requests('/api/travel/hotel-search-snapshot').map(call => call.body)).toEqual([{searchId}]);
    expect(provider.requests('/api/travel/hotel-detail').map(call => call.body)).toEqual([{searchId, hid: hotelId}]);

    await page.reload();
    await expect(page.locator('#hotel-detail-title')).toHaveText(hotelName);
    await expect(rate).toContainText('₹9,661.05');
    await expectPreservedCriteria(page);
    expect(new URL(page.url()).searchParams.get('city')).toBe(destination);
    await expectNoHorizontalOverflow(page);
    await capture(page, info, `max-ai-hotel-${handoff}-destination-preserved`);
    expect(provider.requests('/api/travel/hotel-search-snapshot')).toHaveLength(2);
    expect(provider.requests('/api/travel/hotel-detail').map(call => call.body)).toEqual([{searchId, hid: hotelId}, {searchId, hid: hotelId}]);
    expect(provider.requests('/api/travel/max-ai')).toHaveLength(1);
    expect(provider.requests('/api/travel/search')).toHaveLength(0);
    expect(provider.requests('/api/travel/destination-hotels')).toHaveLength(0);
    expect(provider.requests('/api/travel/review')).toHaveLength(0);
    expect(provider.requests('/api/payments/create')).toHaveLength(0);
  });
}
