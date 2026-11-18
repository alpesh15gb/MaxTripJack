import test from 'node:test';
import assert from 'node:assert/strict';
import {maxAiFlightIntent,resolveDate} from '../src/lib/max-ai-flight-intent';

const today='2026-11-18';
test('clear one-way requests become a direct flight search',()=>{
  assert.deepEqual(maxAiFlightIntent('Flights from Mumbai to Delhi tomorrow',false,today),{from:'BOM',to:'DEL',date:'2026-11-19',adults:1,cabin:'ECONOMY'});
  assert.deepEqual(maxAiFlightIntent('BOM to DEL on 30 November',false,today),{from:'BOM',to:'DEL',date:'2026-11-30',adults:1,cabin:'ECONOMY'});
  assert.deepEqual(maxAiFlightIntent('cheapest flight bangalore to kolkata 5 dec for 2 adults in business',false,today),{from:'BLR',to:'CCU',date:'2026-12-05',adults:2,cabin:'BUSINESS'});
  assert.equal(maxAiFlightIntent('delhi to chennai jan 10',false,today)?.date,'2027-01-10');
});
test('ambiguous, incomplete or richer requests stay with the model',()=>{
  for(const value of ['flights to goa tomorrow','Mumbai to Goa tomorrow','delhi to london on 2 dec','Mumbai to Delhi','Mumbai to Delhi tomorrow and back on friday','Mumbai to Delhi tomorrow with 2 children','goa to delhi tomorrow','Mumbai to Mumbai tomorrow','Mumbai to Delhi 1 jan 2020'])
    assert.equal(maxAiFlightIntent(value,false,today),null,value);
  assert.equal(maxAiFlightIntent('Mumbai to Delhi tomorrow',true,today),null,'follow-ups keep the conversation');
});
test('relative and explicit dates',()=>{
  assert.equal(resolveDate('day after tomorrow',today),'2026-11-20');
  assert.equal(resolveDate('friday',today),'2026-11-20');
  assert.equal(resolveDate('next friday',today),'2026-11-27');
  assert.equal(resolveDate('20/12',today),'2026-12-20');
  assert.equal(resolveDate('31 feb',today),null);
});
