import test from 'node:test';import assert from 'node:assert/strict';
import {completeHotelRooms} from '../src/lib/hotel-occupancy';
import {bookingSearchPrefill,bookingSearchUrl,searchRooms} from '../src/lib/booking-search-state';
test('unanswered child age is not converted to zero; zero remains deliberate valid age',()=>{
 assert.throws(()=>completeHotelRooms([{adults:2,childAge:['']}]),/every child/);
 assert.deepEqual(completeHotelRooms([{adults:2,childAge:[0,7]},{adults:1,childAge:[17]}]),[{adults:2,children:2,childAge:[0,7]},{adults:1,children:1,childAge:[17]}]);
 for(const age of [-1,18,1.5,NaN])assert.throws(()=>completeHotelRooms([{adults:2,childAge:[age]}]));
});
test('URL restoration preserves explicit zero and rejects missing or blank child ages',()=>{
 const rooms=[{adults:2,childAge:[0,7]}];const url=bookingSearchUrl({product:'HOTEL',rooms:JSON.stringify(rooms)},'2026-10-22');assert.ok(url);
 assert.deepEqual(searchRooms(new URL(url,'https://maxtravel.in').searchParams.get('rooms')!),rooms);
 for(const childAge of [[''],[null]]){const query={product:'HOTEL',rooms:JSON.stringify([{adults:2,childAge}])};assert.equal(bookingSearchPrefill(query,'2026-10-22').searchInvalid,'1');assert.equal(bookingSearchUrl(query,'2026-10-22'),null);}
});
