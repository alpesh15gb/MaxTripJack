import test from 'node:test';
import assert from 'node:assert/strict';
import {bestFlightScore} from '../src/lib/flight-result-shortcuts';
import {fareIncludesCheckedBag, flightHasCheckedBag, flightLayovers, matchesArrivalWindows, matchesMaxConnection} from '../src/lib/flight-results';
import type {Flight} from '../src/lib/booking-presentation';

const airport = (code: string) => ({code, name: code, city: code});
const segment = (from: string, to: string, dt: string, at: string, nextFrom = to) => ({dt, at, da: airport(from), aa: airport(to), duration: 60, fD: {fN: '1', aI: {name: 'Air', code: 'AI'}}, _next: nextFrom});
const flight = (segments: ReturnType<typeof segment>[], checked?: string) => ({
  sI: segments,
  totalPriceList: [{id: 'f', fD: {ADULT: {bI: checked === undefined ? undefined : {iB: checked, cB: '7 Kg'}}}}],
}) as unknown as Flight;

test('best score prefers a slightly dearer but much shorter flight', () => {
  const cheapSlow = bestFlightScore(500000, 600, 1, 500000, 180);
  const dearFast = bestFlightScore(540000, 180, 0, 500000, 180);
  assert.ok(dearFast < cheapSlow);
  assert.equal(bestFlightScore(null, 200, 0, 500000, 180), Number.MAX_SAFE_INTEGER);
});

test('checked baggage is only counted when an allowance is clearly supplied', () => {
  for (const value of ['15 Kg', '1 Piece', '20KG']) assert.equal(fareIncludesCheckedBag({fD: {ADULT: {bI: {iB: value}}}} as never), true, value);
  for (const value of ['0 Kg', 'No baggage', 'Not included', '', 'Nil']) assert.equal(fareIncludesCheckedBag({fD: {ADULT: {bI: {iB: value}}}} as never), false, value);
  assert.equal(fareIncludesCheckedBag({fD: {}} as never), false);
  assert.equal(flightHasCheckedBag(flight([segment('DEL', 'BOM', '2026-12-01T09:00', '2026-12-01T11:00')], '15 Kg')), true);
});

test('layovers report length, overnight connections and airport changes', () => {
  const overnight = flight([segment('DEL', 'DOH', '2026-12-01T20:00', '2026-12-01T22:30'), segment('DOH', 'LHR', '2026-12-02T07:40', '2026-12-02T12:00')]);
  const [layover] = flightLayovers(overnight);
  assert.deepEqual(layover, {airport: 'DOH', minutes: 550, overnight: true, airportChange: false});
  assert.equal(matchesMaxConnection(overnight, 'ONWARD', '6'), false);
  assert.equal(matchesMaxConnection(overnight, 'ONWARD', ''), true);
  assert.equal(matchesMaxConnection(overnight, 'COMBO', '2'), true, 'complete itineraries are not filtered by layover');
  const direct = flight([segment('DEL', 'BOM', '2026-12-01T09:00', '2026-12-01T11:00')]);
  assert.equal(matchesMaxConnection(direct, 'ONWARD', '2'), true, 'non-stop flights always match');
});

test('arrival windows use the final airport-local arrival time', () => {
  const late = flight([segment('DEL', 'BOM', '2026-12-01T19:00', '2026-12-01T21:10')]);
  assert.equal(matchesArrivalWindows(late, 'ONWARD', ['EVENING']), true);
  assert.equal(matchesArrivalWindows(late, 'ONWARD', ['MORNING']), false);
  assert.equal(matchesArrivalWindows(late, 'ONWARD', []), true);
});
