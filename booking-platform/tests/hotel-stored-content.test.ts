import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {storedHotelProperties,storedHotelProperty} from '../src/lib/hotel-stored-content';
import {createHotelContentCache} from '../src/lib/hotel-content-cache';
import {mergeHotelPropertyDetails} from '../src/lib/hotel-property-merge';

const stored={city:'Mumbai',countryCode:'IN',address:'Mira Road, Mumbai, India',starRating:4,amenities:['WiFi'],
 description:'Real supplier description',photos:[{url:'https://pix8.agoda.net/hotelImages/123/room.jpg',isHero:true}],
 pricing:{totalPrice:1},cancellation:{isRefundable:true},guestRating:10};

test('stored catalogue content is reprojected to the same safe public static fields',()=>{
 const result=storedHotelProperty({...stored,photos:[...stored.photos,{url:'http://127.0.0.1/private',isHero:true}]});
 assert.equal(result.city,'Mumbai');assert.equal(result.starRating,4);assert.equal(result.photos?.length,1);
 assert.equal(result.description,'Real supplier description');
 assert.doesNotMatch(JSON.stringify(result),/pricing|cancellation|guestRating|127\.0\.0\.1/);
});

test('partial catalogue metadata preserves supplier listing photos and amenities without inventing values',()=>{
 const listing=storedHotelProperty(stored);
 const merged=mergeHotelPropertyDetails({city:'Verified updated city',amenities:[],photos:[]},listing);
 assert.equal(merged.city,'Verified updated city');assert.equal(merged.address,listing.address);
 assert.deepEqual(merged.photos,listing.photos);assert.deepEqual(merged.amenities,['WiFi']);
 assert.deepEqual(mergeHotelPropertyDetails(undefined,listing),listing);
 assert.deepEqual(mergeHotelPropertyDetails(undefined,undefined),{amenities:[]});
 assert.equal(listing.city,'Mumbai');
});

test('bulk local lookup only reuses active complete recent UAT properties and owned IDs',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../db/026-hotel-catalogue.sql',import.meta.url),'utf8'));
  for(const [id,environment,active,ready,age] of [['1','uat',true,true,0],['2','production',true,true,0],['3','uat',false,true,0],['4','uat',true,false,0],['5','uat',true,true,8],['6','uat',true,true,-1]] as const){
   await db.query(`INSERT INTO hotel_catalogue(environment,hotel_id,slug,name,city,country_name,address,content,content_hash,active,content_ready,checked_at)
    VALUES($1,$2,$3,'Test hotel','Mumbai','India','Mira Road',$4,repeat('a',64),$5,$6,now()-$7::int*interval '1 day')`,[environment,id,`test-${id}`,JSON.stringify(stored),active,ready,age]);
  }
  const result=await storedHotelProperties(['1','2','3','4','5','6'],(sql,values)=>db.query(sql,values));
  assert.deepEqual(Object.keys(result),['1']);
  let queried=false;await assert.rejects(()=>storedHotelProperties(['bad'],async()=>{queried=true;return{rows:[]};}));assert.equal(queried,false);
  assert.deepEqual(await storedHotelProperties(['1'],async()=>({rows:[{hotel_id:'999',content:stored}]})),{});
 }finally{await db.close();}
});

test('all-local metadata needs no supplier request; a partial hit fetches only missing owned IDs',async()=>{
 const calls:string[][]=[];let reads=0;
 const content=createHotelContentCache(async ids=>{calls.push(ids);return{hotels:ids.map(tjHotelId=>({tjHotelId,locale:{address:{city:'Delhi'}}}))};},Date.now,async ids=>{reads++;return Object.fromEntries(ids.filter(id=>id==='1').map(id=>[id,storedHotelProperty(stored)]));});
 const first=await content(['1'],['1','2']);assert.equal(first['1'].city,'Mumbai');assert.deepEqual(calls,[]);
 const next=await content(['1','2'],['1','2']);assert.deepEqual(calls,[['2']]);assert.equal(next['2'].city,'Delhi');assert.equal(reads,2);
 first['1'].amenities.push('invented');assert.deepEqual(content.peek(['1'],['1'])['1'].amenities,['WiFi']);
 await assert.rejects(()=>content(['3'],['1']));assert.equal(reads,2);
});

test('failed local lookup falls back; failed remaining supplier lookup retains resolved local fields',async()=>{
 let calls=0;
 const fallback=createHotelContentCache(async()=>{calls++;return{hotels:[{tjHotelId:'1',star_rating:4}]};},Date.now,async()=>{throw Error('Private database detail');});
 assert.equal((await fallback(['1'],['1']))['1'].starRating,4);assert.equal(calls,1);
 const partial=createHotelContentCache(async()=>{throw Error('Private supplier detail');},Date.now,async()=>({'1':storedHotelProperty(stored)}));
 assert.deepEqual(Object.keys(await partial(['1','2'],['1','2'])),['1']);
 assert.deepEqual(partial.statuses(['1','2'],['1','2']),{'1':'resolved','2':'unavailable'});
});

test('concurrent metadata reads share the local lookup and supplier work, with LRU retention',async()=>{
 let reads=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const content=createHotelContentCache(async()=>{throw Error('No remote work expected.');},Date.now,async ids=>{reads++;await gate;return Object.fromEntries(ids.map(id=>[id,storedHotelProperty(stored)]));});
 const first=content(['1'],['1']),second=content(['1'],['1']);await Promise.resolve();assert.equal(reads,1);release();await Promise.all([first,second]);
 for(let batch=0;batch<5;batch++){const ids=Array.from({length:100},(_,index)=>String(batch*100+index+1));await content(ids,ids);}
 content.peek(['1'],['1']);await content(['501'],['501']);await content(['1'],['1']);assert.equal(reads,7);
 await content(['2'],['2']);assert.equal(reads,8);
});
