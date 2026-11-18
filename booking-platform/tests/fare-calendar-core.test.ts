import test from 'node:test';
import assert from 'node:assert/strict';
import {bandFares,compactRupees,lowestAdultFareMinor,staleDates,FARE_CALENDAR_FRESH_MS,FARE_CALENDAR_SHOW_MS} from '../src/lib/fare-calendar-core';

const results=(...estimates:(number|null)[])=>({searchResult:{tripInfos:{ONWARD:[{totalPriceList:estimates.map(customerEstimateMinor=>({customerEstimateMinor}))}]}}});
test('lowest per-adult fare comes only from plain one-way adult searches',()=>{
  assert.equal(lowestAdultFareMinor(results(900000,650000,null),{adults:1}),650000);
  assert.equal(lowestAdultFareMinor(results(1300000),{adults:2}),650000);
  assert.equal(lowestAdultFareMinor(results(650000),{adults:1,children:1}),null);
  assert.equal(lowestAdultFareMinor(results(650000),{adults:1,returnDate:'2026-12-01'}),null);
  assert.equal(lowestAdultFareMinor(results(650000),{adults:1,legs:[{}]}),null);
  assert.equal(lowestAdultFareMinor(results(null),{adults:1}),null);
  assert.equal(lowestAdultFareMinor({},{adults:1}),null);
});
test('bands colour the cheapest third green and hide old observations',()=>{
  const now=10*FARE_CALENDAR_SHOW_MS;
  const days=[500,600,700,800,900,1000].map((minor,index)=>({date:`2026-12-0${index+1}`,minor,observedAt:now}));
  const banded=bandFares([...days,{date:'2026-12-09',minor:100,observedAt:now-FARE_CALENDAR_SHOW_MS}],now);
  assert.equal(banded['2026-12-01'].band,'low');assert.equal(banded['2026-12-06'].band,'high');assert.equal(banded['2026-12-04'].band,'mid');
  assert.equal(banded['2026-12-09'],undefined);
});
test('days older than five minutes are refreshed',()=>{
  const now=1_000_000_000;
  const observed=[{date:'2026-12-01',minor:1,observedAt:now-1000},{date:'2026-12-02',minor:1,observedAt:now-FARE_CALENDAR_FRESH_MS}];
  assert.deepEqual(staleDates(['2026-12-01','2026-12-02','2026-12-03'],observed,now),['2026-12-02','2026-12-03']);
});
test('compact rupees',()=>{assert.equal(compactRupees(962600),'9,626');assert.equal(compactRupees(15000000),'1.5L');});
