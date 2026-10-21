import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyHotelFilters,filterHotelResults,hotelAmenities,knownHotelTotal,stayNights,type HotelResult} from '../src/lib/hotel-results';
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
