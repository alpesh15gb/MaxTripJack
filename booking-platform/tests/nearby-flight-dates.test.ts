import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyFlightSearch} from '../src/lib/nearby-flight-dates';

const criteria={product:'FLIGHT',from:'BOM',to:'DEL',date:'2027-01-31',adults:'2',children:'1',infants:'1',cabin:'BUSINESS',returnDate:'2027-02-02'};
test('nearby dates cross months and retain the submitted route, party, cabin and return',()=>{
  const next=nearbyFlightSearch(criteria,1,'2027-01-01');assert.equal(next?.date,'2027-02-01');
  const params=new URL(next!.url,'https://example.test').searchParams;
  for(const key of ['from','to','adults','children','infants','cabin','returnDate'])assert.equal(params.get(key),criteria[key as keyof typeof criteria]);
  assert.equal(params.get('autoSearch'),'1');assert.equal(criteria.date,'2027-01-31');
});
test('date navigation cannot create a past departure, move return, or change multi-city legs',()=>{
  assert.equal(nearbyFlightSearch(criteria,-1,'2027-01-31'),null);
  assert.equal(nearbyFlightSearch(criteria,3,'2027-01-01'),null);
  assert.equal(nearbyFlightSearch({...criteria,legs:'[]'},1,'2027-01-01'),null);
  assert.equal(nearbyFlightSearch({...criteria,product:'HOTEL'},1,'2027-01-01'),null);
  assert.equal(nearbyFlightSearch({...criteria,date:'2027-02-30'},1,'2027-01-01'),null);
});
test('starting a nearby search drops stale selection recovery keys',()=>{
  const next=nearbyFlightSearch({...criteria,selectionKey:'old-key',resumeSelection:'1',resumeReview:'1'},1,'2027-01-01');
  assert.ok(next);assert.equal(new URL(next.url,'https://example.test').searchParams.has('selectionKey'),false);
});

test('changing an AI search date drops its saved-result pointer and searches the requested date',()=>{
  const next=nearbyFlightSearch({...criteria,flightSearch:'11111111-1111-4111-8111-111111111111',flightStops:'0',flightSort:'duration',flightAirlineQuery:'IndiGo'},1,'2027-01-01');
  assert.ok(next);
  const params=new URL(next.url,'https://example.test').searchParams;
  assert.equal(params.has('flightSearch'),false);
  for(const key of ['flightStops','flightSort','flightAirlineQuery'])assert.equal(params.has(key),false);
  assert.equal(params.get('date'),'2027-02-01');
  assert.equal(params.get('autoSearch'),'1');
});
