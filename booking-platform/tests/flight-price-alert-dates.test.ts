import assert from 'node:assert/strict';
import test from 'node:test';
import {isFlightPriceAlertDate} from '../src/lib/flight-price-alert-dates';

test('price alerts support tomorrow through 180 days ahead in India time',()=>{
  const midnightInIndia=new Date('2026-11-27T18:30:00Z');
  assert.equal(isFlightPriceAlertDate('2026-11-28',midnightInIndia),false);
  assert.equal(isFlightPriceAlertDate('2026-11-29',midnightInIndia),true);
  assert.equal(isFlightPriceAlertDate('2027-05-27',midnightInIndia),true);
  assert.equal(isFlightPriceAlertDate('2027-05-28',midnightInIndia),false);
  assert.equal(isFlightPriceAlertDate('2027-02-29',midnightInIndia),false);
  assert.equal(isFlightPriceAlertDate(null,midnightInIndia),false);
});
