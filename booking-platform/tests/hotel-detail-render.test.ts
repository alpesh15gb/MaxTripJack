import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,type ComponentType} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {HotelDetailViewProps} from '../src/components/hotel-detail-view';
const require=createRequire(import.meta.url);
const component=build({entryPoints:['src/components/hotel-detail-view.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,loader:{'.css':'empty'},jsx:'automatic'}).then(result=>{const compiled={exports:{} as {default:ComponentType<HotelDetailViewProps>}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports.default;});
const defaults:HotelDetailViewProps={name:'Synthetic coastal stay',context:{checkIn:'2026-11-01',checkOut:'2026-11-03',rooms:2,guests:4},options:[],roomsStatus:'ready',busy:false,now:0,onBack:()=>{},onRetry:()=>{},onReview:()=>{}};
async function render(props:Partial<HotelDetailViewProps>={}){return renderToStaticMarkup(createElement(await component,{...defaults,...props}));}

test('property overview is available while rates load and retains the exact stay context',async()=>{
 const html=await render({roomsStatus:'loading',property:{starRating:4,address:'A supplied address',amenities:['Parking']}});
 assert.match(html,/id="hotel-detail-title"/);assert.match(html,/Synthetic coastal stay/);assert.match(html,/4-star property category/);
 assert.match(html,/2 nights · 2 rooms · 4 guests/);assert.match(html,/1 Nov 2026/);assert.match(html,/3 Nov 2026/);
 assert.match(html,/Checking available rooms/);assert.match(html,/A supplied address/);assert.match(html,/Parking/);
 assert.doesNotMatch(html,/Guest rating|Book now|Free cancellation|per night/i);
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
 assert.match(html,/Twin \+ Double/);assert.match(html,/₹8,765.43/);assert.match(html,/All selected rooms and guests/);assert.match(html,/Selected room rate/);
 assert.match(html,/Cancellation terms require review/);assert.match(html,/ROOM ONLY/);assert.match(html,/Wi-Fi/);
 assert.equal((html.match(/>Review stay<\/button>/g)??[]).length,2);
 assert.doesNotMatch(html,/free.cancellation|per night|taxes included|discount/i);
});
test('invalid rate total cannot be selected and active review locks property-back controls',async()=>{
 const html=await render({busy:true,options:[{optionId:'invalid',pricing:{totalPrice:NaN}}]});
 assert.match(html,/Price unavailable/);assert.match(html,/<button[^>]*disabled=""[^>]*aria-pressed="false"[^>]*>Review stay<\/button>/);
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
