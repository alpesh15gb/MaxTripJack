import test from 'node:test';
import assert from 'node:assert/strict';
import {airportInstant} from '../src/lib/airport-instant';
import {journeyMinutes,type FlightSegment} from '../src/lib/booking-presentation';
import {connectionLabel} from '../src/lib/flight-duration';

// Synthetic timings exercise the same airport chain as the live GOX result.
const first:FlightSegment={dt:'2026-11-23T20:00:00',at:'2026-11-23T21:10:00',fD:{aI:{name:'Fixture airline'},fN:'1'},da:{code:'BOM'},aa:{code:'GOX'}};
const next:FlightSegment={dt:'2026-11-23T22:00:00',at:'2026-11-24T00:25:00',fD:{aI:{name:'Fixture airline'},fN:'2'},da:{code:'GOX'},aa:{code:'DEL'}};

test('GOX airport-local times resolve to IST without supplier country metadata',()=>{
 assert.equal(airportInstant('2026-11-23T21:10:00','GOX'),'2026-11-23T15:40:00Z');
 assert.equal(airportInstant('2026-06-23T21:10:00','GOX'),'2026-06-23T15:40:00Z');
});

test('BOM-GOX-DEL overnight duration includes the connection',()=>{
 assert.equal(journeyMinutes({sI:[first,next],totalPriceList:[]},'ONWARD'),265);
 assert.equal(connectionLabel(first,next),'Connection at GOX · 0h 50m');
});

test('unknown airports remain unknown and explicit offsets remain authoritative',()=>{
 assert.equal(airportInstant('2026-11-23T21:10:00','ZZZ'),null);
 assert.equal(airportInstant('2026-11-23T21:10:00+04:00','GOX'),'2026-11-23T17:10:00Z');
 assert.equal(journeyMinutes({sI:[first,{...next,dt:'2026-11-23T20:00:00'}],totalPriceList:[]},'ONWARD'),null);
});
