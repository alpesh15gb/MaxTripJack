import test from 'node:test';
import assert from 'node:assert/strict';
import {groupIdenticalFlights,arrivalDayLabel,matchesFlightRefinements,matchesFlightAirlineQuery,matchesFlightStops,flightConnectionAirports} from '../src/lib/flight-results';
import type {Flight} from '../src/lib/booking-presentation';
const flight:Flight={sI:[{dt:'2026-11-04T23:25:00',at:'2026-11-05T01:50:00',fD:{aI:{name:'Example'},fN:'1'},da:{code:'DEL'},aa:{code:'NMI'}}],totalPriceList:[{id:'fare',fareIdentifier:'STANDARD',customerEstimateMinor:1200000,fD:{}}]};
test('AI carrier preference matches all outbound, return and COMBO segments; COMBO has no invented stop count',()=>{
 const segment={...flight.sI[0],fD:{...flight.sI[0].fD,aI:{name:'IndiGo',code:'6E'}}};
 const direct={...flight,sI:[segment]},combined={...flight,sI:[segment,{...segment,isRs:true}]};
 assert.equal(matchesFlightAirlineQuery(direct,'indigo'),true);assert.equal(matchesFlightAirlineQuery(combined,'6E'),true);
 assert.equal(matchesFlightAirlineQuery({...combined,sI:[segment,{...segment,fD:{...segment.fD,aI:{name:'Other Air',code:'ZZ'}}}]},'IndiGo'),false);
 assert.equal(matchesFlightStops(direct,'ONWARD','0'),true);assert.equal(matchesFlightStops(direct,'RETURN','0'),true);
 assert.equal(matchesFlightStops(combined,'RETURN','0'),false);assert.equal(matchesFlightStops(combined,'COMBO','0'),true);
 assert.equal(matchesFlightAirlineQuery({...flight,sI:[]},'6E'),false);
});
test('arrival day badge uses valid local calendar dates, not inferred elapsed duration',()=>{
 assert.equal(arrivalDayLabel(flight.sI[0].dt,flight.sI[0].at),'+1 calendar day');
 assert.equal(arrivalDayLabel('2026-11-05T01:00:00+14:00','2026-11-04T23:00:00-10:00'),'-1 calendar day');
 assert.equal(arrivalDayLabel('2026-11-04T01:00:00','2026-11-04T02:00:00'),null);
 assert.equal(arrivalDayLabel('2026-02-30T01:00:00','2026-03-03T01:00:00'),null);
 assert.equal(arrivalDayLabel('missing','unknown'),null);
});
test('flight departure and budget filters use known group totals without new price calculation',()=>{
 assert.equal(matchesFlightRefinements(flight,'ONWARD','EVENING','12000'),true);
 assert.equal(matchesFlightRefinements(flight,'ONWARD','MORNING',''),false);
 assert.equal(matchesFlightRefinements(flight,'ONWARD','ALL','11999'),false);
 assert.equal(matchesFlightRefinements(flight,'COMBO','MORNING','12000'),true);
 assert.equal(matchesFlightRefinements({...flight,totalPriceList:[]},'ONWARD','ALL','12000'),false);
 assert.equal(matchesFlightRefinements({...flight,sI:[{...flight.sI[0],dt:'unknown'}]},'ONWARD','MORNING',''),false);
 assert.equal(matchesFlightRefinements(flight,'ONWARD','ALL','not a price'),false);
});
test('departure windows use local times with OR between windows and AND with the budget',()=>{
 const departing=(time:string):Flight=>({...flight,sI:[{...flight.sI[0],dt:`2026-11-04T${time}:00+05:30`}]});
 for(const time of ['05:00','11:59','18:00','23:59'])assert.equal(matchesFlightRefinements(departing(time),'ONWARD',['MORNING','EVENING'],'12000'),true);
 for(const time of ['04:59','12:00','17:59','24:00'])assert.equal(matchesFlightRefinements(departing(time),'ONWARD',['MORNING','EVENING'],'12000'),false);
 assert.equal(matchesFlightRefinements(departing('04:59'),'ONWARD',['EARLY'],''),true);
 assert.equal(matchesFlightRefinements(departing('05:00'),'ONWARD',['EARLY'],''),false);
 assert.equal(matchesFlightRefinements(departing('18:00'),'ONWARD',['MORNING','EVENING'],'11999'),false);
 assert.equal(matchesFlightRefinements(departing('12:00'),'ONWARD',[],'12000'),true);
});
test('connection airports come only from contiguous segments within a flight group',()=>{
 const first={...flight.sI[0],aa:{code:'BOM',city:'Mumbai'}};
 const next={...flight.sI[0],da:{code:'BOM'},aa:{code:'NMI'}};
 assert.deepEqual(flightConnectionAirports({...flight,sI:[first,next]},'ONWARD'),[first.aa]);
 assert.deepEqual(flightConnectionAirports({...flight,sI:[first,next]},'COMBO'),[]);
 assert.deepEqual(flightConnectionAirports({...flight,sI:[first,{...next,isRs:true}]},'RETURN'),[]);
 assert.deepEqual(flightConnectionAirports({...flight,sI:[first,{...next,da:{code:'AMD'}}]},'ONWARD'),[]);
 assert.deepEqual(flightConnectionAirports(flight,'ONWARD'),[]);
});
test('invalid estimates cannot make an unpriced or over-budget flight pass a budget filter',()=>{
 for (const customerEstimateMinor of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  const invalid = {...flight.totalPriceList[0], customerEstimateMinor};
  assert.equal(matchesFlightRefinements({...flight, totalPriceList: [invalid]}, 'ONWARD', 'ALL', '12000'), false);
  assert.equal(matchesFlightRefinements({...flight, totalPriceList: [invalid]}, 'ONWARD', 'ALL', ''), true);
  assert.equal(matchesFlightRefinements({...flight, totalPriceList: [invalid, ...flight.totalPriceList]}, 'ONWARD', 'ALL', '11999'), false);
  assert.equal(matchesFlightRefinements({...flight, totalPriceList: [invalid, ...flight.totalPriceList]}, 'ONWARD', 'ALL', '12000'), true);
 }
});


test('identical flight grouping retains distinct fares, compatibility and conflicts without mutation',()=>{
 const a=structuredClone(flight),b={...structuredClone(flight),totalPriceList:[{...flight.totalPriceList[0],id:'other',sri:'outbound',msri:['return']}]};
 const before=structuredClone([a,b]);
 const grouped=groupIdenticalFlights([a,b,a]);assert.equal(grouped.length,1);
 assert.deepEqual(grouped[0].totalPriceList,[a.totalPriceList[0],b.totalPriceList[0]]);assert.deepEqual([a,b],before);
 assert.equal(groupIdenticalFlights([a,{...b,totalPriceList:[{...a.totalPriceList[0],sri:'different'}]}]).length,2);
 assert.equal(groupIdenticalFlights([a,{...b,sI:[{...b.sI[0],dt:'2027-01-01T12:00:00'}]}]).length,2);
});
