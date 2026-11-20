import test from 'node:test';
import assert from 'node:assert/strict';
import {bandFares,compactRupees,fareCalendarWindow,lowestAdultFareMinor,staleDates,FARE_CALENDAR_FRESH_MS,FARE_CALENDAR_SHOW_MS} from '../src/lib/fare-calendar-core';

const results=(...estimates:(number|null)[])=>({searchResult:{tripInfos:{ONWARD:[{totalPriceList:estimates.map((customerEstimateMinor,index)=>({id:`fare-${index}`,customerEstimateMinor}))}]}}});
test('lowest adult fare comes only from a plain one-way search for one adult',()=>{
  assert.equal(lowestAdultFareMinor(results(900000,650000,null),{adults:1}),650000);
  assert.equal(lowestAdultFareMinor(results(1300000),{adults:2}),null);
  assert.equal(lowestAdultFareMinor(results(650000),{adults:1,children:1}),null);
  assert.equal(lowestAdultFareMinor(results(650000),{adults:1,returnDate:'2026-12-01'}),null);
  assert.equal(lowestAdultFareMinor(results(650000),{adults:1,legs:[{}]}),null);
  assert.equal(lowestAdultFareMinor(results(null),{adults:1}),null);
  assert.equal(lowestAdultFareMinor({},{adults:1}),null);
});
test('calendar excludes restricted, unselectable, wrong-class and out-of-bounds fares',()=>{
  const totalPriceList=[
    {id:'public',customerEstimateMinor:650000,fD:{ADULT:{cc:'PREMIUM ECONOMY'}}},
    {id:'student',fareIdentifier:'Student',customerEstimateMinor:450000},
    {id:'return',fareIdentifier:'SPECIAL_RETURN',customerEstimateMinor:150000},
    {id:'economy',customerEstimateMinor:570000,fD:{ADULT:{cc:'ECONOMY'}}},
    {customerEstimateMinor:500000},
    {id:'out-of-bounds',customerEstimateMinor:1_001_000_000},
  ];
  assert.equal(lowestAdultFareMinor({searchResult:{tripInfos:{ONWARD:[{totalPriceList}]}}},{adults:1,cabin:'PREMIUM_ECONOMY'}),650000);
});
test('legacy refresh uses the same 15 days as the timeline, including near today and across months',()=>{
  const near=fareCalendarWindow('2026-11-22','2026-11-20');
  assert.equal(near.length,15);
  assert.equal(near[0],'2026-11-20');
  assert.equal(near[14],'2026-12-04');
  const centered=fareCalendarWindow('2027-01-03','2026-11-20');
  assert.equal(centered[0],'2026-12-27');
  assert.equal(centered[7],'2027-01-03');
  assert.equal(centered[14],'2027-01-10');
});
test('bands colour the cheapest third green and hide old observations',()=>{
  const now=10*FARE_CALENDAR_SHOW_MS;
  const days=[500,600,700,800,900,1000].map((minor,index)=>({date:`2026-12-0${index+1}`,minor,observedAt:now}));
  const banded=bandFares([...days,{date:'2026-12-09',minor:100,observedAt:now-FARE_CALENDAR_SHOW_MS}],now);
  assert.equal(banded['2026-12-01'].band,'low');assert.equal(banded['2026-12-06'].band,'high');assert.equal(banded['2026-12-04'].band,'mid');
  assert.equal(banded['2026-12-09'],undefined);
});
test('price ties preserve real amounts and do not make the whole strip look like a deal',()=>{
  const now=1_000_000_000;
  const prices=[374100,374100,374100,374100,374100,374100,326800,null];
  const days=prices.map((minor,index)=>({date:`2026-12-0${index+1}`,minor,observedAt:now}));
  const banded=bandFares(days,now);
  assert.equal(banded['2026-12-07'].band,'low');
  assert.equal(banded['2026-12-01'].minor,374100);
  assert.notEqual(banded['2026-12-01'].band,'low');
  assert.equal(banded['2026-12-08'],undefined);
  const equal=bandFares(days.slice(0,6),now);
  assert.ok(Object.values(equal).every(item=>item.band==='mid'&&item.minor===374100));
});
test('days older than five minutes are refreshed',()=>{
  const now=1_000_000_000;
  const observed=[{date:'2026-12-01',minor:1,observedAt:now-1000},{date:'2026-12-02',minor:1,observedAt:now-FARE_CALENDAR_FRESH_MS},{date:'2026-12-04',minor:null,observedAt:now-1000}];
  assert.deepEqual(staleDates(['2026-12-01','2026-12-02','2026-12-03','2026-12-04'],observed,now),['2026-12-02','2026-12-03']);
});
test('compact rupees',()=>{assert.equal(compactRupees(962600),'9,626');assert.equal(compactRupees(15000000),'1.5L');});
