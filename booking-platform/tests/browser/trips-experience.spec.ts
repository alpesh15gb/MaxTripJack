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
  await expect(page.getByRole('link', { name: 'Open account', exact: true })).toHaveAttribute('href', '/account');
  provider.overrides['GET /api/bookings'] = { status: 503, body: { error: 'Booking history is temporarily unavailable.' } };
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
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
