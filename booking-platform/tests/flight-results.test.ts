import test from 'node:test';
import assert from 'node:assert/strict';
import {arrivalDayLabel,matchesFlightRefinements} from '../src/lib/flight-results';
import type {Flight} from '../src/lib/booking-presentation';
const flight:Flight={sI:[{dt:'2026-11-04T23:25:00',at:'2026-11-05T01:50:00',fD:{aI:{name:'Example'},fN:'1'},da:{code:'DEL'},aa:{code:'NMI'}}],totalPriceList:[{id:'fare',fareIdentifier:'STANDARD',customerEstimateMinor:1200000,fD:{}}]};
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
