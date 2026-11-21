import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,type ComponentType} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {HotelDetailViewProps,hotelRoomRateSummary} from '../src/components/hotel-detail-view';
const require=createRequire(import.meta.url);
const moduleExports=build({entryPoints:['src/components/hotel-detail-view.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,loader:{'.css':'empty'},jsx:'automatic'}).then(result=>{const compiled={exports:{} as {default:ComponentType<HotelDetailViewProps>;hotelRoomRateSummary:typeof hotelRoomRateSummary}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports;});
const component=moduleExports.then(exports=>exports.default);
const defaults:HotelDetailViewProps={name:'Synthetic coastal stay',context:{checkIn:'2026-11-01',checkOut:'2026-11-03',rooms:2,guests:4},options:[],roomsStatus:'ready',busy:false,now:0,onBack:()=>{},onRetry:()=>{},onReview:()=>{}};
async function render(props:Partial<HotelDetailViewProps>={}){return renderToStaticMarkup(createElement(await component,{...defaults,...props}));}

test('room comparison summary derives its count, lowest price and facts only from eligible rates',async()=>{
 const {hotelRoomRateSummary}=await moduleExports;
 const cancellation={isRefundable:true,penalties:[{from:'2026-11-01T00:00:00+05:30',to:'2026-11-21T00:00:00+05:30',amount:0}]};
 const options=[{optionId:'room-only',mealBasis:'ROOM_ONLY',pricing:{totalPrice:2805.89},cancellation},{optionId:'breakfast',mealBasis:'BREAKFAST',pricing:{totalPrice:2982.57},cancellation},{optionId:'another-breakfast',mealBasis:'BREAKFAST',pricing:{totalPrice:3500},cancellation}];
 const now=Date.parse('2026-11-17T12:00:00+05:30');
 const all=hotelRoomRateSummary(options,{breakfast:false,freeCancellation:false},now);
 assert.equal(all.filteredOptions.length,3);assert.equal(all.lowest?.total,280589);
 const filtered=hotelRoomRateSummary(options,{breakfast:true,freeCancellation:true},now);
 assert.deepEqual(filtered.filteredOptions.map(option=>option.optionId),['breakfast','another-breakfast']);
 assert.equal(filtered.lowest?.total,298257);assert.equal(filtered.lowest?.option,options[1]);
 assert.deepEqual(options.map(option=>option.optionId),['room-only','breakfast','another-breakfast']);
 const expired=hotelRoomRateSummary(options,{breakfast:true,freeCancellation:true},Date.parse('2026-11-22T12:00:00+05:30'));
 assert.equal(expired.filteredOptions.length,0);assert.equal(expired.lowest,undefined);
 const noTrustedClock=hotelRoomRateSummary(options,{breakfast:true,freeCancellation:true},null);
 assert.equal(noTrustedClock.lowest,undefined);
 const invalidPrice=hotelRoomRateSummary([{optionId:'unknown',mealBasis:'BREAKFAST',pricing:{totalPrice:NaN}}],{breakfast:true,freeCancellation:false},now);
 assert.equal(invalidPrice.filteredOptions.length,1);assert.equal(invalidPrice.lowest,undefined);
});

test('property overview is available while rates load and retains the exact stay context',async()=>{
 const html=await render({roomsStatus:'loading',property:{starRating:4,address:'A supplied address',amenities:['Parking']}});
 assert.match(html,/id="hotel-detail-title"/);assert.match(html,/Synthetic coastal stay/);assert.match(html,/4-star property category/);
 assert.match(html,/2 nights · 2 rooms · 4 guests/);assert.match(html,/1 Nov 2026/);assert.match(html,/3 Nov 2026/);
 assert.match(html,/Checking available rooms/);assert.match(html,/A supplied address/);assert.match(html,/Parking/);
 assert.doesNotMatch(html,/Guest rating|Book now|Free cancellation|per night/i);
});
test('room groups surface the lowest eligible full stays and keep tied and unpriced plans reachable',async()=>{
 const option=(optionId:string,room:string,totalPrice:number)=>({optionId,roomInfo:[{name:room}],pricing:{totalPrice}});
 const html=await render({options:[
  option('a-unknown','Twin',NaN),option('b-mid','Garden',5600),option('a-mid','Twin',6100),
  option('a-low','Twin',4200),option('a-tied','Twin',4200),option('c-unknown','Suite',0),
 ]});
 const ids=[...html.matchAll(/data-room-option-id="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(ids,['a-low','a-tied','a-mid','a-unknown','b-mid','c-unknown']);
});
test('missing metadata and failed or empty rates have explicit non-blocking recovery states',async()=>{
 const unavailable=await render({metadataStatus:'unavailable',roomsStatus:'error',roomsError:'Try again safely.'});
 assert.match(unavailable,/Property photos unavailable right now/);assert.match(unavailable,/Property category unavailable right now/);
 assert.match(unavailable,/Retry room availability/);assert.match(unavailable,/Try again safely/);assert.match(unavailable,/id="hotel-detail-title"/);
 const empty=await render();assert.match(empty,/No rooms available for this stay/);assert.match(empty,/Browse other stays/);
 assert.equal((empty.match(/>Back to stays<\/button>/g)??[]).length,1);
 assert.doesNotMatch(empty,/undefined|NaN|₹0/);
});
test('rates retain exact IDs, complete multi-room composition and customer total without invented discounts or tax splits',async()=>{
 const html=await render({selectedOptionId:'exact-option-A',options:[{optionId:'exact-option-A',roomInfo:[{id:'twin',name:'Twin'},{id:'double',name:'Double'}],mealBasis:'ROOM_ONLY',inclusions:['Wi-Fi'],bookingNotes:'Check supplier conditions.',pricing:{totalPrice:8765.43},cancellation:{isRefundable:true,penalties:[]}},{optionId:'exact-option-B',roomInfo:[{name:'Twin'},{name:'Double'}],pricing:{totalPrice:9000}}]});
 assert.match(html,/data-room-option-id="exact-option-A"/);assert.match(html,/data-room-option-id="exact-option-B"/);
 assert.match(html,/Twin \+ Double/);assert.match(html,/Selected room rate/);
 assert.match(html,/<div class="stay-preview-price"><small>Estimated full stay total from<\/small><strong>₹8,765\.43<\/strong><span>2 nights · 2 rooms · 4 guests<\/span><\/div>/);
 for(const [group,total] of ['₹8,765.43','₹9,000'].entries())assert.ok(html.includes(`<small>Estimated full stay total</small><strong id="stay-room-group-${group}-plan-0-price">${total}</strong><p>2 nights · 2 rooms · 4 guests</p>`));
 assert.match(html,/Cancellation terms require review/);assert.match(html,/Room only/);assert.match(html,/Wi-Fi/);
 assert.equal((html.match(/>Continue with room<\/button>/g)??[]).length,2);
 assert.doesNotMatch(html,/<button[^>]*aria-pressed=[^>]*>Continue with room<\/button>/);
 assert.doesNotMatch(html,/free.cancellation|per night|taxes included|discount/i);
});
test('invalid rate total cannot be selected and active review locks property-back controls',async()=>{
 const html=await render({busy:true,options:[{optionId:'invalid',pricing:{totalPrice:NaN}}]});
 assert.match(html,/Price unavailable/);assert.match(html,/<button[^>]*disabled=""[^>]*>Continue with room<\/button>/);
 assert.match(html,/<button type="button" disabled=""[^>]*>/);assert.doesNotMatch(html,/NaN/);
});
test('gallery shows only deduplicated allowlisted supplier images without leaking referrers or inventing counts',async()=>{
 const safe='https://i.travelapi.com/lodging/10000/property.jpg';
 const html=await render({property:{amenities:[],photos:[{url:safe,isHero:true},{url:safe,isHero:false},{url:'https://evil.example/private.jpg',isHero:false}]}});
 assert.match(html,/View all 1 photo/);assert.match(html,/referrerPolicy="no-referrer"/i);assert.doesNotMatch(html,/evil\.example/);
 assert.match(html,/aria-label="Close photo gallery"/);assert.match(html,/aria-labelledby="stay-gallery-title"/);
});
test('rate groups match the exact ordered complete room composition, not a first-room name or unknown variant',async()=>{
 const twin={id:'twin-A',name:'Twin'},double={id:'double-B',name:'Double'};
 const rate=(optionId:string,roomInfo?:{id?:string;name:string}[])=>({optionId,roomInfo,pricing:{totalPrice:8000}});
 const html=await render({options:[rate('same-combo-1',[twin,double]),rate('same-combo-2',[twin,double]),rate('reversed',[double,twin]),rate('different-id',[{...twin,id:'twin-other'},double]),rate('unknown-1'),rate('unknown-2')]});
 assert.equal((html.match(/class="stay-room-group"/g)??[]).length,5);
 assert.equal((html.match(/data-room-option-id=/g)??[]).length,6);
 const firstGroup=html.slice(html.indexOf('data-room-group="0"'),html.indexOf('data-room-group="1"'));
 assert.match(firstGroup,/same-combo-1/);assert.match(firstGroup,/same-combo-2/);assert.match(firstGroup,/2 rate plans/);
 assert.doesNotMatch(firstGroup,/data-room-option-id="reversed"|data-room-option-id="different-id"/);
 for(const id of ['reversed','different-id','unknown-1','unknown-2'])assert.match(html,new RegExp(`data-room-option-id="${id}"`));
});
test('new property category and room-direction decorations are SVG and the mobile CTA starts safely hidden',async()=>{
 const html=await render({property:{starRating:4,amenities:[]},roomsStatus:'loading',metadataStatus:'loading'});
 assert.doesNotMatch(html,/★|↓|Your property details are ready/);
 assert.match(html,/Explore the available property information/);assert.match(html,/class="stay-stars"[^>]*><svg/);
 assert.match(html,/class="stay-mobile-action" aria-label="Quick room selection" hidden=""/);
});

test('About renders optional supplier prose as text with a bounded preview and honest missing fallback',async()=>{
 const description='A supplied coastal property description. '.repeat(30);
 const html=await render({property:{amenities:[],address:'Real address',descriptionHeadline:'A supplier headline',description}});
 assert.match(html,/A supplier headline/);assert.match(html,/Read the full property description/);assert.match(html,/A supplied coastal property description/);
 const missing=await render({property:{amenities:[],address:'An address is not a description'}});
 assert.match(missing,/The supplier has not provided a property description/);
 const escaped=await render({property:{amenities:[],descriptionHeadline:'<img src=x onerror=alert(1)>',description:'<script>alert(1)</script>'}});
 assert.doesNotMatch(escaped,/<script>|<img src="?x/);assert.match(escaped,/&lt;script&gt;/);
});

test('property amenities collapse formatting duplicates while retaining supplier restrictions',async()=>{
 const html=await render({property:{amenities:['Parking',' parking ','Wi-Fi','Wi Fi','No airport shuttle','No airport shuttle','  ']}});
 const list=html.match(/<ul class="stay-amenities">(.*?)<\/ul>/)?.[1]??'';
 assert.equal((list.match(/<li>/g)??[]).length,3);
 assert.match(list,/<li>Parking<\/li>/);assert.match(list,/<li>Wi-Fi<\/li>/);
 assert.match(list,/<li>No airport shuttle<\/li>/);
 assert.doesNotMatch(list,/<li>parking<\/li>|<li>Wi Fi<\/li>|<li>Airport shuttle<\/li>/);
});
