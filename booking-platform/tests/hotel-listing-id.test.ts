import test from 'node:test';
import assert from 'node:assert/strict';
import {hotelListingId} from '../src/lib/hotel-listing-id';
import {customerHotelResults} from '../src/lib/customer-pricing';
test('observed listing hotelId and documented tjHotelId normalize to stable string identifiers',()=>{
 for(const hotel of [{hotelId:123},{hotelId:'123'},{tjHotelId:123},{tjHotelId:'123'},{hotelId:123,tjHotelId:'123'}])assert.equal(hotelListingId(hotel),'123');
});
test('conflicting, malformed, unsafe and unrelated aliases fail closed',()=>{
 for(const hotel of [{hotelId:'123',tjHotelId:'456'},{hotelId:'123',tjHotelId:null},{hotelId:9007199254740992},{hotelId:'9007199254740992'},{hotelId:'00123'},{hotelId:'1e3'},{hotelId:' 123 '},{hotelId:-1},{hotelId:0},{hotelId:1.5},{hotelId:{}},{id:'123'},{hid:'123'},null,[]])assert.equal(hotelListingId(hotel),undefined);
});
test('real listing identity survives normalization but never widens the owned requested subset',()=>{
 const normalized=customerHotelResults({hotels:[{hotelId:123,name:'Requested property'},{hotelId:'456',name:'Not requested'},{hotelId:'123',tjHotelId:'456',name:'Ambiguous property'},{hotelId:'123',name:'Inactive',is_active:false}]}).hotels;
 assert.deepEqual(normalized.map(hotel=>hotel.tjHotelId),['123','456']);
 const requested=['123'];
 assert.deepEqual(normalized.filter(hotel=>requested.includes(hotel.tjHotelId)).map(hotel=>hotel.name),['Requested property']);
});
test('stored raw listing identity resolves the same property for review naming',()=>{
 const hotels=[{hotelId:123,name:'Requested property'},{hotelId:456,name:'Other property'}];
 assert.equal(hotels.find(hotel=>hotelListingId(hotel)==='123')?.name,'Requested property');
 assert.equal(hotels.find(hotel=>hotelListingId(hotel)==='999'),undefined);
});
