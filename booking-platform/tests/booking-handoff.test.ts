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

test('account-bound handoffs cannot survive a settled sign-out or user switch',()=>{
 const value={...valid,ownerId:'owner-a'};
 assert.equal(inspectBookingHandoff(value,now,{userId:'owner-a'}).state,'ready');
 assert.equal(inspectBookingHandoff(value,now,{userId:'owner-b'}).state,'unavailable');
 assert.equal(inspectBookingHandoff(value,now,{userId:null}).state,'unavailable');
 assert.equal(inspectBookingHandoff(valid,now,{userId:'newly-signed-in'}).state,'ready');
});
test('history entries recover only their matching handoff, never a newer selection',()=>{
 const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const newer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 assert.equal(parseBookingHandoff({...valid,key},now)?.key,key); // Construction does not require a route context.
 assert.equal(inspectBookingHandoff({...valid,key},now,{userId:null,key}).state,'ready');
 assert.equal(inspectBookingHandoff({...valid,key:newer},now,{userId:null,key}).state,'unavailable');
 assert.equal(inspectBookingHandoff({...valid,key},now,{userId:null}).state,'unavailable');
 assert.equal(inspectBookingHandoff(valid,now,{userId:null}).state,'ready');
 assert.equal(inspectBookingHandoff(valid,now,{userId:null,key}).state,'unavailable');
});
test('hotel recovery contains descriptive choice labels, not room prices or personal details',()=>{
 const value={...valid,product:'HOTEL',selection:{hid:'hotel-1',optionId:'room-1'},hotel:{name:'Sample stay',roomLabel:'Deluxe room',mealBasis:'BREAKFAST',price:999,guestName:'Private',passport:'Private'}};
 assert.deepEqual(parseBookingHandoff(value,now)?.hotel,{name:'Sample stay',roomLabel:'Deluxe room',mealBasis:'BREAKFAST'});
 for(const extra of [{hotel:{name:'x'.repeat(501),roomLabel:'Room'}},{selection:{hid:'h',optionId:'x'.repeat(2049)}},{selection:{hid:'h'}},{selection:{priceIds:['fare']}}])assert.equal(parseBookingHandoff({...value,...extra},now),null);
});
test('empty, mixed-product and oversized public selections fail closed',()=>{
 for(const selection of [{},{priceIds:[]},{priceIds:['']},{priceIds:['fare'],hid:'hotel'},{priceIds:['x'.repeat(2049)]}])assert.equal(parseBookingHandoff({...valid,selection},now),null);
 assert.equal(parseBookingHandoff({...valid,ownerId:'x'.repeat(201)},now),null);
 // Reading the same handoff never extends its original lifetime.
 const read=parseBookingHandoff(valid,now+13*60*1000);
 assert.equal(parseBookingHandoff(read,now+14*60*1000),null);
});
