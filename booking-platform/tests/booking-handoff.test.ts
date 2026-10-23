import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBookingHandoff,parseBookingHandoff} from '../src/lib/booking-handoff';
const now=123456789;
const valid={version:1,savedAt:now,product:'FLIGHT',searchId:'11111111-1111-4111-8111-111111111111',selection:{priceIds:['fare1']},flights:[]};
test('login handoff carries selection, not quotes or personal fields',()=>{
 const result=parseBookingHandoff({...valid,email:'private@example.test',quoteId:'stale',guests:[{name:'Private'}],selection:{priceIds:['fare1'],passport:'private'}},now);
 assert.deepEqual(result,valid);
});
test('handoff expiry, future timestamps and unbounded IDs fail closed',()=>{
 assert.equal(parseBookingHandoff(valid,now+14*60*1000),null);
 assert.equal(parseBookingHandoff(valid,now-1),null);
 assert.equal(parseBookingHandoff({...valid,searchId:'invalid'},now),null);
 assert.equal(parseBookingHandoff({...valid,selection:{priceIds:Array(13).fill('fare')}},now),null);
});

test('expiry feedback requires a valid selection with an elapsed lifetime',()=>{
 assert.deepEqual(inspectBookingHandoff(valid,now),{state:'ready',handoff:valid});
 assert.deepEqual(inspectBookingHandoff(valid,now+14*60*1000-1),{state:'ready',handoff:valid});
 assert.deepEqual(inspectBookingHandoff(valid,now+14*60*1000),{state:'expired'});
 for(const value of [null,undefined,{}, {...valid,savedAt:now+1}, {...valid,searchId:'invalid'}, {...valid,savedAt:NaN}, {...valid,savedAt:Infinity}])assert.deepEqual(inspectBookingHandoff(value,now),{state:'unavailable'});
 assert.deepEqual(inspectBookingHandoff(valid,Infinity),{state:'unavailable'});
 // An old timestamp alone is not enough evidence to assert expiry.
 assert.deepEqual(inspectBookingHandoff({...valid,savedAt:0,selection:{priceIds:Array(13).fill('fare')}},now),{state:'unavailable'});
});
test('classified recovery still strips personal extras from ready selections',()=>{
 assert.deepEqual(inspectBookingHandoff({...valid,email:'private@example.test',quoteId:'not-persisted',selection:{priceIds:['fare1'],passport:'private'}},now),{state:'ready',handoff:valid});
});
