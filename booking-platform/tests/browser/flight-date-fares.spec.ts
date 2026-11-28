import type { Page } from '@playwright/test';
import { addDays, type FareCalendarDay } from '../../src/lib/fare-calendar-core';
import { travelDateLabel } from '../../src/lib/travel-date';
import { capture, departure, expect, expectNoHorizontalOverflow, flightResults, openFlightSearch, openNearbyFlightDates, returning, test } from './fixtures';

const calendarPath = '/api/travel/fare-calendar';
const calendarEndpoint = '**/api/travel/fare-calendar**';
const timeline = (page: Page) => page.getByRole('navigation', { name: 'Nearby departure dates' });
const day = (page: Page, date: string) => timeline(page).locator(`button[data-flight-date="${date}"]`);
const fare = (page: Page, date: string) => day(page, date).locator('.flight-date-fare');

function visibleWindow(selected = departure) {
  return { from: 'BOM', to: 'DEL', cabin: 'ECONOMY', start: addDays(selected, -7), days: 15 };
}

function windowQuery(window = visibleWindow()) {
  return { ...window, days: String(window.days) };
}

test('the date strip shows fifteen independently priced dates for the exact visible window', async ({ page, provider }, info) => {
  const window = visibleWindow();
  const dates = Array.from({ length: window.days }, (_, index) => addDays(window.start, index));
  const prices = dates.map((date, index) => [date, { minor: 584000 + 10000 * index, band: 'mid' }] as const);
  provider.overrides[`GET ${calendarPath}`] = { body: { days: Object.fromEntries(prices), pending: [] } };
  provider.overrides[`POST ${calendarPath}`] = { status: 204, body: null };

  await openFlightSearch(page);
  await openNearbyFlightDates(page);
  await expect(timeline(page).locator('button[data-flight-date]')).toHaveCount(15);
  for (const [date, price] of prices) {
    const rupees = (price.minor / 100).toLocaleString('en-IN');
    await expect(fare(page, date)).toHaveText(`₹${rupees}`);
    await expect(day(page, date)).toHaveAccessibleName(new RegExp(`^${travelDateLabel(date)}.*₹${rupees} for 1 adult`));
  }
  const reads = provider.requests(calendarPath).filter(call => call.method === 'GET');
  expect(reads.length).toBeGreaterThan(0);
  for (const read of reads) expect(read.query).toEqual(windowQuery(window));
  await expect(day(page, departure)).toHaveAttribute('aria-current', 'date');
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'fifteen-day-fares');
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('one-adult round trips preserve the return without showing standalone one-way prices', async ({ page, provider }) => {
  provider.search = flightResults(true);
  await openFlightSearch(page, { roundTrip: true });
  await openNearbyFlightDates(page);
  await expect(timeline(page)).toContainText(`Return stays ${travelDateLabel(returning)}`);
  await expect(timeline(page)).toContainText('Round-trip fares depend on both dates.');
  await expect(day(page, addDays(returning, 1))).toBeDisabled();
  await expect(timeline(page)).not.toContainText('₹');
  expect(provider.requests(calendarPath)).toHaveLength(0);
});

test('nearby fares fill progressively without copying an observed price to an unpriced date', async ({ page, provider }) => {
  const later = addDays(departure, 7);
  const missing = addDays(departure, -7);
  const ready: Record<string, FareCalendarDay> = { [departure]: { minor: 654000, band: 'mid' } };
  const warmBodies: unknown[] = [];
  const reads: Record<string, string>[] = [];
  let batchComplete = false;

  await page.route(calendarEndpoint, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      warmBodies.push(request.postDataJSON());
      await route.fulfill({ status: 202, json: { pending: [later, missing] } });
      return;
    }
    reads.push(Object.fromEntries(new URL(request.url()).searchParams));
    const pending = batchComplete || !warmBodies.length ? [] : later in ready ? [missing] : [later, missing];
    await route.fulfill({ json: { days: ready, pending } });
  });

  await openFlightSearch(page);
  await openNearbyFlightDates(page);
  await expect(fare(page, departure)).toHaveText('₹6,540');
  await expect(day(page, later)).toHaveAccessibleName(/checking fare/i);
  await expect(fare(page, missing)).not.toContainText('₹');
  expect(warmBodies[0]).toMatchObject(visibleWindow());

  ready[later] = { minor: 812000, band: 'high' };
  await expect(fare(page, later)).toHaveText('₹8,120');
  await expect(day(page, missing)).toHaveAccessibleName(/checking fare/i);
  batchComplete = true;
  await expect(day(page, missing)).toHaveAccessibleName(/fare (?:not available|unavailable)/i);
  await expect(fare(page, missing)).not.toContainText('₹');
  await expect(fare(page, departure)).toHaveText('₹6,540');
  expect(reads.length).toBeGreaterThan(2);
  for (const read of reads) expect(read).toEqual(windowQuery());
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('a late calendar response cannot overwrite overlapping prices after the date window shifts', async ({ page, provider }) => {
  const next = addDays(departure, 1);
  const overlap = addDays(departure, 3);
  const firstStart = visibleWindow().start;
  const secondStart = visibleWindow(next).start;
  const reads: string[] = [];
  let releaseOldResponse!: () => void;
  let markOldResponseSettled!: () => void;
  const oldResponseHeld = new Promise<void>(resolve => { releaseOldResponse = resolve; });
  const oldResponseSettled = new Promise<void>(resolve => { markOldResponseSettled = resolve; });

  await page.route(calendarEndpoint, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      await route.fulfill({ status: 204 });
      return;
    }
    const start = new URL(request.url()).searchParams.get('start') || '';
    reads.push(start);
    if (start === firstStart) {
      await oldResponseHeld;
      await route.fulfill({ json: { days: { [overlap]: { minor: 315000, band: 'low' } }, pending: [] } })
        .catch(() => { /* Switching ranges may abort the earlier request. */ })
        .finally(markOldResponseSettled);
      return;
    }
    await route.fulfill({ json: { days: { [overlap]: { minor: 729000, band: 'mid' } }, pending: [] } });
  });

  try {
    await openFlightSearch(page);
    await openNearbyFlightDates(page);
    await expect.poll(() => reads).toContain(firstStart);
    const nextResults = flightResults();
    const nextSegment = nextResults.results.searchResult.tripInfos.ONWARD[0].sI[0];
    nextSegment.dt = `${next}T09:15:00`;
    nextSegment.at = `${next}T11:25:00`;
    provider.search = nextResults;
    await day(page, next).click();
    await expect(day(page, next)).toHaveAttribute('aria-current', 'date');
    await expect.poll(() => reads).toContain(secondStart);
    await expect(fare(page, overlap)).toHaveText('₹7,290');
    releaseOldResponse();
    await oldResponseSettled;
    await expect(day(page, firstStart)).toHaveCount(0);
    await expect(fare(page, overlap)).toHaveText('₹7,290');
    expect(provider.requests('/api/travel/search')[1]?.body).toMatchObject({ date: next });
    expect(provider.requests('/api/payments/create')).toHaveLength(0);
  } finally {
    releaseOldResponse();
  }
});
