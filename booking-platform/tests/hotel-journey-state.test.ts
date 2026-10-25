import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHotelBrowse,readHotelBrowse,writeHotelBrowse,hotelJourneyUrl} from '../src/lib/hotel-journey-state';
const id='11111111-1111-4111-8111-111111111111';
const prefix='maxtravel:hotel-browse:v1:';
function browser(search=''){
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 const data=new Map<string,string>();
 const storage={get length(){return data.size;},getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);},key:(index:number)=>[...data.keys()][index]??null};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{search}}});
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});
 return {data,storage,cleanup(){if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');if(previousStorage)Object.defineProperty(globalThis,'sessionStorage',previousStorage);else Reflect.deleteProperty(globalThis,'sessionStorage');}};
}
test('hotel browse projection drops private/unrecognized fields and rejects oversized, invalid preferences',()=>{
 assert.deepEqual(parseHotelBrowse({filters:{name:'Stay',budget:'5000',category:'4',type:'Hotel',email:'PRIVATE_EMAIL'},sort:'price',scrollY:42,travellers:[{name:'PRIVATE_NAME'}],token:'PRIVATE_TOKEN',results:{}}),{filters:{name:'Stay',budget:'5000',category:'4',type:'Hotel'},sort:'price',scrollY:42});
 for(const value of [null,[],1,'str'])assert.deepEqual(parseHotelBrowse(value),{});
 assert.deepEqual(parseHotelBrowse({filters:{name:'x'.repeat(151),budget:'123\u007f'},sort:'unknown',scrollY:Infinity}),{filters:{name:'',budget:'',category:'',type:''}});
 assert.deepEqual(parseHotelBrowse({scrollY:-1}),{});
});
test('hotel browse storage is bounded, expires, leaves unrelated storage intact and saves no raw data',()=>{
 const b=browser();try{
  b.storage.setItem('unrelated-account','preserve');
  writeHotelBrowse(id,{sort:'price-desc',scrollY:60,...{travellers:[{email:'PRIVATE_EMAIL'}],token:'PRIVATE_TOKEN'}});
  assert.deepEqual(readHotelBrowse(id),{sort:'price-desc',scrollY:60});
  assert.doesNotMatch(b.storage.getItem(prefix+id)!,/PRIVATE_|travellers|token/);
  const expired=JSON.parse(b.storage.getItem(prefix+id)!);expired.savedAt=Date.now()-30*60_000;b.storage.setItem(prefix+id,JSON.stringify(expired));
  assert.deepEqual(readHotelBrowse(id),{});assert.equal(b.storage.getItem(prefix+id),null);
  for(let index=0;index<25;index++)writeHotelBrowse(`${String(index).padStart(8,'0')}-1111-4111-8111-111111111111`,{scrollY:index});
  assert.equal([...b.data.keys()].filter(key=>key.startsWith(prefix)).length,20);
  assert.equal(readHotelBrowse('00000024-1111-4111-8111-111111111111').scrollY,24);
  assert.equal(b.storage.getItem('unrelated-account'),'preserve');
  writeHotelBrowse('invalid/PRIVATE_ID',{scrollY:1});assert.equal(b.storage.getItem(prefix+'invalid/PRIVATE_ID'),null);
 }finally{b.cleanup();}
});
test('hotel URL projects only public criteria, drops auth and unknown data, preserves exact valid room occupancy',()=>{
 const rooms=JSON.stringify([{adults:2,childAge:[7]},{adults:1,childAge:[]}]);
 const b=browser('?'+new URLSearchParams({product:'HOTEL',city:'Goa',date:'2099-01-01',end:'2099-01-03',rooms,hotelIds:'10001,10002',email:'PRIVATE_EMAIL',token:'PRIVATE_TOKEN',travellers:'PRIVATE_TRAVELLER',autoSearch:'1',resumeSelection:'1',resumeReview:'1',selectionKey:id,stay:'99999',browseSearch:id}));
 try{
  const url=hotelJourneyUrl(id,'10001',true);assert.ok(url.startsWith('/book?'));
  const params=new URL(url,'https://example.test').searchParams;
  assert.equal(params.get('city'),'Goa');assert.equal(params.get('rooms'),rooms);assert.equal(params.get('stay'),'10001');assert.equal(params.get('gallery'),'1');assert.equal(params.get('browseSearch'),id);
  assert.doesNotMatch(url,/PRIVATE_|email|token|travellers|autoSearch|resumeSelection|resumeReview|selectionKey/);
  assert.equal(hotelJourneyUrl('invalid','10001'),'/book?product=HOTEL');assert.equal(hotelJourneyUrl(id,'../../x'),'/book?product=HOTEL');
 }finally{b.cleanup();}
});
test('oversized or invalid hotel URLs fall back to owned snapshot pointers rather than truncated criteria',()=>{
 const ids=Array.from({length:100},(_,i)=>String(i).padStart(18,'1')).join(',');
 const b=browser('?'+new URLSearchParams({hotelIds:ids,city:'x'.repeat(150),rooms:JSON.stringify(Array.from({length:4},()=>({adults:2,childAge:[1,2,3]})))}));
 try{
  const url=hotelJourneyUrl(id,'10001',false,true);assert.ok(url.length<=2000);
  const params=new URL(url,'https://example.test').searchParams;assert.equal(params.get('browseSearch'),id);assert.equal(params.get('stayStep'),'review');assert.equal(params.has('hotelIds'),false);assert.equal(params.has('rooms'),false);
 }finally{b.cleanup();}
 const invalid=browser('?date=not-a-date&email=PRIVATE_EMAIL');try{assert.equal(hotelJourneyUrl(id,'10001'),`/book?product=HOTEL&browseSearch=${id}&stay=10001`);}finally{invalid.cleanup();}
});
test('storage unavailable does not prevent navigation or browsing',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('Blocked');}});
 try{assert.deepEqual(readHotelBrowse(id),{});assert.doesNotThrow(()=>writeHotelBrowse(id,{scrollY:12}));}finally{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else Reflect.deleteProperty(globalThis,'sessionStorage');}
});
