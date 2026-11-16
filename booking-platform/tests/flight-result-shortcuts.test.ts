import assert from 'node:assert/strict';
import test from 'node:test';
import type { Flight } from '../src/lib/booking-presentation';
import { flightResultShortcuts } from '../src/lib/flight-result-shortcuts';

const segment: Flight['sI'][number] = {
  da: { code: 'DEL' }, aa: { code: 'BOM' }, dt: '2026-11-24T06:15:00+05:30', at: '2026-11-24T08:30:00+05:30',
  fD: { aI: { name: 'Example Airline' }, fN: '123' }, duration: 135,
};

function flight(id: string, duration: number, price: number, currency?: string): Flight {
  return {
    sI: [{ ...segment, duration, fD: { ...segment.fD, fN: id } }],
    totalPriceList: [{ id, fareIdentifier: 'STANDARD', customerEstimateMinor: price, currency, fD: {} }],
  };
}

test('each shortcut uses the price and duration of one compatible itinerary', () => {
  const connecting = flight('connecting', 105, 688000);
  connecting.sI = [
    { ...segment, aa: { code: 'AMD' }, at: '2026-11-24T08:00:00+05:30' },
    { ...segment, da: { code: 'AMD' }, dt: '2026-11-24T09:30:00+05:30', at: '2026-11-24T11:30:00+05:30' },
  ];
  const options = flightResultShortcuts([
    flight('incompatible', 65, 499000), connecting, flight('direct', 135, 695000), flight('fast', 115, 775000),
  ], 'RETURN', fare => fare.id !== 'incompatible');
  assert.deepEqual(options, {
    lowest: { priceMinor: 688000, durationMinutes: 315 },
    nonstop: { priceMinor: 695000, durationMinutes: 135 },
    fastest: { priceMinor: 775000, durationMinutes: 115 },
  });
});

test('unknown duration and foreign estimates stay unknown, and COMBO has no shortcuts', () => {
  const unknown = flight('unknown-time', 0, 500000);
  unknown.sI[0].dt = 'unknown';
  const foreign = flight('fast-unpriced', 120, 80000, 'USD');
  assert.deepEqual(flightResultShortcuts([unknown, foreign], 'ONWARD'), {
    lowest: { priceMinor: 500000, durationMinutes: null },
    nonstop: { priceMinor: 500000, durationMinutes: null },
    fastest: { priceMinor: null, durationMinutes: 120 },
  });
  assert.deepEqual(flightResultShortcuts([foreign], 'COMBO'), { lowest: null, nonstop: null, fastest: null });
});
