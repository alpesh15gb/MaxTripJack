import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSearchWarmCache,type WarmScope} from '../src/lib/search-warm-cache';
import type {Search} from '../src/lib/providers/contracts';
import {cachedFlightSearch,clearFlightSearchCache} from '../src/lib/flight-search-cache';
import {flightSeatInventoryExpiry} from '../src/lib/flight-seat-inventory';
const criteria:Search={product:'HOTEL',hotelIds:['101','102'],checkIn:'2027-01-01',checkOut:'2027-01-02',adults:2,childrenAges:[],nationality:'106',rooms:[{adults:2,children:1,childAge:[7]}]};
const scope:WarmScope={actor:{userId:'guest:fixture',companyId:null},peer:'fixture-peer'};
const result={data:{hotels:[{tjHotelId:'101'}]},correlationId:'original-correlation'};

test('exact criteria joins pending warm work once and preserves correlation and isolated results',async()=>{
 const cache=createSearchWarmCache();const intent=randomUUID();let calls=0,release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 const warm=cache.warm(intent,criteria,scope,async()=>{calls++;await held;return result;});
 await Promise.resolve();const adoption=cache.take(intent,criteria,scope);assert.equal(adoption.status,'joined');
 assert.equal(cache.take(intent,criteria,scope).status,'miss');release();
 const adopted=await adoption.result;assert.deepEqual(adopted,result);assert.notEqual(adopted?.data,result.data);
 assert.equal(await warm,'ready');assert.equal(calls,1);
 assert.equal(await cache.warm(intent,criteria,scope,async()=>{calls++;return result;}),'skipped');assert.equal(calls,1);
});

test('criteria, actor, company, and anonymous peer boundaries prevent accidental adoption',async()=>{
 for(const other of [{criteria:{...criteria,checkOut:'2027-01-03'}},{criteria:{...criteria,rooms:[{adults:2,children:1,childAge:[8]}]}},{criteria:{...criteria,nationality:'107'}},{criteria:{...criteria,hotelIds:['102','101']}},{scope:{...scope,actor:{userId:'another',companyId:null}}},{scope:{...scope,actor:{...scope.actor!,companyId:'company-b'}}}]){
  const cache=createSearchWarmCache(),intent=randomUUID();await cache.warm(intent,criteria,scope,async()=>result);
  assert.equal(cache.take(intent,other.criteria??criteria,other.scope??scope).status,'miss');
 }
 const cache=createSearchWarmCache(),intent=randomUUID();await cache.warm(intent,criteria,{actor:null,peer:'peer-a'},async()=>result);
 assert.equal(cache.take(intent,criteria,{...scope,peer:'peer-b'}).status,'miss');
 assert.equal((await cache.take(intent,criteria,{...scope,peer:'peer-a'}).result)?.correlationId,result.correlationId);
});

test('canonical object-key order hits; expired, failed and oversized warm responses fall back',async()=>{
 let now=0;const cache=createSearchWarmCache(()=>now),intent=randomUUID();
 await cache.warm(intent,criteria,scope,async()=>result);
 const reordered=Object.fromEntries(Object.entries(criteria).reverse()) as Search;
 assert.equal(cache.take(intent,reordered,scope).status,'hit');
 for(const failed of [async()=>{throw Error('private supplier detail');},async()=>({...result,data:'x'.repeat(4*1024*1024)})]){
  const id=randomUUID();assert.equal(await cache.warm(id,criteria,scope,failed),'skipped');assert.equal(await cache.take(id,criteria,scope).result,null);
 }
 const stale=randomUUID();await cache.warm(stale,criteria,scope,async()=>result);now=45_000;assert.equal(cache.take(stale,criteria,scope).status,'miss');
});

test('an actual search arriving first prevents late speculative work for that intent',async()=>{
 const cache=createSearchWarmCache(),intent=randomUUID();let calls=0;
 assert.equal(cache.take(intent,criteria,scope).status,'miss');
 assert.equal(await cache.warm(intent,criteria,{actor:null,peer:scope.peer},async()=>{calls++;return result;}),'skipped');assert.equal(calls,0);
});

test('authenticated cookie fingerprints require a matching actually authenticated actor',async()=>{
 for(const consumer of [{actor:scope.actor,peer:scope.peer,sessionFingerprint:'same'},{actor:{userId:'account',companyId:null},peer:scope.peer,sessionFingerprint:'different'}]){
  const cache=createSearchWarmCache(),intent=randomUUID();await cache.warm(intent,criteria,{actor:null,peer:scope.peer,sessionFingerprint:'same'},async()=>result);
  assert.equal(cache.take(intent,criteria,consumer).status,'miss');
 }
 const cache=createSearchWarmCache(),intent=randomUUID();await cache.warm(intent,criteria,{actor:null,peer:scope.peer,sessionFingerprint:'same'},async()=>result);
 assert.equal(cache.take(intent,criteria,{actor:{userId:'account',companyId:'current-company'},peer:scope.peer,sessionFingerprint:'same'}).status,'hit');
});

test('wrapping an existing flight cache result never extends its original freshness deadline',async()=>{
 let now=89_000;const cache=createSearchWarmCache(()=>now),intent=randomUUID();
 clearFlightSearchCache();await cachedFlightSearch({fixture:'original-age'},async()=>result.data,90_000,0);
 await cache.warm(intent,criteria,scope,async()=>{
  let freshUntil:number|undefined;const data=await cachedFlightSearch({fixture:'original-age'},async()=>{throw Error('Existing flight cache should be used.');},90_000,now,(_status,until)=>{freshUntil=until;});
  assert.equal(freshUntil,90_000);return{...result,data,freshUntil};
 });
 now=90_000;assert.equal(cache.take(intent,criteria,scope).status,'miss');
 clearFlightSearchCache();
});

test('adopted flight results retain the supplier age after the seat indicator expires',async()=>{
 let now=55_000;
 const cache=createSearchWarmCache(()=>now),intent=randomUUID();
 const flight:Search={product:'FLIGHT',from:'BOM',to:'DEL',date:'2027-01-11',adults:1,children:0,infants:0,cabin:'ECONOMY'};
 const payload={fixture:'seat-inventory-age'};
 clearFlightSearchCache();
 await cachedFlightSearch(payload,async()=>result.data,300_000,0);
 await cache.warm(intent,flight,scope,async()=>{
  let flightFetchedSince:number|undefined;
  const data=await cachedFlightSearch(payload,async()=>{throw Error('Expected cached availability');},300_000,now,(_status,_until,at)=>{flightFetchedSince=at;});
  return {data,correlationId:result.correlationId,flightFetchedSince};
 });
 now=61_000;
 const adopted=await cache.take(intent,flight,scope).result;
 assert.equal(adopted?.flightFetchedSince,0);
 assert.equal(flightSeatInventoryExpiry(adopted?.flightFetchedSince,now),undefined);
 assert.deepEqual(adopted?.data,result.data);
 clearFlightSearchCache();
});

test('an explicit search that already claimed pending work does not repeat a large supplier response',async()=>{
 const cache=createSearchWarmCache(),intent=randomUUID();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let calls=0;
 const warming=cache.warm(intent,criteria,scope,async()=>{calls++;await gate;return{...result,data:'x'.repeat(4*1024*1024)};});
 const adopted=cache.take(intent,criteria,scope);release();assert.equal(await warming,'ready');
 assert.equal((await adopted.result)?.correlationId,result.correlationId);assert.equal(calls,1);assert.equal(cache.take(intent,criteria,scope).status,'miss');
});

test('active capacity survives expiry and adoption until supplier work actually settles',async()=>{
 let now=0;const cache=createSearchWarmCache(()=>now),promises:Promise<unknown>[]=[];let release!:()=>void,calls=0;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 for(let i=0;i<4;i++){const intent=randomUUID(),owner={actor:{userId:`owner-${i}`,companyId:null},peer:scope.peer};promises.push(cache.warm(intent,criteria,owner,async()=>{calls++;await gate;return result;}));if(i===0)cache.take(intent,criteria,owner);}
 await Promise.resolve();assert.equal(calls,4);now=50_000;
 assert.equal(await cache.warm(randomUUID(),criteria,scope,async()=>{calls++;return result;}),'skipped');assert.equal(calls,4);
 release();await Promise.all(promises);
 assert.equal(await cache.warm(randomUUID(),criteria,scope,async()=>result),'ready');
});

test('one actor cannot run overlapping criteria; settled storage evicts old entries',async()=>{
 const cache=createSearchWarmCache();let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 const pending=cache.warm(randomUUID(),criteria,scope,async()=>{calls++;await gate;return result;});
 assert.equal(await cache.warm(randomUUID(),{...criteria,checkOut:'2027-01-03'},scope,async()=>{calls++;return result;}),'skipped');release();await pending;assert.equal(calls,1);
 const ids:string[]=[];for(let i=0;i<21;i++){const id=randomUUID();ids.push(id);await cache.warm(id,criteria,scope,async()=>result);}
 assert.equal(cache.take(ids[0],criteria,scope).status,'miss');assert.equal(cache.take(ids.at(-1)!,criteria,scope).status,'hit');
});
