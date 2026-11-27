import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import HotelResults,{hotelComparisonAmenities} from '../src/components/hotel-results';
import {hotelContentUnavailable,emptyHotelFilters,filterHotelResults,hotelAmenities,hotelAmenityOptions,hotelAreaMatches,hotelPracticalAmenities,hotelRateFacets,lowestMatchingHotelRate,nextHotelCancellationChange,selectedHotelAmenities,knownHotelTotal,stayNights,type HotelResult} from '../src/lib/hotel-results';
const hotels:HotelResult[]=[{tjHotelId:'1',name:'Palm House',customerEstimateMinor:800000,property:{starRating:4,propertyType:'Hotel',amenities:[]}},{tjHotelId:'2',name:'Bay Stay',customerEstimateMinor:400000,property:{starRating:3,propertyType:'Resort',amenities:[]}},{tjHotelId:'3',name:'Unpriced stay',property:{amenities:[]}}];
test('compact hotel amenities preserve supplied wording, practical facts and three distinct positive items',()=>{
 const supplied=['Lobby',' Wi-Fi ','wifi','Parking','No swimming pool','Restaurant','Gym'];
 assert.deepEqual(hotelComparisonAmenities(supplied),['Wi-Fi','Parking','Restaurant']);
 assert.equal(supplied.length,7);assert.deepEqual(hotelComparisonAmenities(),[]);
 assert.deepEqual(hotelComparisonAmenities(['Front desk']),['Front desk']);
});
test('result cards retain originating search navigation, complete stay totals and accessible filter entry',()=>{
 const searchId='11111111-1111-4111-8111-111111111111',originSearchId='22222222-2222-4222-8222-222222222222';
 const html=renderToStaticMarkup(createElement(HotelResults,{searchId,hotels:[{...hotels[0],originSearchId,property:{amenities:['Wi-Fi','Parking','Restaurant','Gym'],city:'Delhi',address:'Supplied locality'}}],context:{checkIn:'2026-11-24',checkOut:'2026-11-26',rooms:2,guests:4},busy:false,onChoose:()=>{},hasMore:true,onLoadMore:()=>{}}));
 assert.match(html,new RegExp(`browseSearch=${originSearchId}`));assert.doesNotMatch(html,new RegExp(`browseSearch=${searchId}`));
 assert.match(html,/1 of 1 loaded stays/);assert.match(html,/2 nights · 2 rooms · 4 guests/);assert.match(html,/₹8,000</);
 assert.match(html,/Supplied locality/);assert.match(html,/Load more stays/);assert.match(html,/Choose room/);
 assert.equal((html.match(/<li>/g)??[]).length,3);assert.doesNotMatch(html,/>Gym</);
 assert.match(html,/aria-haspopup="dialog" aria-expanded="false" aria-controls="hotel-filter-dialog"/);
 assert.match(html,/<dialog[^>]+aria-labelledby="hotel-filter-dialog-title"/);assert.doesNotMatch(html,/<dialog[^>]+\bopen=/);
 assert.equal((html.match(/placeholder="Find a property"/g)??[]).length,1);
 assert.doesNotMatch(html,/Free cancellation|Breakfast included|Guest rating/);
});
test('hotel filters use loaded full-stay estimates and exclude unknown prices under budget',()=>{
 assert.deepEqual(filterHotelResults(hotels,{...emptyHotelFilters,budget:'5000'},'price').map(h=>h.tjHotelId),['2']);
 assert.deepEqual(filterHotelResults(hotels,{...emptyHotelFilters,name:' PALM ',category:'4',type:'Hotel'},'price').map(h=>h.tjHotelId),['1']);
 assert.equal(filterHotelResults(hotels,{...emptyHotelFilters,budget:'invalid'},'price').length,0);
 assert.equal(filterHotelResults(hotels,{...emptyHotelFilters,budget:'-1'},'price').length,0);
});
test('hotel sort keeps unknown prices last and never changes supplier input order',()=>{
 assert.deepEqual(filterHotelResults(hotels,emptyHotelFilters,'price').map(h=>h.tjHotelId),['2','1','3']);
 assert.deepEqual(filterHotelResults(hotels,emptyHotelFilters,'price-desc').map(h=>h.tjHotelId),['1','2','3']);
 assert.deepEqual(filterHotelResults(hotels,emptyHotelFilters,'supplier').map(h=>h.tjHotelId),['1','2','3']);
 assert.deepEqual(hotels.map(h=>h.tjHotelId),['1','2','3']);
 assert.equal(knownHotelTotal({...hotels[0],customerEstimateMinor:NaN}),null);
});

test('meal plan, free cancellation and budget must match the same priced rate',()=>{
 const now=Date.parse('2027-01-01T12:00:00+05:30');
 const free={isRefundable:true,penalties:[{from:'2027-01-01T00:00:00+05:30',to:'2027-01-02T00:00:00+05:30',amount:0}]};
 const rate=(optionId:string,totalPrice:number,mealBasis?:string,cancellation?:unknown)=>({optionId,mealBasis,cancellation,pricing:{totalPrice}});
 const listings:HotelResult[]=[
  {tjHotelId:'1',name:'Split terms',customerEstimateMinor:100000,options:[rate('a',1000,'Breakfast'),rate('b',2000,'Room Only',free)]},
  {tjHotelId:'2',name:'Matching plan',customerEstimateMinor:50000,options:[rate('c',500,'BO'),rate('d',4500,'Breakfast',free)]},
  {tjHotelId:'3',name:'Lower matching plan',customerEstimateMinor:300000,options:[rate('e',3000,'BB',free)]},
  {tjHotelId:'4',name:'Mixed meals',options:[{...rate('f',2000,'Breakfast',free),optionType:'SRCM'}]},
  {tjHotelId:'5',name:'Unverified terms',options:[rate('g',500,'Breakfast available',{isRefundable:true}),rate('',500,'Breakfast',free),rate('bad-price',NaN,'Breakfast',free)]},
  {tjHotelId:'6',name:'Legacy listing',customerEstimateMinor:200000,property:{amenities:['Breakfast included','Free cancellation']}},
  {tjHotelId:'7',name:'Exact half board',options:[rate('h',6500,'Half Board')]},
 ];
 const filters={...emptyHotelFilters,board:'breakfast' as const,freeCancellation:true};
 assert.deepEqual(filterHotelResults(listings,filters,'price',now).map(hotel=>hotel.tjHotelId),['3','2']);
 assert.deepEqual(filterHotelResults(listings,{...filters,budget:'4000'},'price',now).map(hotel=>hotel.tjHotelId),['3']);
 assert.equal(lowestMatchingHotelRate(listings[1].options,filters,now)?.rate.optionId,'d');
 assert.equal(filterHotelResults(listings,filters,'price',Date.parse(free.penalties[0].to)).length,0);
 assert.equal(nextHotelCancellationChange(listings,now),Date.parse(free.penalties[0].to));
 assert.equal(nextHotelCancellationChange(listings,Date.parse(free.penalties[0].to)),null);
 assert.deepEqual(hotelRateFacets(listings,now),{boards:new Set(['breakfast','room-only','half-board']),freeCancellation:true});
 assert.deepEqual(filterHotelResults(listings,{...emptyHotelFilters,board:'half-board'},'price',now).map(hotel=>hotel.tjHotelId),['7']);
 assert.equal(filterHotelResults(listings,emptyHotelFilters,'supplier',now).includes(listings[5]),true);
});

const localHotels:HotelResult[]=[
 {tjHotelId:'21',name:'Synthetic Mira Stay',customerEstimateMinor:800000,property:{city:'Mumbai',address:'Seasons Lane, Mira Road East, Maharashtra',amenities:['Free Wi-Fi','WiFi','Private parking','Outdoor swimming pool','Fitness center']}},
 {tjHotelId:'22',name:'Synthetic Mira Mare',customerEstimateMinor:400000,property:{city:'Ksamil',address:'Beach Road, Albania',amenities:['No Wi-Fi','Pool table','Parking unavailable','Restaurant']}},
 {tjHotelId:'23',name:'Synthetic Central Stay',customerEstimateMinor:1200000,property:{city:'Mumbai',address:'Main Road, Andheri',amenities:['Wi-Fi','Paid parking','Air conditioning']}},
 {tjHotelId:'24',name:'Missing property details'},
];
test('area filter uses supplied location phrases, boundaries and accents without matching names or joining fields',()=>{
 assert.deepEqual(filterHotelResults(localHotels,{...emptyHotelFilters,area:'mira road'},'price').map(h=>h.tjHotelId),['21']);
 assert.equal(hotelAreaMatches({...localHotels[1],property:{...localHotels[1].property!,city:'Mira',address:'Road, Albania'}},'Mira Road'),false);
 assert.equal(hotelAreaMatches({...localHotels[0],property:{city:'São Paulo',amenities:[]}},'sao paulo'),true);
 assert.equal(hotelAreaMatches({...localHotels[0],property:{city:'Bagan',amenities:[]}},'Baga'),false);
 assert.equal(hotelAreaMatches(localHotels[3],'Mumbai'),false);
 assert.equal(hotelAreaMatches(localHotels[0],'---'),false);
 assert.deepEqual(filterHotelResults(localHotels,{...emptyHotelFilters,area:'Mumbai',amenities:'wifi,parking',budget:'9000'},'price').map(h=>h.tjHotelId),['21']);
});
test('practical amenity counts use positive supplied facts once per stay and do not invent pool or free benefits',()=>{
 assert.deepEqual(hotelPracticalAmenities(localHotels[1]),['restaurant']);
 assert.deepEqual(selectedHotelAmenities('parking,wifi,wifi,spa,unknown'),['wifi','parking']);
 assert.deepEqual(hotelAmenityOptions(localHotels).map(({id,count})=>({id,count})),[{id:'wifi',count:2},{id:'parking',count:2},{id:'pool',count:1},{id:'restaurant',count:1},{id:'fitness',count:1},{id:'air-conditioning',count:1}]);
 assert.deepEqual(filterHotelResults(localHotels,{...emptyHotelFilters,amenities:'wifi,pool'},'price').map(h=>h.tjHotelId),['21']);
 assert.deepEqual(filterHotelResults(localHotels,{...emptyHotelFilters,amenities:'wifi,restaurant'},'price'),[]);
 assert.deepEqual(hotelAmenityOptions([localHotels[3]],'wifi'),[{id:'wifi',label:'Wi-Fi',count:0}]);
 assert.deepEqual(filterHotelResults(localHotels,emptyHotelFilters,'supplier').map(h=>h.tjHotelId),['21','22','23','24']);
});
test('rendered location and practical filters expose only supported choices and honest missing states',()=>{
 const props={searchId:'11111111-1111-4111-8111-111111111111',context:null,busy:false,onChoose:()=>{}};
 const html=renderToStaticMarkup(createElement(HotelResults,{...props,hotels:localHotels}));
 assert.match(html,/Area or address/);assert.match(html,/Practical amenities/);
 assert.match(html,/type="checkbox" aria-label="Wi-Fi"/);assert.match(html,/aria-label="2 loaded stays"/);
 const fields=html.match(/<fieldset class="hotel-practical-amenities">[\s\S]*?<\/fieldset>/)?.[0]??'';
 assert.doesNotMatch(fields,/Free parking|Free Wi-Fi|Guest review|Amenities nearby/i);
 const missing=renderToStaticMarkup(createElement(HotelResults,{...props,hotels:[localHotels[3]]}));
 assert.match(missing,/Location details have not been supplied/);assert.match(missing,/No matching practical amenities have been supplied/);
 assert.doesNotMatch(missing,/type="checkbox"/);assert.match(missing,/placeholder="Search a location"[^>]*disabled/);
 const loading=renderToStaticMarkup(createElement(HotelResults,{...props,hotels:[localHotels[3]],metadataStatus:'loading'}));
 assert.match(loading,/Location details are still loading/);assert.match(loading,/Adding supplied amenities/);
});
test('saved location and amenity filters render individual removal chips and useful no-match recovery',()=>{
 const key='maxtravel:hotel-browse:v1:11111111-1111-4111-8111-111111111111';
 const before=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 const saved=JSON.stringify({version:1,savedAt:Date.now(),value:{filters:{...emptyHotelFilters,area:'Mumbai',amenities:'wifi,restaurant'}}});
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{length:1,key:()=>key,getItem:(name:string)=>name===key?saved:null,removeItem:()=>{}}});
 try{
  const html=renderToStaticMarkup(createElement(HotelResults,{searchId:key.split(':').at(-1)!,hotels:localHotels,context:null,busy:false,onChoose:()=>{}}));
  assert.match(html,/Filters \(3\)/);assert.match(html,/aria-label="Remove area filter"/);assert.match(html,/aria-label="Remove Wi-Fi filter"/);assert.match(html,/aria-label="Remove Restaurant filter"/);
  assert.match(html,/No stays match your filters/);assert.match(html,/Some stays may not list the location or amenities/);assert.match(html,/Clear hotel filters/);
  assert.match(html,/type="checkbox" aria-label="Wi-Fi" checked/);
 }finally{if(before)Object.defineProperty(globalThis,'sessionStorage',before);else Reflect.deleteProperty(globalThis,'sessionStorage');}
});
test('saved rate preferences render the price and actual option that match both terms',()=>{
 const key='maxtravel:hotel-browse:v1:11111111-1111-4111-8111-111111111111';
 const before=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 const saved=JSON.stringify({version:1,savedAt:Date.now(),value:{filters:{board:'breakfast',freeCancellation:true}}});
 const cancellation={penalties:[{from:new Date(Date.now()-60_000).toISOString(),to:new Date(Date.now()+60_000).toISOString(),amount:0}]};
 const listing={...hotels[0],customerEstimateMinor:100000,options:[
  {optionId:'unmatched',mealBasis:'Room only',roomInfo:[{name:'Cheaper room'}],pricing:{totalPrice:1000}},
  {optionId:'matched',mealBasis:'Breakfast',roomInfo:[{name:'Matching room'}],cancellation,pricing:{totalPrice:2400}},
 ]};
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{length:1,key:()=>key,getItem:(name:string)=>name===key?saved:null,removeItem:()=>{}}});
 try{
  const html=renderToStaticMarkup(createElement(HotelResults,{searchId:key.split(':').at(-1)!,hotels:[listing],context:null,busy:false,onChoose:()=>{}}));
  assert.match(html,/Filters \(2\)/);
  assert.match(html,/Remove meal plan filter/);
  assert.match(html,/Remove free cancellation filter/);
  assert.match(html,/Lowest matching room option/);
  assert.match(html,/Matching room/);
  assert.match(html,/₹2,400/);
  assert.doesNotMatch(html,/Cheaper room|₹1,000/);
 }finally{if(before)Object.defineProperty(globalThis,'sessionStorage',before);else Reflect.deleteProperty(globalThis,'sessionStorage');}
});
test('stay context derives nights from submitted calendar dates without per-night assumptions',()=>{
 assert.equal(stayNights({checkIn:'2026-11-04',checkOut:'2026-11-06',rooms:2,guests:4}),2);
 assert.equal(stayNights({checkIn:'2026-11-04',checkOut:'2026-11-04',rooms:1,guests:1}),null);
 assert.equal(stayNights(null),null);
 assert.deepEqual(hotelAmenities(['Parking',' Wi-Fi ','parking','Wi-Fi','','Restaurant']),['Parking','Wi-Fi','Restaurant']);
});


test('metadata failure settles only its pending source and retains cached values and rate ownership',()=>{
 const hotels:HotelResult[]=[
  {tjHotelId:'1',name:'Cached',propertyContentStatus:'resolved',property:{address:'Known address',amenities:[]}},
  {tjHotelId:'2',name:'Pending original',propertyContentStatus:'pending',customerEstimateMinor:450000},
  {tjHotelId:'3',name:'Pending next',originSearchId:'later',propertyContentStatus:'pending'},
  {tjHotelId:'4',name:'Known missing',propertyContentStatus:'resolved',property:{amenities:[]}},
 ];
 const settled=hotelContentUnavailable(hotels,'base');
 assert.deepEqual(settled.map(hotel=>hotel.propertyContentStatus),['resolved','unavailable','pending','resolved']);
 assert.equal(settled[0],hotels[0]);assert.equal(settled[3],hotels[3]);
 assert.equal(settled[1].customerEstimateMinor,450000);assert.equal(settled[2].originSearchId,'later');
 assert.equal(hotels[1].propertyContentStatus,'pending');
 const next=hotelContentUnavailable(settled,'base','later');
 assert.equal(next[2].propertyContentStatus,'unavailable');assert.equal(next[0],hotels[0]);
});
