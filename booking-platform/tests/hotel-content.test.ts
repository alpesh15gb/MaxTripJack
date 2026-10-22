import test from 'node:test';
import assert from 'node:assert/strict';
import { createHotelContentCache } from '../src/lib/hotel-content-cache';

const hotel = {tjHotelId:'123', name:'Example', star_rating:'4', locale:{address:{fulladdr:'Supplier address'}}, amenities:{'0':{name:'Pool'}}, pricing:{totalPrice:1}, cancellation:{isRefundable:true}, images:[{links:{Standard:{href:'http://127.0.0.1/secret'}}}]};
test('content cache scopes requested and returned IDs and keeps only safe static fields',async()=>{
 let calls=0;
 const content=createHotelContentCache(async ids=>{calls++;assert.deepEqual(ids,['123']);return {hotels:[hotel,{...hotel,tjHotelId:'999'}]};});
 await assert.rejects(()=>content(['999'],['123']));await assert.rejects(()=>content(['https://bad'],['https://bad']));
 assert.equal(calls,0);
 const result=await content(['123'],['123']);
 assert.deepEqual(Object.keys(result),['123']);assert.equal(result['123'].starRating,4);
 assert.ok(!JSON.stringify(result).includes('pricing'));assert.ok(!JSON.stringify(result).includes('cancellation'));assert.ok(!JSON.stringify(result).includes('127.0.0.1'));
 result['123'].amenities.push('invented');
 assert.deepEqual((await content(['123'],['123']))['123'].amenities,['Pool']);assert.equal(calls,1);
});
test('same pending hotel deduplicates concurrent calls and expires within 24 hours',async()=>{
 let calls=0,now=0;
 const content=createHotelContentCache(async()=>{calls++;return {hotels:[hotel]};},()=>now);
 await Promise.all([content(['123'],['123']),content(['123'],['123'])]);assert.equal(calls,1);
 now=6*60*60_000;await content(['123'],['123']);assert.equal(calls,2);
});
test('failed or inactive metadata gracefully degrades, with bounded negative caching',async()=>{
 let calls=0,now=0;
 const content=createHotelContentCache(async()=>{calls++;throw Error('private supplier key must not surface');},()=>now);
 assert.deepEqual(await content(['123'],['123']),{});await content(['123'],['123']);assert.equal(calls,1);
 now=60_000;await content(['123'],['123']);assert.equal(calls,2);
 const inactive=createHotelContentCache(async()=>({hotels:[{...hotel,is_active:false}]}));
 assert.deepEqual(await inactive(['123'],['123']),{});
});
test('content batches are limited to official 100 hotel maximum',async()=>{
 const content=createHotelContentCache(async()=>{throw Error('must not call');});
 const ids=Array.from({length:101},(_,i)=>String(i+1));await assert.rejects(()=>content(ids,ids));
});

test('retained metadata is capped and evicted entries are fetched again',async()=>{
 let calls=0;
 const content=createHotelContentCache(async ids=>{calls++;return {hotels:ids.map(tjHotelId=>({...hotel,tjHotelId}))};});
 for(let batch=0;batch<6;batch++){
  const ids=Array.from({length:100},(_,i)=>String(batch*100+i+1));await content(ids,ids);
 }
 assert.equal(calls,6);
 await content(['1'],['1']);assert.equal(calls,7);
});

test('peek returns immediately during slow content and never starts optional provider work',async()=>{
 let calls=0,release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const content=createHotelContentCache(async()=>{calls++;await gate;return {hotels:[hotel]};});
 assert.deepEqual(content.peek(['123'],['123']),{});assert.equal(calls,0);
 const pending=content(['123'],['123']);await Promise.resolve();assert.equal(calls,1);
 assert.deepEqual(content.peek(['123'],['123']),{});
 assert.throws(()=>content.peek(['999'],['123']));
 release();await pending;
 assert.equal(content.peek(['123'],['123'])['123'].starRating,4);
});
