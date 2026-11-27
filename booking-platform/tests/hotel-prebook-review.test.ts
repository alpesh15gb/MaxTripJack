import test from 'node:test';
import assert from 'node:assert/strict';
import {assertHotelPrebookReview,HotelPrebookReviewError,sameHotelPrebookCancellation} from '../src/lib/hotel-prebook-review';

const beforeAt=Date.parse('2026-11-16T10:55:30+05:30'),afterAt=beforeAt+60_000;
function policy(from='2026-11-16T10:55:00'){
 return {isRefundable:true,deadlineDateTime:'2026-11-17T12:00:00',penalties:[
  {from,to:'2026-11-17T12:00:00',amount:0,currency:'INR'},
  {from:'2026-11-17T12:00:00',to:'2026-11-18T12:00:00',amount:10000,currency:'INR'},
 ]};
}
function review(from?:string){return {bookingId:'fresh-reference',option:{pricing:{totalPrice:10000,currency:'INR'},cancellation:policy(from),compliance:{panRequired:false}}};}
const equal=(a:unknown,b:unknown,t=afterAt)=>sameHotelPrebookCancellation(a,b,beforeAt,t);

test('prebook accepts only elapsed rolling origin, preserves raw policy and uses fresh reference',()=>{
 const old=review(),fresh=review('2026-11-16T10:56:00'),saved=structuredClone([old,fresh]);
 assert.equal(assertHotelPrebookReview(old,fresh,1000000,beforeAt,afterAt),'fresh-reference');
 assert.deepEqual([old,fresh],saved);
 assert.equal(equal(undefined,undefined),true);
 assert.equal(equal(policy(),policy()),true);
});

test('prebook blocks real policy changes including fields not exposed in customer comparison',()=>{
 const old=policy();
 const changes:Array<(p:ReturnType<typeof policy>)=>void>=[
  p=>{p.isRefundable=false;},p=>{p.deadlineDateTime='2026-11-17T11:00:00';},
  p=>{p.penalties[0].amount=0.01;},p=>{p.penalties[1].amount=9999;},
  p=>{p.penalties[0].to='2026-11-17T11:00:00';p.penalties[1].from=p.penalties[0].to;},
  p=>{p.penalties[1].to='2026-11-19T12:00:00';},p=>{p.penalties[1].currency='USD';},
  p=>{Object.assign(p,{newSupplierRestriction:'changed'});},
  p=>{Object.assign(p.penalties[0],{chargeBasis:'per person'});},
 ];
 for(const change of changes){const fresh=policy('2026-11-16T10:56:00');change(fresh);assert.equal(equal(old,fresh),false);}
});

test('prebook never normalizes future/backward/expired origins, missing capture time or malformed schedules',()=>{
 const old=policy();
 for(const start of ['2026-11-16T10:57:00','2026-11-16T10:54:00','invalid'])assert.equal(equal(old,policy(start)),false);
 for(const time of [NaN,Infinity,beforeAt-1,Date.parse('2026-11-17T12:00:00+05:30')])assert.equal(equal(old,policy('2026-11-16T10:56:00'),time),false);
 const gap=policy('2026-11-16T10:56:00');gap.penalties[1].from='2026-11-17T12:01:00';assert.equal(equal(old,gap),false);
 const overlap=policy('2026-11-16T10:56:00');overlap.penalties[1].from='2026-11-17T11:59:00';assert.equal(equal(old,overlap),false);
 assert.equal(equal(old,{...policy('2026-11-16T10:56:00'),penalties:[...policy().penalties,{}]}),false);
 assert.equal(equal(old,{...policy('2026-11-16T10:56:00'),isRefundable:'true'}),false);
 assert.equal(sameHotelPrebookCancellation(old,policy('2026-11-16T10:56:00'),NaN,afterAt),false);
});

test('post-payment guard preserves price, currency, compliance and supplier reference checks',()=>{
 for(const [change,code] of [
  [(r:ReturnType<typeof review>)=>{r.bookingId='';},'HOTEL_REFERENCE_MISSING'],
  [(r:ReturnType<typeof review>)=>{r.option.pricing.totalPrice=10000.01;},'HOTEL_PRICE_CHANGED'],
  [(r:ReturnType<typeof review>)=>{r.option.pricing.currency='USD';},'HOTEL_PRICE_CHANGED'],
  [(r:ReturnType<typeof review>)=>{r.option.pricing.totalPrice=NaN;},'HOTEL_PRICE_CHANGED'],
  [(r:ReturnType<typeof review>)=>{r.option.compliance.panRequired=true;},'HOTEL_COMPLIANCE_CHANGED'],
  [(r:ReturnType<typeof review>)=>{r.option.cancellation.penalties[1].amount=1;},'HOTEL_CANCELLATION_CHANGED'],
 ] as const){const fresh=review('2026-11-16T10:56:00');change(fresh);assert.throws(()=>assertHotelPrebookReview(review(),fresh,1000000,beforeAt,afterAt),(e:unknown)=>e instanceof HotelPrebookReviewError&&e.code===code);}
});

test('post-payment review preserves the booked property, rooms, meal and rate terms',()=>{
 const accepted={
  ...review(),
  tjHotelId:'12345',
  option:{
   ...review().option,
   optionId:'option-1',optionType:'CRCM',inventory:{available:true},
   roomInfo:[{id:'room-1',name:'Deluxe',adults:2,children:0},{id:'room-2',name:'Suite',adults:1,children:1}],
   mealBasis:'Breakfast',inclusions:['Transfer','Wi-Fi'],bookingNotes:'Bring the original identification document.',
  },
 };
 const fresh=structuredClone(accepted);
 fresh.bookingId='new-booking-reference';
 fresh.option.inclusions.reverse();
 const check=(updated:unknown)=>assertHotelPrebookReview(accepted,updated,1000000,beforeAt,afterAt);
 assert.equal(check(fresh),fresh.bookingId);
 assert.throws(()=>check({...fresh,option:{...fresh.option,inventory:{available:false}}}),(error:unknown)=>error instanceof HotelPrebookReviewError&&error.code==='HOTEL_UNAVAILABLE');
 const changes:Array<(value:typeof fresh)=>void>=[
  value=>{value.tjHotelId='12346';},
  value=>{value.option.optionId='option-2';},
  value=>{value.option.optionType='SRSM';},
  value=>{value.option.roomInfo.reverse();},
  value=>{value.option.roomInfo[0].name='Standard';},
  value=>{value.option.roomInfo[0].id='room-3';},
  value=>{value.option.roomInfo[0].children=1;},
  value=>{value.option.mealBasis='Room Only';},
  value=>{value.option.inclusions.pop();},
  value=>{value.option.bookingNotes='Deposit required at check-in.';},
 ];
 for(const change of changes){
  const updated=structuredClone(fresh);
  change(updated);
  assert.throws(()=>check(updated),(error:unknown)=>error instanceof HotelPrebookReviewError&&error.code==='HOTEL_ROOM_TERMS_CHANGED');
 }
});

test('nonrefundable active origin can roll forward without ignoring raw restrictions',()=>{
 const old=policy(),fresh=policy('2026-11-16T10:56:00');
 for(const p of [old,fresh]){p.isRefundable=false;p.penalties[0].amount=10000;}
 assert.equal(equal(old,fresh),true);
 fresh.penalties[0].currency='USD';assert.equal(equal(old,fresh),false);
 fresh.penalties[0].currency='INR';fresh.penalties[0].amount=9999;assert.equal(equal(old,fresh),false);
});
