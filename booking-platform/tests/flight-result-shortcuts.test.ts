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

test('each sort preview comes from the compatible itinerary it puts first', () => {
  const connecting = flight('connecting', 105, 688000);
  connecting.sI = [
    { ...segment, aa: { code: 'AMD' }, at: '2026-11-24T08:00:00+05:30' },
    { ...segment, da: { code: 'AMD' }, dt: '2026-11-24T09:30:00+05:30', at: '2026-11-24T11:30:00+05:30' },
  ];
  const incompatible = flight('incompatible', 65, 499000);
  incompatible.sI[0].dt = '2026-11-24T02:00:00+05:30';
  const direct = flight('direct', 135, 695000);
  direct.sI[0].dt = '2026-11-24T05:00:00+05:30';
  const options = flightResultShortcuts([incompatible, connecting, direct, flight('fast', 115, 775000)], 'RETURN', fare => fare.id !== 'incompatible');
  assert.deepEqual(options, {
    lowest: { priceMinor: 688000, durationMinutes: 315, departureLabel: '06:15' },
    fastest: { priceMinor: 775000, durationMinutes: 115, departureLabel: '06:15' },
    earliest: { priceMinor: 695000, durationMinutes: 135, departureLabel: '05:00' },
  });
});

test('sort previews keep unknown metrics and foreign fares distinct from available estimates', () => {
  const unknown = flight('unknown-time', 0, 500000);
  unknown.sI[0].dt = 'unknown';
  const foreign = flight('fast-unpriced', 120, 80000, 'USD');
  assert.deepEqual(flightResultShortcuts([unknown, foreign], 'ONWARD'), {
    lowest: { priceMinor: 500000, durationMinutes: null, departureLabel: null },
    fastest: { priceMinor: null, durationMinutes: 120, departureLabel: '06:15' },
    earliest: { priceMinor: null, durationMinutes: 120, departureLabel: '06:15' },
  });
  assert.deepEqual(flightResultShortcuts([foreign], 'COMBO'), {
    lowest: null,
    fastest: null,
    earliest: { priceMinor: null, durationMinutes: null, departureLabel: '06:15' },
  });
});
