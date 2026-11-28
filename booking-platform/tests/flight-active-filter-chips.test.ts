import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FlightActiveFilterChips,type FlightFilterProps} from '../src/components/flight-results-controls';

const empty:FlightFilterProps={group:'ONWARD',airlineFilters:[],allianceFilters:[],stops:'ALL',departureWindows:[],connections:[],budget:'',disabled:false,onAirlines:()=>{},onAlliances:()=>{},onStops:()=>{},onDeparture:()=>{},onConnections:()=>{},onBudget:()=>{}};
test('filter chips do not advertise nonexistent filters or treat COMBO preferences as applied',()=>{
  assert.equal(renderToStaticMarkup(createElement(FlightActiveFilterChips,empty)),'');
  const combo=renderToStaticMarkup(createElement(FlightActiveFilterChips,{...empty,group:'COMBO',stops:'0',departureWindows:['MORNING']}));
  assert.equal((combo.match(/Not applied to complete itineraries/g)??[]).length,2);
  assert.match(combo,/Remove stops preference/);assert.match(combo,/Remove departure time filter/);
});
test('busy chips disable every mutation and preserve the stricter AI carrier preference label',()=>{
  const html=renderToStaticMarkup(createElement(FlightActiveFilterChips,{...empty,airlineQuery:'IndiGo',budget:'7000',disabled:true}));
  assert.match(html,/IndiGo · every segment/);assert.match(html,/Remove airline preference IndiGo/);
  assert.match(html,/Up to ₹7,000 · all travellers/);
  const buttons=[...html.matchAll(/<button\b[^>]*>/g)];assert.equal(buttons.length,3);
  assert.ok(buttons.every(button=>/disabled=""/.test(button[0])));
});
