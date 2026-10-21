import test from 'node:test';
import assert from 'node:assert/strict';
import { customerHotelOptions, customerHotelResults } from '../src/lib/customer-pricing';
import { hotelCancellationLabel, hotelPropertyDetails, hotelRoomLabel } from '../src/lib/hotel-presentation';
const option = {optionId:'room-1',roomInfo:[{id:'1',name:'Twin room'},{id:'1',name:'Twin room'}],inclusions:['Breakfast','Wi-Fi'],mealBasis:'Breakfast',pricing:{totalPrice:1000,currency:'INR',mf:20,mft:3.6},commercial:{commission:999},reviewHash:'secret'};
test('hotel rate preserves supplier room names and inclusions without commercial fields',()=>{
 const result=customerHotelOptions({options:[option]}).options[0];
 assert.equal(hotelRoomLabel(result),'Twin room + Twin room');assert.deepEqual(result.inclusions,['Breakfast','Wi-Fi']);
 assert.equal(result.pricing.totalPrice,1000);assert.equal(result.pricing.mf,20);
 assert.ok(!JSON.stringify(result).includes('commission'));assert.ok(!JSON.stringify(result).includes('secret'));
});
test('hotel options fail closed for missing or unsupported currency and invalid totals',()=>{
 assert.equal(customerHotelOptions({options:[{...option,pricing:{totalPrice:100}},{...option,pricing:{totalPrice:100,currency:'USD'}}]}).options.length,0);
 assert.throws(()=>customerHotelOptions({options:[{...option,pricing:{totalPrice:-1,currency:'INR'}}]}));
});
test('hotel list customer price includes configured markups and exposes no raw net',()=>{
 const result=customerHotelResults({hotels:[{tjHotelId:'123',name:'Example Hotel',options:[option]}]},{markup_minor:1000,markup_basis_points:1000,service_fee_minor:2000}).hotels[0];
 assert.equal(result.customerEstimateMinor,113000);assert.equal(result.options[0].pricing.totalPrice,1130);
 assert.ok(!JSON.stringify(result).includes('commercial'));
});
test('unknown or inactive hotels and missing room detail do not acquire invented metadata',()=>{
 assert.equal(customerHotelResults({hotels:[{tjHotelId:'12',name:'Closed',is_active:false}]}).hotels.length,0);
 const result=customerHotelResults({hotels:[{tjHotelId:'12',name:'Only name'}]}).hotels[0];
 assert.equal(result.customerEstimateMinor,null);assert.deepEqual(result.property,{amenities:[]});
 assert.equal(hotelRoomLabel({roomInfo:[]}),'Room details not supplied');
});
test('static property data includes star classification not guest reviews and drops image URLs',()=>{
 assert.deepEqual(hotelPropertyDetails({star_rating:'4',property_type:{name:'Hotel'},locale:{address:{fulladdr:'Real supplier address'}},amenities:{'1':{name:'Pool'}},guestRating:9.8,images:[{url:'https://untrusted.example/image'}]}),{starRating:4,propertyType:'Hotel',address:'Real supplier address',amenities:['Pool']});
 assert.equal(hotelPropertyDetails({star_rating:'9.8'}).starRating,undefined);
});
test('refundable flag alone or payment deadline never claims free cancellation',()=>{
 assert.equal(hotelCancellationLabel({isRefundable:true,deadlineDateTime:'2030-01-01T00:00:00'}),'Cancellation terms require review');
});
test('zero-penalty window interpreted in Kolkata time with exclusive end',()=>{
 const source={isRefundable:true,penalties:[{from:'2026-10-21T00:00:00',to:'2026-10-22T00:00:00',amount:0},{from:'2026-10-22T00:00:00',to:'2026-10-23T00:00:00',amount:1000}]};
 assert.match(hotelCancellationLabel(source,Date.parse('2026-10-21T12:00:00Z')),/Supplier free-cancellation window/);
 assert.equal(hotelCancellationLabel(source,Date.parse('2026-10-21T18:30:00Z')),'Cancellation charges apply · review full terms');
});
test('overlapping or malformed penalty windows cannot promise free cancellation',()=>{
 const zero={from:'2026-10-21T00:00:00',to:'2026-10-23T00:00:00',amount:0};
 assert.equal(hotelCancellationLabel({isRefundable:true,penalties:[zero,{...zero,amount:1}]},Date.parse('2026-10-21T12:00:00Z')),'Cancellation terms require review');
 assert.equal(hotelCancellationLabel({penalties:[{...zero,to:'bad'}]}),'Cancellation terms require review');
});

test('partially malformed schedules do not expose a misleading free window',()=>{
 const zero={from:'2026-10-21T00:00:00',to:'2026-10-23T00:00:00',amount:0};
 assert.equal(hotelCancellationLabel({isRefundable:true,penalties:[zero,{...zero,amount:'unknown'}]},Date.parse('2026-10-21T12:00:00Z')),'Cancellation terms require review');
});

test('explicitly unavailable room inventory is never displayed as a selectable rate',()=>{
 assert.equal(customerHotelOptions({options:[{...option,inventory:{available:false}}]}).options.length,0);
 assert.equal(customerHotelOptions({options:[{...option,inventory:{available:true}}]}).options.length,1);
});

test('photo metadata accepts only documented exact HTTPS supplier origin and path',()=>{
 const urls=['https://pix8.agoda.net/hotelImages/123/room.jpg','http://pix8.agoda.net/hotelImages/a','https://pix8.agoda.net.evil.test/hotelImages/a','https://user:secret@pix8.agoda.net/hotelImages/a','https://pix8.agoda.net:444/hotelImages/a','https://pix8.agoda.net/other/a','https://127.0.0.1/hotelImages/a'];
 const details=hotelPropertyDetails({images:urls.map(href=>({is_hero_image:true,caption:'Room',links:{Standard:{href}}}))});
 assert.deepEqual(details.photos,[{url:urls[0],caption:'Room',isHero:true}]);
});

test('photo paths reject normalized traversal, escaped separators and explicit default ports',()=>{
 const urls=['https://pix8.agoda.net:443/hotelImages/a','https://pix8.agoda.net/hotelImages/../private','https://pix8.agoda.net/hotelImages/%2e%2e/private','https://pix8.agoda.net/hotelImages/%252e%252e/private','https://pix8.agoda.net/hotelImages/a%2f..%2fprivate','https://pix8.agoda.net/hotelImages/a%5c..%5cprivate'];
 for(const href of urls)assert.equal(hotelPropertyDetails({images:[{links:{Standard:{href}}}]}).photos,undefined,href);
});

test('undocumented image query credentials and fragments never reach customer output',()=>{
 for(const suffix of ['?token=secret','#private'])assert.equal(hotelPropertyDetails({images:[{links:{Standard:{href:'https://pix8.agoda.net/hotelImages/a.jpg'+suffix}}}]}).photos,undefined);
});
