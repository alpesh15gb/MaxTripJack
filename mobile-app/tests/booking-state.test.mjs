import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestGate, createPaymentRecovery, createSearchSnapshot, isQuoteExpired, mergeTripPage, indiaCalendarDay } from '../src/booking-state.ts';

const today = '2026-10-20';
const flight = {
  product: 'FLIGHT', from: 'bom', to: 'del', date: '2026-11-01', end: '2026-11-03',
  adults: '2', children: '1', infants: '1', returnDate: '', multiCity: false,
  extraLegs: [{ from: 'DEL', to: 'BLR', date: '2026-11-02' }],
  hotelIds: '1,2', nationality: '106', hotelRooms: [{ adults: '2', ages: '5,8' }],
};
const hotel = { ...flight, product: 'HOTEL', hotelRooms: [{ adults: '2', ages: '5,8' }, { adults: '1', ages: '0' }] };

// Real deferred promises exercise out-of-order response completion, without API calls.
test('superseded search cannot apply even if transport resolves after abort', async () => {
  const gate = createRequestGate();
  let resolveOld;
  const oldResponse = new Promise(resolve => { resolveOld = resolve; });
  const old = gate.begin();
  const applied = [];
  const oldTask = oldResponse.then(value => { if (old.isCurrent()) applied.push(value); });
  const latest = gate.begin();
  assert.equal(old.signal.aborted, true);
  if (latest.isCurrent()) applied.push('hotel search');
  resolveOld('stale flight search');
  await oldTask;
  assert.deepEqual(applied, ['hotel search']);
});

test('navigation/account teardown invalidates every pending result', () => {
  const gate = createRequestGate();
  const request = gate.begin();
  gate.cancel();
  assert.equal(request.signal.aborted, true);
  assert.equal(request.isCurrent(), false);
  const next = gate.begin();
  assert.equal(next.isCurrent(), true);
  assert.equal(request.isCurrent(), false);
});

test('page one replaces obsolete rows instead of leaking old/account rows', () => {
  const old = [{ id: 'old-account', created_at: '2026-10-20' }];
  const incoming = [{ id: 'current-account', created_at: '2026-10-19' }];
  assert.deepEqual(mergeTripPage(old, incoming, 1), incoming);
  assert.deepEqual(mergeTripPage(old, [], 1), []);
});

test('older trip pages merge uniquely while refreshed records replace old values', () => {
  const current = [{ id: 'a', created_at: '2026-10-20', status: 'PENDING' }];
  const rows = [{ id: 'a', created_at: '2026-10-20', status: 'CONFIRMED' }, { id: 'b', created_at: '2026-10-19', status: 'PENDING' }];
  assert.deepEqual(mergeTripPage(current, rows, 2), rows);
  assert.equal(current[0].status, 'PENDING');
});

test('flight search payload and party are one immutable snapshot', () => {
  const draft = structuredClone(flight);
  const snapshot = createSearchSnapshot(draft, today);
  draft.adults = '9';
  draft.from = 'BLR';
  assert.equal(snapshot.payload.from, 'BOM');
  assert.equal(snapshot.payload.adults, 2);
  assert.deepEqual(snapshot.guests.map(g => g.pt), ['ADULT', 'ADULT', 'CHILD', 'INFANT']);
  assert.ok(snapshot.guests.every(g => g.roomIndex === undefined));
});

test('hotel snapshot retains each room child age and guest-to-room mapping', () => {
  const draft = structuredClone(hotel);
  const { payload, guests } = createSearchSnapshot(draft, today);
  draft.hotelRooms[0].adults = '4';
  draft.hotelRooms[1].ages = '17';
  assert.deepEqual(payload.rooms, [
    { adults: 2, children: 2, childAge: [5, 8] },
    { adults: 1, children: 1, childAge: [0] },
  ]);
  assert.deepEqual(guests.map(g => [g.roomIndex, g.pt]), [[0, 'ADULT'], [0, 'ADULT'], [0, 'CHILD'], [0, 'CHILD'], [1, 'ADULT'], [1, 'CHILD']]);
});

test('hotel occupancy does not depend on an unrelated flight party draft', () => {
  const { guests } = createSearchSnapshot({ ...hotel, adults: 'invalid', children: 'invalid', infants: 'invalid' }, today);
  assert.equal(guests.length, 6);
});

test('multi-city preserves route order and excludes a stale return date', () => {
  const { payload } = createSearchSnapshot({ ...flight, multiCity: true, returnDate: '2026-11-05' }, today);
  assert.deepEqual(payload.legs, [{ from: 'BOM', to: 'DEL', date: '2026-11-01' }, { from: 'DEL', to: 'BLR', date: '2026-11-02' }]);
  assert.equal('returnDate' in payload, false);
});

test('return journey retains the canonical return date', () => {
  assert.equal(createSearchSnapshot({ ...flight, returnDate: '2026-11-05' }, today).payload.returnDate, '2026-11-05');
});

for (const [label, patch] of [
  ['impossible calendar day', { date: '2026-11-31' }],
  ['past departure', { date: '2026-10-19' }],
  ['same airport', { to: 'BOM' }],
  ['missing airport', { from: '' }],
  ['too many passengers', { adults: '9', children: '1' }],
  ['infants exceed adults', { infants: '3' }],
  ['fractional adults', { adults: '1.5' }],
  ['blank child count', { children: '' }],
  ['return before departure', { returnDate: '2026-10-30' }],
  ['multi-city reversed dates', { multiCity: true, extraLegs: [{ from: 'DEL', to: 'BLR', date: '2026-10-30' }] }],
]) {
  test(`rejects ${label} before search`, () => assert.throws(() => createSearchSnapshot({ ...flight, ...patch }, today)));
}

for (const [label, patch] of [
  ['missing destination', { hotelIds: '' }],
  ['missing nationality', { nationality: '' }],
  ['check-out before check-in', { end: '2026-10-30' }],
  ['same-day check-out', { end: '2026-11-01' }],
  ['blank child age in list', { hotelRooms: [{ adults: '2', ages: '5,,8' }] }],
  ['child age over 17', { hotelRooms: [{ adults: '2', ages: '18' }] }],
  ['missing room adult count', { hotelRooms: [{ adults: '', ages: '' }] }],
  ['no rooms', { hotelRooms: [] }],
]) {
  test(`rejects hotel ${label}`, () => assert.throws(() => createSearchSnapshot({ ...hotel, ...patch }, today)));
}

test('quote expiry fails closed for malformed, expired, and exact-boundary values', () => {
  const now = Date.parse('2026-10-20T10:00:00Z');
  assert.equal(isQuoteExpired('invalid', now), true);
  assert.equal(isQuoteExpired('2026-10-20T09:59:59Z', now), true);
  assert.equal(isQuoteExpired('2026-10-20T10:00:00Z', now), true);
  assert.equal(isQuoteExpired('2026-10-20T10:00:01Z', now), false);
});


test('search calendar switches at midnight IST, not device or UTC midnight', () => {
  assert.equal(indiaCalendarDay(new Date('2026-10-20T18:29:59Z')), '2026-10-20');
  assert.equal(indiaCalendarDay(new Date('2026-10-20T18:30:00Z')), '2026-10-21');
  assert.throws(() => createSearchSnapshot({ ...flight, date: '2026-10-20' }, indiaCalendarDay(new Date('2026-10-20T18:30:00Z'))), /past/);
});


test('uncertain checkout blocks all replacement quote and service payment attempts', async () => {
  const payment = createPaymentRecovery(memoryStorage(), 'account-a');
  await payment.hydrate();
  assert.equal(await payment.start('quote-one'), true);
  // A failed create/verify response, new search, changed selection or new service
  // quote has no authority to reset this account-scoped guard.
  for (const action of ['lost create response', 'change selection', 'review new fare', 'new search', 'service quote', 'lost verify response']) {
    assert.equal(payment.isBlocked(), true, action);
    assert.equal(await payment.start('replacement-quote'), false, action);
  }
});

test('only authoritative payment verification unlocks the next payment attempt', async () => {
  const payment = createPaymentRecovery(memoryStorage(), 'account-a');
  await payment.hydrate();
  await payment.start('quote-one');
  await payment.verified('quote-one');
  assert.equal(payment.isBlocked(), false);
  assert.equal(await payment.start('quote-two'), true);
});


function memoryStorage() {
  const rows = new Map();
  return { rows, get: async key => rows.get(key) ?? null, set: async (key, value) => { rows.set(key, value); }, remove: async key => { rows.delete(key); } };
}

test('recovery hydration blocks checkout until persisted state is known', async () => {
  const recovery = createPaymentRecovery(memoryStorage(), 'account-a');
  assert.equal(recovery.isBlocked(), true);
  assert.equal(await recovery.start('quote-one'), false);
  await recovery.hydrate();
  assert.equal(recovery.isBlocked(), false);
});

test('opaque quote ID is durably written before payment create is allowed', async () => {
  const storage = memoryStorage();
  const recovery = createPaymentRecovery(storage, 'account-a');
  await recovery.hydrate();
  assert.equal(await recovery.start('quote-one'), true);
  assert.equal(storage.rows.get('account-a'), 'quote-one');
  assert.equal(recovery.isBlocked(), true);
  assert.equal(await recovery.start('replacement-quote'), false);
  assert.deepEqual([...storage.rows.values()], ['quote-one']);
});

test('app restart keeps unresolved attempt locked without sharing another account marker', async () => {
  const storage = memoryStorage();
  const first = createPaymentRecovery(storage, 'account-a');
  await first.hydrate();
  await first.start('quote-one');
  const restarted = createPaymentRecovery(storage, 'account-a');
  await restarted.hydrate();
  assert.equal(restarted.isBlocked(), true);
  assert.equal(restarted.snapshot().quoteId, 'quote-one');
  assert.equal(await restarted.start('new-quote'), false);
  const otherAccount = createPaymentRecovery(storage, 'account-b');
  await otherAccount.hydrate();
  assert.equal(otherAccount.snapshot().quoteId, null);
  assert.equal(otherAccount.isBlocked(), false);
});

test('unavailable SecureStore fails closed and prevents any create request', async () => {
  const readFailure = createPaymentRecovery({ get: async () => { throw Error('locked'); }, set: async () => {}, remove: async () => {} }, 'account-a');
  await assert.rejects(readFailure.hydrate());
  assert.equal(readFailure.isBlocked(), true);
  assert.equal(await readFailure.start('quote'), false);
  const writeFailure = createPaymentRecovery({ get: async () => null, set: async () => { throw Error('full'); }, remove: async () => {} }, 'account-a');
  await writeFailure.hydrate();
  await assert.rejects(writeFailure.start('quote'));
  assert.equal(writeFailure.isBlocked(), true);
});

test('verified outcome removes recovery marker before unlocking checkout', async () => {
  const storage = memoryStorage();
  const recovery = createPaymentRecovery(storage, 'account-a');
  await recovery.hydrate();
  await recovery.start('quote-one');
  await recovery.verified('quote-one');
  assert.equal(storage.rows.has('account-a'), false);
  assert.equal(recovery.isBlocked(), false);
});

test('failed marker deletion stays locked even after verified result', async () => {
  const recovery = createPaymentRecovery({ get: async () => 'quote-one', set: async () => {}, remove: async () => { throw Error('storage unavailable'); } }, 'account-a');
  await recovery.hydrate();
  await assert.rejects(recovery.verified('quote-one'));
  assert.equal(recovery.isBlocked(), true);
});


test('late verification for an old quote cannot erase a newer pending marker', async () => {
  const storage = memoryStorage();
  const recovery = createPaymentRecovery(storage, 'account-a');
  await recovery.hydrate();
  await recovery.start('quote-one');
  await recovery.verified('quote-one');
  await recovery.start('quote-two');
  await recovery.verified('quote-one');
  assert.equal(storage.rows.get('account-a'), 'quote-two');
  assert.equal(recovery.isBlocked(), true);
});

test('concurrent verification and status reconciliation share one marker deletion', async () => {
  const storage = memoryStorage();
  let release;
  let deletes = 0;
  const deletion = new Promise(resolve => { release = resolve; });
  storage.remove = async key => { deletes += 1; await deletion; storage.rows.delete(key); };
  const recovery = createPaymentRecovery(storage, 'account-a');
  await recovery.hydrate();
  await recovery.start('quote-one');
  const verification = recovery.verified('quote-one');
  const statusRefresh = recovery.verified('quote-one');
  assert.equal(deletes, 1);
  assert.equal(await recovery.start('quote-two'), false);
  release();
  await Promise.all([verification, statusRefresh]);
  assert.equal(await recovery.start('quote-two'), true);
  assert.equal(storage.rows.get('account-a'), 'quote-two');
});

test('concurrent recovery reads cannot overwrite a payment started after hydration', async () => {
  const storage = memoryStorage();
  let release;
  let reads = 0;
  const read = new Promise(resolve => { release = resolve; });
  storage.get = async () => { reads += 1; return read; };
  const recovery = createPaymentRecovery(storage, 'account-a');
  const initial = recovery.hydrate();
  const retry = recovery.hydrate();
  assert.equal(reads, 1);
  release(null);
  await Promise.all([initial, retry]);
  await recovery.start('quote-one');
  await recovery.hydrate();
  assert.equal(reads, 1);
  assert.equal(recovery.snapshot().quoteId, 'quote-one');
  assert.equal(recovery.isBlocked(), true);
});
