import test from 'node:test';
import assert from 'node:assert/strict';
import {submittedBookingSearch} from '../src/lib/submitted-booking-search';
import {bookingSearchUrl} from '../src/lib/booking-search-state';

const hotels=Array.from({length:100},(_,index)=>'1000000000000000'+String(index).padStart(3,'0')).join(',');
const input={product:'HOTEL',city:'Goa',regionId:'1001',destinationCursor:'0:1',hotelIds:hotels,date:'2090-01-01',end:'2090-01-03',adults:'2',nationality:'106',rooms:JSON.stringify([{adults:2,childAge:[5,8]}])};
test('oversized valid sharing URL retains full public inventory, occupancy and continuation only in memory',()=>{
  assert.equal(bookingSearchUrl(input),null);
  const state=submittedBookingSearch({...input,email:'private@example.test',password:'private',unknown:'drop'});
  assert.equal(state.shareable,false);assert.equal(state.url,'/book?product=HOTEL');assert.deepEqual(state.criteria,input);
  assert.equal(state.criteria.hotelIds.split(',').length,100);assert.equal(state.criteria.destinationCursor,'0:1');
});
test('invalid criteria still fail closed rather than bypassing search validation for memory retention',()=>{
  const state=submittedBookingSearch({...input,destinationCursor:'1:0'});
  assert.equal(state.shareable,false);assert.deepEqual(state.criteria,{product:'HOTEL'});
});
