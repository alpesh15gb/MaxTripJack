import test from 'node:test';
import assert from 'node:assert/strict';
import {createHotelDestinationCache} from '../src/lib/hotel-destination-cache';
import {destinationPageResult} from '../src/lib/hotel-destination-pages';

const request={regionIds:['10','11'],page:0};
const mapping={hotels:[{tjHotelId:'101',price:10},{tjHotelId:'102'}],pageable:{totalPages:2},private:'not retained'};

test('identical static region mappings coalesce and repeated reads skip the supplier without sharing mutable data',async()=>{
 const cached=createHotelDestinationCache();let calls=0;let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const load=async()=>{calls++;await gate;return mapping;};
 const first=cached(request,load),second=cached(request,load);await Promise.resolve();assert.equal(calls,1);
 release();const [a,b]=await Promise.all([first,second]);
 assert.deepEqual(a,{hotels:[{tjHotelId:'101'},{tjHotelId:'102'}],pageable:{totalPages:2}});
 a.hotels[0].tjHotelId='999';assert.equal(b.hotels[0].tjHotelId,'101');
 assert.equal((await cached(request,load)).hotels[0].tjHotelId,'101');assert.equal(calls,1);
});

test('exact region order/page scope and completion-based TTL preserve continuation and refresh',async()=>{
 let now=0,calls=0;const cached=createHotelDestinationCache(()=>now,100);
 const load=async()=>{calls++;now+=30;return mapping;};
 await cached(request,load);now=129;await cached(request,load);assert.equal(calls,1);
 now=130;await cached(request,load);assert.equal(calls,2);
 for(const input of [{regionIds:['10','11'],page:1},{regionIds:['11','10'],page:0},{regionIds:['10'],page:0}])await cached(input,load);
 assert.equal(calls,5);
 const full=await cached({regionIds:['99'],page:0},async()=>({hotels:Array.from({length:100},()=>({tjHotelId:'100'}))}));
 assert.equal(full.hotels.length,100);
 assert.deepEqual(destinationPageResult(['99'],undefined,full),{hotelIds:['100'],nextCursor:'0:1',hasMore:true});
});

test('supplier failures and malformed mappings are not cached as missing inventory',async()=>{
 const cached=createHotelDestinationCache();let calls=0;
 for(const load of [async()=>{calls++;throw Error('provider timeout');},async()=>{calls++;return{hotels:[{tjHotelId:'invalid'}]};},async()=>{calls++;return{hotels:Array.from({length:101},()=>({tjHotelId:'100'}))};}])await assert.rejects(()=>cached(request,load));
 assert.deepEqual(await cached(request,async()=>{calls++;return mapping;}),{hotels:[{tjHotelId:'101'},{tjHotelId:'102'}],pageable:{totalPages:2}});assert.equal(calls,4);
});

test('mapping cache is bounded with true LRU reuse and validates input before calling the supplier',async()=>{
 const cached=createHotelDestinationCache();let calls=0;
 const load=async()=>{calls++;return mapping;};
 for(let n=1;n<=256;n++)await cached({regionIds:[String(n)],page:0},load);
 await cached({regionIds:['1'],page:0},load);assert.equal(calls,256);
 await cached({regionIds:['257'],page:0},load);
 await cached({regionIds:['1'],page:0},load);assert.equal(calls,257);
 await cached({regionIds:['2'],page:0},load);assert.equal(calls,258);
 for(const input of [{regionIds:[],page:0},{regionIds:['invalid'],page:0},{regionIds:['1'],page:-1},{regionIds:['1'],page:1.1},{regionIds:Array(21).fill('1'),page:0}])await assert.rejects(()=>cached(input,load));
 assert.equal(calls,258);
 const disabled=createHotelDestinationCache(Date.now,0);await disabled(request,load);await disabled(request,load);assert.equal(calls,260);
});
