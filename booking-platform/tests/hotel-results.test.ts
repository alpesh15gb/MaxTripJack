import test from 'node:test';
import assert from 'node:assert/strict';
import {hotelContentUnavailable,emptyHotelFilters,filterHotelResults,hotelAmenities,knownHotelTotal,stayNights,type HotelResult} from '../src/lib/hotel-results';
const hotels:HotelResult[]=[{tjHotelId:'1',name:'Palm House',customerEstimateMinor:800000,property:{starRating:4,propertyType:'Hotel',amenities:[]}},{tjHotelId:'2',name:'Bay Stay',customerEstimateMinor:400000,property:{starRating:3,propertyType:'Resort',amenities:[]}},{tjHotelId:'3',name:'Unpriced stay',property:{amenities:[]}}];
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
