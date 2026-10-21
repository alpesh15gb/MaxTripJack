import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingSearchPrefill,bookingSearchUrl,searchRooms,searchLegs} from '../src/lib/booking-search-state';
import {safeAccountReturn} from '../src/lib/account-return';
const today='2030-01-01';
const params=(url:string)=>Object.fromEntries(new URL(url,'https://test.invalid').searchParams);
const legs=[{from:'BOM',to:'DEL',date:'2030-02-01'},{from:'DEL',to:'GOI',date:'2030-02-04'},{from:'GOI',to:'BOM',date:'2030-02-06'}];
test('multicity criteria survive refresh and account return with cabin and party',()=>{
 const criteria={product:'FLIGHT',legs:JSON.stringify(legs),adults:'2',children:'1',infants:'1',cabin:'BUSINESS'};
 const url=bookingSearchUrl(criteria,today)!;
 assert.deepEqual(params(safeAccountReturn(url)),params(url));
 const restored=bookingSearchPrefill(Object.fromEntries(new URL(url,'https://test.invalid').searchParams),today);
 assert.deepEqual(searchLegs(restored.legs),legs);assert.equal(restored.from,'BOM');assert.equal(restored.cabin,'BUSINESS');assert.equal(restored.children,'1');assert.equal(restored.infants,'1');
});
test('rooms and ages survive without arbitrary nested identity fields',()=>{
 const rooms=[{adults:2,childAge:[0,17],name:'Secret'},{adults:1,childAge:[7]}];
 const url=bookingSearchUrl({product:'HOTEL',rooms:JSON.stringify(rooms),date:'2030-02-01',end:'2030-02-02',hotelIds:'10001,10002',email:'private@example.test',token:'secret'},today)!;
 assert.deepEqual(params(safeAccountReturn(url)),params(url));assert.ok(!url.includes('Secret'));assert.ok(!url.includes('private'));assert.ok(!url.includes('token'));
 assert.deepEqual(searchRooms(new URL(url,'https://test.invalid').searchParams.get('rooms')!),rooms.map(({adults,childAge})=>({adults,childAge})));
});
test('bad, expired, fractional and oversized inputs do not auto-search or silently change the trip',()=>{
 for(const bad of [{legs:'{'},{legs:JSON.stringify([...legs].reverse())},{rooms:JSON.stringify([{adults:1.5,childAge:[]}])},{rooms:JSON.stringify([{adults:1,childAge:[18]}])},{rooms:JSON.stringify(Array(5).fill({adults:1,childAge:[]}))},{date:'2020-01-01'},{date:'2030-02-30'},{adults:'2.5'},{children:'8',adults:'2'},{infants:'2',adults:'1'},{legs:'x'.repeat(1001)},{date:['2030-01-02','2030-01-03']}]){
  assert.deepEqual(bookingSearchPrefill({product:'FLIGHT',autoSearch:'1',...bad},today),{product:'FLIGHT',searchInvalid:'1'});
 }
});
test('URLs remain bounded and never truncate selected hotel inventory',()=>{
 const criteria={product:'HOTEL',hotelIds:Array.from({length:100},(_,i)=>String(100000000000000+i)).join(','),city:'A'.repeat(150),date:'2030-02-01',end:'2030-02-02',rooms:JSON.stringify(Array(4).fill({adults:4,childAge:[10,11,12]}))};
 assert.equal(bookingSearchUrl(criteria,today),null);
 const maxLegs=bookingSearchUrl({product:'FLIGHT',legs:JSON.stringify(Array(6).fill(legs[0])),adults:'9',infants:'9',cabin:'PREMIUM_ECONOMY'},today)!;
 assert.ok(maxLegs.length<2000);assert.deepEqual(params(safeAccountReturn(maxLegs+'&resumeSelection=1')),params(maxLegs+'&resumeSelection=1'));
});
