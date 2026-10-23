import test from 'node:test';
import assert from 'node:assert/strict';
import {travelDateLabel,travelDateTimeLabel,travelTimeLabel} from '../src/lib/travel-date';
import {durationLabel,journeyMinutes,type FlightSegment} from '../src/lib/booking-presentation';
import {hotelAmenities} from '../src/lib/hotel-results';
import {hotelPhotoCaption,hotelPropertyDetails} from '../src/lib/hotel-presentation';
import {hotelCancellationTimeline} from '../src/lib/hotel-cancellation-timeline';

const first:FlightSegment={dt:'2026-10-31T23:00:00+05:30',at:'2026-11-01T01:00:00+05:30',fD:{aI:{name:'Test airline'},fN:'1'},da:{code:'BOM'},aa:{code:'DEL'}};
const next:FlightSegment={...first,dt:'2026-11-01T02:30:00+05:30',at:'2026-11-01T05:00:00+04:00',da:{code:'DEL'},aa:{code:'DXB'}};
const journey=(sI:FlightSegment[],group='ONWARD')=>journeyMinutes({sI,totalPriceList:[]},group);

test('readable dates preserve the supplier local day even across extreme offsets',()=>{
 for(const value of ['2026-10-31','2026-10-31T00:30:00','2026-10-31T00:30:00+14:00','2026-10-31T23:30:00-10:00'])assert.equal(travelDateLabel(value),'31 Oct 2026');
 assert.equal(travelDateLabel('2028-02-29'),'29 Feb 2028');
 assert.equal(travelDateTimeLabel(first.dt),'31 Oct 2026 · 23:00');
 assert.equal(travelTimeLabel(first.dt),'23:00');
 for(const value of [undefined,null,0,{},'', '2026-02-29','2026-02-30','2026-13-01','2026-10-31T24:00','2026-10-31T20:99','2026-10-31T20:00+15:00','2026-10-31 junk']){
  assert.equal(travelDateLabel(value),'Date unavailable',String(value));
  assert.equal(travelDateTimeLabel(value),'Date and time unavailable',String(value));
  assert.equal(travelTimeLabel(value),'Time unavailable',String(value));
 }
 assert.equal(travelTimeLabel('2026-10-31'),'Time unavailable');
 assert.equal(travelDateTimeLabel('2026-10-31'),'Date and time unavailable');
});

test('total journey includes overnight layover only for an explicit coherent offset chain',()=>{
 assert.equal(journey([first,next]),450);
 assert.equal(durationLabel(journey([first,next])),'7h 30m');
 assert.equal(journey([first,next],'COMBO'),null);
 assert.equal(journey([]),null);
 assert.equal(journey([{...first,dt:'2026-10-31T23:00:00',at:'2026-11-01T01:00:00',duration:120}]),120);
 for(const second of [
  {...next,dt:'2026-11-01T02:30:00'},
  {...next,dt:'2026-11-01T00:59:00+05:30'},
  {...next,at:'2026-11-01T01:00:00+05:30'},
  {...next,da:{code:'NMI'}},
  {...next,isRs:true},
  {...next,at:'2026-11-01T05:00:30+04:00'},
 ])assert.equal(journey([first,second]),null);
 // Known flight minutes do not silently exclude the unknown layover.
 assert.equal(journey([{...first,duration:120,at:'2026-11-01T01:00:00'},{...next,duration:240}]),null);
 assert.equal(durationLabel(null),'Total duration unavailable');
});

test('benefit badges exclude negative supplier facts and never synthesize accessibility',()=>{
 assert.deepEqual(hotelAmenities(['No Accessible Shuttle','Not wheelchair accessible','Accessible parking not available','Airport shuttle unavailable','Without parking','Parking',' Wheelchair Accessible ','parking','Non-smoking rooms']),['Parking','Wheelchair Accessible','Non-smoking rooms']);
 for(const input of [undefined,null,{},'',[],[null,1,{}]])assert.deepEqual(hotelAmenities(input),[]);
 assert.deepEqual(hotelAmenities(['No Accessible Shuttle']),[]);
});

test('technical image captions are hidden while real descriptions and safe photos survive',()=>{
 for(const caption of ['CoverImage','cover image','Cover_Image','hero-image','Image 12','Photo','',undefined,null])assert.equal(hotelPhotoCaption(caption),undefined);
 assert.equal(hotelPhotoCaption(' Deluxe room balcony '),'Deluxe room balcony');
 const url='https://i.travelapi.com/lodging/1000000/room.jpg';
 assert.deepEqual(hotelPropertyDetails({images:[{caption:'CoverImage',is_hero_image:true,links:{XXL:{href:url}}}]}).photos,[{url,isHero:true}]);
});

test('unknown monetary units never become a currency-formatted cancellation charge',()=>{
 const penalties=[{from:'2026-10-23T00:00:00',to:'2026-10-30T00:00:00',amount:0},{from:'2026-10-30T00:00:00',to:'2026-10-31T00:00:00',amount:2407.09},{from:'2026-10-31T00:00:00',to:'2026-11-02T00:00:00',amount:4499.7}];
 // Arbitrary metadata does not establish documented monetary unit/scope semantics.
 const windows=hotelCancellationTimeline({currency:'INR',penalties})!;
 assert.equal(windows[0].chargeKnown,true);
 for(const row of windows.slice(1)){
  assert.equal(row.chargeKnown,false);
  assert.match(row.charge,/exact charge cannot be confirmed/);
  assert.doesNotMatch(row.charge,/2407|4499|₹|INR|refundable|%|per room/);
 }
 for(const source of [undefined,null,{},[],{penalties:[]},{penalties:[{...penalties[0],amount:'0'}]}])assert.equal(hotelCancellationTimeline(source),null);
});


test('cancellation boundary formatting retains nonzero seconds and milliseconds',()=>{
 const row=hotelCancellationTimeline({penalties:[{from:'2026-10-23T00:00:30.250',to:'2026-10-24T00:00:15',amount:0}]})![0];
 assert.match(row.from,/12:00:30\.250/);assert.match(row.until,/12:00:15/);
});
