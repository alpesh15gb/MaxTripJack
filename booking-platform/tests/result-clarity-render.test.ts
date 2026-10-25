import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import BookingFlightCard from '../src/components/booking-flight-card';
import HotelResults from '../src/components/hotel-results';
import HotelRoomView from '../src/components/hotel-room-view';
import HotelPropertyMedia from '../src/components/hotel-property-media';
import HotelCancellationTimeline from '../src/components/hotel-cancellation-timeline';

const flightProps:ComponentProps<typeof BookingFlightCard>={flight:{sI:[{dt:'2026-10-31T10:00:00',at:'2026-10-31T12:00:00',da:{code:'BOM'},aa:{code:'DEL'},fD:{aI:{name:'Test airline'},fN:'1'}}],totalPriceList:[{id:'fare-1',fareIdentifier:'STANDARD',customerEstimateMinor:500000,fD:{}}]},group:'ONWARD',selectedFareId:'fare-1',busy:false,onSelect:()=>{}};
const roomProps:ComponentProps<typeof HotelRoomView>={name:'Test hotel',options:[{optionId:'room-1',roomInfo:[{name:'Twin room'}],pricing:{totalPrice:4000}}],context:{checkIn:'2026-10-31',checkOut:'2026-11-02',rooms:2,guests:3},busy:false,now:0,onBack:()=>{},onReview:()=>{}};
const hotelProps:ComponentProps<typeof HotelResults>={searchId:'11111111-1111-4111-8111-111111111111',hotels:[{tjHotelId:'h-1',name:'Test stay',customerEstimateMinor:400000,property:{amenities:['No Accessible Shuttle','Parking']}}],context:null,busy:false,onChoose:()=>{}};

test('flight card uses readable local dates and truthful total scope without invented duration',()=>{
 const html=renderToStaticMarkup(createElement(BookingFlightCard,flightProps));
 assert.match(html,/31 Oct 2026/);assert.doesNotMatch(html,/2026-10-31|flight group|party total/);
 assert.match(html,/Total duration unavailable/);assert.match(html,/Estimated total · all travellers/);assert.match(html,/Outbound journey/);
 const empty=renderToStaticMarkup(createElement(BookingFlightCard,{...flightProps,flight:{sI:[],totalPriceList:[]}}));
 assert.match(empty,/Date unavailable/);assert.match(empty,/Stop details unavailable/);assert.doesNotMatch(empty,/Non-stop|NaN|undefined/);
});

test('flight pending is scoped, truthful and before its action; read-only cards stay noninteractive',()=>{
 const html=renderToStaticMarkup(createElement(BookingFlightCard,{...flightProps,busy:true,checkingFareId:'fare-1'}));
 assert.match(html,/role="status"/);assert.match(html,/Price and availability are not confirmed yet/);
 assert.ok(html.indexOf('Checking current fare')<html.indexOf('Checking fare…'));
 for(const props of [{busy:false,checkingFareId:'fare-1'},{busy:true,checkingFareId:'other'},{busy:true,checkingFareId:'fare-1',readOnly:true}])assert.doesNotMatch(renderToStaticMarkup(createElement(BookingFlightCard,{...flightProps,...props})),/Checking current fare/);
});

test('room cards retain full-stay scope, known selection and safe missing-data fallback',()=>{
 const html=renderToStaticMarkup(createElement(HotelRoomView,{...roomProps,busy:true,checkingOptionId:'room-1',selectedOptionId:'room-1'}));
 assert.match(html,/31 Oct 2026 – 2 Nov 2026/);assert.match(html,/2 nights · 2 rooms · 3 guests/);
 assert.match(html,/All selected rooms and guests/);assert.match(html,/aria-pressed="true"/);
 assert.match(html,/Selected room rate/);assert.match(html,/Meal plan not supplied/);
 assert.ok(html.indexOf('Checking current room price')<html.indexOf('Checking room…'));
 assert.doesNotMatch(renderToStaticMarkup(createElement(HotelRoomView,{...roomProps,busy:true,checkingOptionId:'other'})),/Checking current room price/);
 assert.doesNotMatch(renderToStaticMarkup(createElement(HotelRoomView,{...roomProps,checkingOptionId:'room-1'})),/Checking current room price/);
 const noPrice=renderToStaticMarkup(createElement(HotelRoomView,{...roomProps,context:null,options:[{optionId:'r',pricing:{totalPrice:NaN}}]}));
 assert.match(noPrice,/Price unavailable/);assert.match(noPrice,/Room details not supplied/);assert.doesNotMatch(noPrice,/₹NaN|>NaN</);
 assert.match(renderToStaticMarkup(createElement(HotelRoomView,{...roomProps,options:[]})),/No rooms available/);
});

test('hotel benefits omit negative metadata without implying an accessible shuttle exists',()=>{
 const html=renderToStaticMarkup(createElement(HotelResults,{...hotelProps,busy:true,checkingHotelId:'h-1'}));
 assert.match(html,/Parking/);assert.doesNotMatch(html,/Accessible Shuttle/);assert.match(html,/Checking available rooms/);
 assert.ok(html.indexOf('Checking available rooms')<html.indexOf('Checking rooms…'));
 assert.doesNotMatch(renderToStaticMarkup(createElement(HotelResults,{...hotelProps,busy:true,checkingHotelId:'other'})),/Checking available rooms/);
});

test('photo renderer hides cached internal captions and has a real missing-photo fallback',()=>{
 const html=renderToStaticMarkup(createElement(HotelPropertyMedia,{name:'Test stay',gallery:true,photos:[{url:'https://i.travelapi.com/lodging/10000/room.jpg',caption:'CoverImage',isHero:true}]}));
 assert.doesNotMatch(html,/CoverImage|figcaption/);assert.match(html,/supplier property photo 1/);
 assert.match(renderToStaticMarkup(createElement(HotelPropertyMedia,{name:'Test stay',photos:[]})),/Property photos not available/);
});

test('cancellation display separates unknown charges from original supplier values',()=>{
 const policy={penalties:[{from:'2026-10-23T00:00:00',to:'2026-10-31T00:00:00',amount:2407.09}]};
 const html=renderToStaticMarkup(createElement(HotelCancellationTimeline,{value:policy}));
 const summary=html.slice(0,html.indexOf('<details>'));
 assert.match(summary,/Exact charge needs confirmation/);assert.match(summary,/currency, units or calculation basis/);
 assert.doesNotMatch(summary,/2407|₹|INR/);assert.match(html.slice(html.indexOf('<details>')),/2407.09/);
 assert.match(renderToStaticMarkup(createElement(HotelCancellationTimeline,{value:null})),/cannot confirm the cancellation schedule/);
});
