import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCheckoutTrips, type CheckoutTripRecord} from '../src/lib/checkout-trip-comparison';

const flight = (criteria:Record<string,unknown>={}):CheckoutTripRecord => ({product:'FLIGHT',search_product:'FLIGHT',criteria:{product:'FLIGHT',from:'BOM',to:'DEL',date:'2030-01-10',adults:1,...criteria},selection:{priceIds:['changing-fare-id']}});
const hotel = (criteria:Record<string,unknown>={},hid='10001'):CheckoutTripRecord => ({product:'HOTEL',search_product:'HOTEL',criteria:{product:'HOTEL',hotelIds:['10001','10002'],checkIn:'2030-01-10',checkOut:'2030-01-13',adults:1,...criteria},selection:{hid,optionId:'changing-room-rate'}});
const service = (kind='ANCILLARY',criteria:Record<string,unknown>={}):CheckoutTripRecord => ({...flight(criteria),service_kind:kind,search_service_kind:kind,parent_order_id:'11111111-1111-4111-8111-111111111111'});

test('another fare, quote/search, passenger count or cabin does not prove a different flight',()=>{
  for(const next of [flight(),flight({adults:4,children:2,cabin:'BUSINESS'}),{...flight(),selection:{priceIds:['another-fare-id']}}])assert.equal(compareCheckoutTrips(flight(),next),'conflict');
  assert.equal(compareCheckoutTrips(flight(),flight({date:'2030-01-11'})),'distinct');
  assert.equal(compareCheckoutTrips(flight(),flight({to:'GOI'})),'distinct');
  assert.equal(compareCheckoutTrips(flight(),flight({from:'DEL',to:'BOM'})),'distinct');
});

test('any shared dated round-trip or multi-city leg conflicts, independent of chosen first leg',()=>{
  const round=flight({returnDate:'2030-01-15'});
  const returning=flight({from:'DEL',to:'BOM',date:'2030-01-15'});
  assert.equal(compareCheckoutTrips(round,returning),'conflict');
  const multi=flight({from:'GOI',to:'BOM',date:'2030-01-09',legs:[{from:'GOI',to:'BOM',date:'2030-01-09'},{from:'BOM',to:'DEL',date:'2030-01-10'}]});
  assert.equal(compareCheckoutTrips(flight(),multi),'conflict');
  assert.equal(compareCheckoutTrips(flight({date:'2030-01-12'}),multi),'distinct');
});

test('hotel overlap uses the confirmed selected property and half-open stay dates',()=>{
  assert.equal(compareCheckoutTrips(hotel(),hotel({checkIn:'2030-01-12',checkOut:'2030-01-16'})),'conflict');
  assert.equal(compareCheckoutTrips(hotel(),hotel({checkIn:'2030-01-09',checkOut:'2030-01-11'})),'conflict');
  assert.equal(compareCheckoutTrips(hotel(),hotel({checkIn:'2030-01-11',checkOut:'2030-01-12'})),'conflict');
  assert.equal(compareCheckoutTrips(hotel(),hotel({checkIn:'2030-01-13',checkOut:'2030-01-14'})),'distinct');
  assert.equal(compareCheckoutTrips(hotel(),hotel({checkIn:'2030-01-09',checkOut:'2030-01-10'})),'distinct');
  assert.equal(compareCheckoutTrips(hotel(),hotel({},'10002')),'distinct');
  assert.equal(compareCheckoutTrips(hotel(),hotel({hotelIds:['010001']},'010001')),'conflict');
  assert.equal(compareCheckoutTrips(hotel(),{...hotel(),selection:{hid:'10001',optionId:'other-room'},criteria:{...hotel().criteria as object,adults:4}}),'conflict');
});

test('valid different products proceed, including an earlier flight service versus a hotel',()=>{
  assert.equal(compareCheckoutTrips(flight(),hotel()),'distinct');
  assert.equal(compareCheckoutTrips(hotel(),service()),'distinct');
  assert.equal(compareCheckoutTrips(service('REISSUE'),hotel()),'distinct');
  assert.equal(compareCheckoutTrips(flight(),service()),'conflict');
  assert.equal(compareCheckoutTrips(flight({date:'2030-01-20'}),service()),'distinct');
  assert.equal(compareCheckoutTrips(service(),service('REISSUE',{date:'2030-02-10'})),'conflict','same parent service scope stays locked despite changed dates');
});

test('inconsistent product/service ownership shape cannot establish distinctness',()=>{
  for(const invalid of [
    {...flight(),product:'BOAT'}, {...flight(),search_product:'HOTEL'}, {...flight(),criteria:{product:'HOTEL'}},
    {...service(),search_service_kind:'REISSUE'}, {...service(),parent_order_id:null}, {...service(),parent_order_id:'not-a-uuid'},
    {...flight(),parent_order_id:'11111111-1111-4111-8111-111111111111'}, {...hotel(),service_kind:'ANCILLARY',search_service_kind:'ANCILLARY'},
  ])assert.equal(compareCheckoutTrips(hotel(),invalid),'unverified');
});

test('missing, malformed, oversized or contradictory flight routes remain unverified',()=>{
  const one={from:'BOM',to:'DEL',date:'2030-01-10'},two={from:'DEL',to:'GOI',date:'2030-01-11'};
  for(const criteria of [
    {date:undefined},{date:'2030-02-30'},{date:'2030-01-10T00:00:00Z'},{from:'bom'},{to:'BOM'},
    {returnDate:null},{returnDate:'2030-01-09'},{legs:[]},{legs:[one]},{legs:[one,{}]},
    {legs:[one,two],returnDate:'2030-01-20'},{legs:[one,{...two,date:'2030-01-09'}]},
    {legs:[{...one,from:'GOI'},two]},{legs:Array.from({length:7},()=>one)},
  ])assert.equal(compareCheckoutTrips(hotel(),flight(criteria)),'unverified',JSON.stringify(criteria));
});

test('missing property selection or malformed hotel dates do not permit a fresh payment',()=>{
  for(const invalid of [
    {...hotel(),selection:{}},hotel({},'20002'),hotel({hotelIds:[]}),hotel({hotelIds:['10001',null]}),
    hotel({hotelIds:Array.from({length:101},()=> '10001')}),hotel({checkIn:'2030-02-30'}),hotel({checkOut:'2030-01-10'}),
    hotel({checkOut:'2030-01-09'}),hotel({checkIn:null}),{...hotel(),selection:{hid:10001}},
  ])assert.equal(compareCheckoutTrips(flight(),invalid),'unverified');
});

test('comparison is symmetric and never mutates immutable stored inputs',()=>{
  const pairs:[[CheckoutTripRecord,CheckoutTripRecord],[CheckoutTripRecord,CheckoutTripRecord],[CheckoutTripRecord,CheckoutTripRecord]]=[[hotel(),flight()],[hotel(),hotel({checkIn:'2030-01-12'})],[flight(),flight({date:'bad'})]];
  for(const [a,b] of pairs){const original=JSON.stringify([a,b]);assert.equal(compareCheckoutTrips(a,b),compareCheckoutTrips(b,a));assert.equal(JSON.stringify([a,b]),original);}
});
