import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierInstant,suppliedMinutes} from '../src/lib/supplier-time';
import {connectionLabel,segmentDurationLabel} from '../src/lib/flight-duration';
import {hotelCancellationTimeline} from '../src/lib/hotel-cancellation-timeline';
import {hotelCancellationLabel} from '../src/lib/hotel-presentation';
const segment={dt:'2026-12-10T09:15:00',at:'2026-12-10T11:25:00',duration:130,fD:{aI:{name:'Fixture airline'},fN:'201'},da:{code:'BOM'},aa:{code:'DEL'}};
test('supplied segment minutes are integer-only and never invented',()=>{assert.equal(segmentDurationLabel(130),'2h 10m');assert.equal(segmentDurationLabel(145),'2h 25m');for(const value of [undefined,null,'130',-1,0,1.5,Infinity,NaN]){assert.equal(suppliedMinutes(value),null);assert.equal(segmentDurationLabel(value),'Duration not supplied');}});
test('strict calendar and timezone parsing rejects rollover or implicit zones',()=>{for(const value of ['2026-02-30T10:00Z','2026-02-29T10:00Z','2026-13-01T10:00Z','2026-01-01T24:00Z','2026-01-01T12:60Z','2026-01-01T12:00:60Z','2026-01-01T12:00+14:01','2026-01-01T12:00+25:00','2026-01-01T12:00','2026-01-01T12:00-00:00','2026-01-01T12:00-0000'])assert.equal(supplierInstant(value),null,value);assert.equal(supplierInstant('2028-02-29T00:00','+05:30'),Date.parse('2028-02-28T18:30Z'));});
test('layover needs explicit offsets, same airport, coherent journey and nonnegative whole minutes',()=>{
 const next={...segment,da:{code:'DEL'},aa:{code:'DXB'},dt:'2026-12-11T01:00:00+05:30'};
 const current={...segment,at:'2026-12-10T23:30:00+05:30'};
 assert.equal(connectionLabel(current,next),'Connection at DEL · 1h 30m');
 assert.equal(connectionLabel(current,{...next,dt:current.at}),'Connection at DEL · 0h 0m');
 for(const dt of ['2026-12-11T01:00:00','2026-12-10T22:00:00+05:30','2026-02-30T01:00Z'])assert.match(connectionLabel(current,{...next,dt}),/duration not supplied/);
 assert.match(connectionLabel(current,{...next,da:{code:'NMI'}}),/Transfer between DEL and NMI/);
 assert.equal(connectionLabel(current,next,'COMBO'),'Connection duration not supplied');assert.equal(connectionLabel(current,{...next,isRs:true}),'Connection duration not supplied');
 assert.equal(connectionLabel({...current,at:'2026-12-10T18:00:00Z'},next),'Connection at DEL · 1h 30m');
});
const zero={from:'2026-10-21T00:00:00',to:'2026-10-22T00:00:00',amount:0};
const charged={from:zero.to,to:'2026-10-23T00:00:00',amount:1000};
test('hotel windows use documented IST and never assign currency or refund amounts',()=>{const rows=hotelCancellationTimeline({isRefundable:true,penalties:[zero,charged]})!;assert.equal(rows.length,2);assert.match(rows[0].from,/21 Oct 2026/);assert.match(rows[0].charge,/No supplier cancellation charge/);assert.match(rows[1].charge,/Reported amount: 1000/);assert.match(rows[1].charge,/Currency, units and calculation basis/);assert.doesNotMatch(rows[1].charge,/₹|%|per room|refund/);assert.deepEqual(hotelCancellationTimeline({penalties:[{...zero,from:'2026-10-20T18:30:00Z',to:'2026-10-21T18:30:00Z'}]})?.[0],rows[0]);});
test('ambiguous schedules fail closed and impossible dates cannot claim free cancellation',()=>{for(const penalties of [[],[{...zero,from:'2026-02-30T00:00:00'}],[zero,{...charged,amount:'1000'}],[zero,{...charged,amount:-1}],[zero,{...zero,amount:1000}],Array(41).fill(zero)])assert.equal(hotelCancellationTimeline({penalties}),null);assert.equal(hotelCancellationTimeline({isRefundable:false,penalties:[zero]}),null);assert.equal(hotelCancellationTimeline({deadlineDateTime:zero.to,isRefundable:true}),null);assert.equal(hotelCancellationLabel({isRefundable:true,penalties:[{...zero,from:'2026-02-30T00:00:00'}]},Date.parse('2026-10-21T12:00Z')),'Cancellation terms require review');});
test('active boundary and nonrefundable truth remain unchanged',()=>{const policy={isRefundable:true,penalties:[zero,charged]};assert.match(hotelCancellationLabel(policy,Date.parse('2026-10-21T18:29:59Z')),/Supplier free-cancellation/);assert.equal(hotelCancellationLabel(policy,Date.parse('2026-10-21T18:30:00Z')),'Cancellation charges apply · review full terms');assert.equal(hotelCancellationLabel({isRefundable:false,penalties:[]}),'Non-refundable · review full terms');});

test('future overlapping charge cannot extend a free-cancellation promise',()=>{
 const policy={isRefundable:true,penalties:[{...zero,to:'2026-10-23T00:00:00'},{...charged,to:'2026-10-24T00:00:00'}]};
 assert.equal(hotelCancellationLabel(policy,Date.parse('2026-10-21T06:30:00Z')),'Cancellation terms require review');
 assert.equal(hotelCancellationTimeline(policy),null);
});
