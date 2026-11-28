import test from 'node:test';
import assert from 'node:assert/strict';
import {flightAlliance} from '../src/lib/flight-alliances';
import type {Flight, FlightSegment} from '../src/lib/booking-presentation';

function segment(code?: string, dt = '2026-11-28T09:00:00+05:30'): FlightSegment {
  return {
    dt, at: '2026-11-28T10:30:00+05:30', da: {code:'BOM'}, aa: {code:'DEL'},
    fD: {aI: {name:'Air India', code}, fN:'202'},
  };
}

function trip(...sI: FlightSegment[]): Flight {
  return {sI, totalPriceList: []};
}

test('same-alliance segments match based on member designators',()=>{
  assert.equal(flightAlliance(trip(segment(' ai '), segment('UA'))),'star-alliance');
  assert.equal(flightAlliance(trip(segment('QR'), segment('AS'))),'oneworld');
  assert.equal(flightAlliance(trip(segment('SK'), segment('AF'))),'skyteam');
  assert.equal(flightAlliance(trip(segment('AI'), segment('AF'))),undefined);
  assert.equal(flightAlliance(trip(segment('AI'), segment())),undefined);
  assert.equal(flightAlliance(trip(segment('AI'), segment('6E'))),undefined);
  assert.equal(flightAlliance(trip()),undefined);
});

test('verified membership changes use each segment departure date at the airport',()=>{
  assert.equal(flightAlliance(trip(segment('AZ','2026-04-01T00:05:00+02:00'))),'star-alliance');
  assert.equal(flightAlliance(trip(segment('AZ','2026-03-31T23:59:00+02:00'))),undefined);
  assert.equal(flightAlliance(trip(segment('OZ','2026-12-16T23:59:00-10:00'))),'star-alliance');
  assert.equal(flightAlliance(trip(segment('AI'), segment('OZ','2026-12-17T00:01:00+09:00'))),undefined);
  assert.equal(flightAlliance(trip(segment('OZ','2026-02-30T09:00:00'))),undefined);
  assert.equal(flightAlliance(trip(segment('OZ','unknown'))),undefined);
});

test('future, suspended and connecting partners are excluded',()=>{
  for (const code of ['PR','S7','SU','HO','OK','UK']) {
    assert.equal(flightAlliance(trip(segment(code))),undefined,code);
  }
});
