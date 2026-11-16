import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationPage,destinationPageResult,uniqueDestinations} from '../src/lib/hotel-destination-pages';
import {bookingSearchPrefill} from '../src/lib/booking-search-state';
const regions=Array.from({length:42},(_,index)=>String(index+1));

test('one exact geographic label becomes one choice; same-name cities in other states stay separate',()=>{
 const choices=uniqueDestinations([{region_id:'1',label:'Aurangabad, Maharashtra, India'},{region_id:'2',label:' AURANGABAD, MAHARASHTRA, INDIA '},{region_id:'3',label:'Aurangabad, Bihar, India'}]);
 assert.deepEqual(choices.map(city=>city.region_id),['1','3']);
});
test('mapping requests are bounded by region and page and preserve every region',()=>{
 assert.equal(destinationPage(regions).regionIds.length,20);
 assert.deepEqual(destinationPage(regions,'20:7'),{offset:20,page:7,regionIds:regions.slice(20,40)});
 assert.deepEqual(destinationPage(regions,'40:0').regionIds,['41','42']);
 for(const cursor of ['-1:0','0:-1','1:0','60:0','0:1e6','0:1000000','x','0:0:0'])assert.throws(()=>destinationPage(regions,cursor));
});
test('duplicate IDs collapse within a page and continuation traverses empty pages and region batches',()=>{
 assert.deepEqual(destinationPageResult(regions,undefined,{hotels:[{tjHotelId:1},{tjHotelId:'1'},{tjHotelId:'2'}],pageable:{totalPages:2}}),{hotelIds:['1','2'],nextCursor:'0:1',hasMore:true});
 assert.equal(destinationPageResult(regions,'0:1',{hotels:[],pageable:{totalPages:3}}).nextCursor,'0:2');
 assert.equal(destinationPageResult(regions,'0:2',{hotels:[],pageable:{totalPages:3}}).nextCursor,'20:0');
 assert.equal(destinationPageResult(regions,'20:0',{hotels:[]}).nextCursor,'40:0');
 assert.equal(destinationPageResult(regions,'40:0',{hotels:[]}).nextCursor,null);
});
test('100 hotels without pagination metadata leaves later inventory reachable and rejects oversized responses',()=>{
 const hotels=Array.from({length:100},(_,index)=>({tjHotelId:index+1}));
 assert.equal(destinationPageResult(['1'],undefined,{hotels}).nextCursor,'0:1');
 assert.equal(destinationPageResult(['1'],undefined,{hotels,pageable:{totalPages:null}}).nextCursor,'0:1');
 assert.throws(()=>destinationPageResult(['1'],undefined,{hotels:[...hotels,{tjHotelId:101}]}));
 assert.throws(()=>destinationPageResult(['1'],undefined,{hotels:[{tjHotelId:'bad'}]}));
});
test('public URLs preserve validated continuation but reject malformed or detached cursors',()=>{
 const criteria={product:'HOTEL',regionId:'123',destinationCursor:'20:2'};
 assert.deepEqual(bookingSearchPrefill(criteria),criteria);
 for(const extra of [{destinationCursor:'1:2'},{destinationCursor:'0:-1'},{regionId:'',destinationCursor:'0:2'},{regionId:'bad'}])assert.equal(bookingSearchPrefill({...criteria,...extra}).searchInvalid,'1');
});
