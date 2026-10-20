import { test, expect, capture, departure, returning, expectNoHorizontalOverflow } from './fixtures';

const ids = {
  ticket: '71111111-1111-4111-8111-111111111111',
  hotel: '72222222-2222-4222-8222-222222222222',
  pending: '73333333-3333-4333-8333-333333333333',
  failed: '74444444-4444-4444-8444-444444444444',
};

function booking(id: string, reference: string, status: string, product = 'FLIGHT', daysAgo = 1) {
  return {
    id, reference, status, product, currency: 'INR', total_minor: product === 'HOTEL' ? '1840000' : '654000',
    created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    itinerary_summary: product === 'HOTEL'
      ? { hotelName: 'Synthetic Goa Beach Stay', checkIn: departure, checkOut: returning,
          rooms: [{ adults: 2, children: 1, childAge: [7] }, { adults: 2, children: 0, childAge: [] }] }
      : { from: 'BOM', to: 'DEL', date: departure, adults: 1 },
  };
}

test('My trips shows truthful booking states and keeps supplier confirmation within each record', async ({ page, provider }, testInfo) => {
  provider.bookingsPages['1'] = { hasMore: false, bookings: [
    booking(ids.ticket, 'MX-SYNTHETIC-TICKET', 'TICKETED'),
    booking(ids.hotel, 'MX-SYNTHETIC-HOTEL', 'CONFIRMED', 'HOTEL', 2),
    booking(ids.pending, 'MX-SYNTHETIC-AWAITING', 'PAID', 'FLIGHT', 3),
    booking(ids.failed, 'MX-SYNTHETIC-FAILED', 'BOOKING_FAILED', 'FLIGHT', 4),
  ] };
  provider.overrides[`GET /api/bookings/${ids.ticket}/details`] = { body: {
    supplierBookingId: 'SYNTHETIC-FLIGHT-REFERENCE',
    passengers: [{ name: 'Aarav Example', pnrs: ['SYNPNR1'], tickets: ['SYN-TICKET-1'] }],
  } };
  provider.overrides[`GET /api/bookings/${ids.hotel}/details`] = { body: {
    supplierBookingId: 'SYNTHETIC-HOTEL-REFERENCE', hotelName: 'Synthetic Goa Beach Stay', passengers: [],
  } };
  await page.goto('/my-trips');
  const record = (reference: string) => page.getByRole('article').filter({ has: page.getByText(reference, { exact: true }) });
  const ticket = record('MX-SYNTHETIC-TICKET');
  const hotel = record('MX-SYNTHETIC-HOTEL');
  const pending = record('MX-SYNTHETIC-AWAITING');
  const failed = record('MX-SYNTHETIC-FAILED');
  await expect(ticket.getByRole('heading', { name: 'BOM → DEL', exact: true })).toBeVisible();
  await expect(ticket).toContainText('One way · 1 traveller');
  await expect(ticket.getByText('Ticketed', { exact: true })).toBeVisible();
  await expect(hotel.getByRole('heading', { name: 'Synthetic Goa Beach Stay', exact: true })).toBeVisible();
  await expect(hotel).toContainText('2 rooms · 5 guests');
  await expect(hotel.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(pending.getByText('Awaiting supplier', { exact: true })).toBeVisible();
  await expect(pending).toContainText('Your trip is not yet confirmed');
  await expect(failed.getByText('Booking unsuccessful', { exact: true })).toBeVisible();
  await expect(failed).toContainText('The supplier did not confirm this booking');
  for (const unconfirmed of [pending, failed]) {
    await expect(unconfirmed.getByRole('button', { name: 'View confirmation details', exact: true })).toHaveCount(0);
    await expect(unconfirmed.getByRole('link', { name: 'Download confirmation PDF', exact: true })).toHaveCount(0);
  }
  await ticket.getByRole('button', { name: 'View confirmation details', exact: true }).click();
  const ticketDetails = ticket.getByRole('region', { name: 'Confirmation for MX-SYNTHETIC-TICKET', exact: true });
  await expect(ticketDetails).toContainText('SYNPNR1');
  await expect(ticketDetails).toContainText('SYN-TICKET-1');
  await expect(hotel.getByRole('region', { name: 'Confirmation for MX-SYNTHETIC-HOTEL', exact: true })).toHaveCount(0);
  await hotel.getByRole('button', { name: 'View confirmation details', exact: true }).click();
  const hotelDetails = hotel.getByRole('region', { name: 'Confirmation for MX-SYNTHETIC-HOTEL', exact: true });
  await expect(hotelDetails).toContainText('SYNTHETIC-HOTEL-REFERENCE');
  await expect(hotelDetails).not.toContainText('SYNPNR1');
  await ticket.getByRole('button', { name: 'Hide confirmation details', exact: true }).click();
  await expect(ticketDetails).toHaveCount(0);
  await expect(hotelDetails).toBeVisible();
  await ticket.getByRole('button', { name: 'View confirmation details', exact: true }).click();
  await expect(ticketDetails).toBeVisible();
  expect(provider.requests(`/api/bookings/${ids.ticket}/details`)).toHaveLength(1);
  expect(provider.requests(`/api/bookings/${ids.hotel}/details`)).toHaveLength(1);
  await expect(page.locator('.trip-management[open]')).toHaveCount(0);
  expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'my-trips-populated-inline-confirmations');
});

test('older pending trips keep refreshing after pagination and update without dropping loaded records', async ({ page, provider }, testInfo) => {
  await page.clock.install({ time: new Date() });
  const newest = booking(ids.hotel, 'MX-SYNTHETIC-NEWEST', 'CONFIRMED', 'HOTEL');
  const older = booking(ids.pending, 'MX-SYNTHETIC-OLDER', 'BOOKING_PENDING', 'FLIGHT', 30);
  provider.bookingsPages['1'] = { bookings: [newest], hasMore: true };
  provider.bookingsPages['2'] = { bookings: [older], hasMore: false };
  await page.goto('/my-trips');
  await expect(page.getByText('MX-SYNTHETIC-NEWEST', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load older trips', exact: true }).click();
  const oldRecord = page.getByRole('article').filter({ has: page.getByText('MX-SYNTHETIC-OLDER', { exact: true }) });
  await expect(oldRecord.getByText('Confirmation in progress', { exact: true })).toBeVisible();
  await expect(oldRecord.getByRole('button', { name: 'View confirmation details', exact: true })).toHaveCount(0);
  expect(provider.requests('/api/bookings').map(call => call.query.page)).toEqual(['1', '2']);
  provider.bookingsPages['2'] = { bookings: [{ ...older, status: 'TICKETED' }], hasMore: false };
  // Advance the product's actual refresh interval, without an arbitrary sleep
  // or increasing timeouts. Both loaded pages must be read again.
  await page.clock.fastForward(5_000);
  await expect(oldRecord.getByText('Ticketed', { exact: true })).toBeVisible();
  await expect(oldRecord.getByRole('button', { name: 'View confirmation details', exact: true })).toBeVisible();
  await expect(page.getByText('MX-SYNTHETIC-NEWEST', { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(provider.requests('/api/bookings').filter(call => call.query.page === '1')).toHaveLength(2);
  expect(provider.requests('/api/bookings').filter(call => call.query.page === '2')).toHaveLength(2);
  expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'my-trips-older-status-refreshed');
});
