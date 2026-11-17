import test from 'node:test';
import assert from 'node:assert/strict';
import {initialReviewPriceChange,selectedFlightEstimate,selectedFlightsInJourneyOrder,selectedHotelEstimate} from '../src/lib/checkout-selection-context';
import type {Flight} from '../src/lib/booking-presentation';

function flight(id:string,price:number|null=450000,currency?:string):Flight{return {sI:[{dt:'2027-01-01T09:00:00',at:'2027-01-01T11:00:00',da:{code:'BOM'},aa:{code:'DEL'},fD:{aI:{name:'Fixture'},fN:id}}],totalPriceList:[{id,fareIdentifier:'STANDARD',customerEstimateMinor:price,currency,fD:{}}]};}

test('checkout uses journey order despite supplier insertion and keeps original fare IDs untouched',()=>{
 const outbound=flight('out'),back=flight('back'),groups={RETURN:[back],ONWARD:[outbound]},ids=['back','out'];
 const original=JSON.stringify({groups,ids});
 assert.deepEqual(selectedFlightsInJourneyOrder(groups,ids),[outbound,back]);
 assert.equal(JSON.stringify({groups,ids}),original);
 assert.deepEqual(selectedFlightsInJourneyOrder({'2':[back],'0':[outbound]},ids),[outbound,back]);
});

test('first flight comparison sums complete selected party amounts once and treats COMBO as one total',()=>{
 assert.equal(selectedFlightEstimate({RETURN:[flight('back',300000)],ONWARD:[flight('out',400000)]},['out','back']),700000);
 const combo=flight('combo',900000);combo.sI.push({...combo.sI[0],dt:'2027-01-06T09:00:00'});
 assert.equal(selectedFlightEstimate({COMBO:[combo],ONWARD:[flight('out')]},['combo']),900000);
});

test('unknown, partial, duplicate, ambiguous or non-INR selected flight estimates cannot claim a difference',()=>{
 const groups={ONWARD:[flight('out')],RETURN:[flight('back')]};
 for(const ids of [[],['out'],['out','out'],['out','unknown']])assert.equal(selectedFlightEstimate(groups,ids),null);
 assert.equal(selectedFlightEstimate({ONWARD:[flight('out'),flight('out',600000)]},['out']),null);
 for(const price of [null,0,-1,NaN,Infinity,1.5])assert.equal(selectedFlightEstimate({ONWARD:[flight('out',price)]},['out']),null);
 for(const currency of ['USD','','inr'])assert.equal(selectedFlightEstimate({ONWARD:[flight('out',300000,currency)]},['out']),null);
});

test('hotel comparison uses the exact INR full-stay option total without multiplying rooms or guests',()=>{
 assert.equal(selectedHotelEstimate({pricing:{totalPrice:12982.57,currency:'INR'}}),1298257);
 for(const currency of [undefined,'USD','','inr'])assert.equal(selectedHotelEstimate({pricing:{totalPrice:3000,currency}}),null);
 for(const totalPrice of [undefined,'3000',0,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.equal(selectedHotelEstimate({pricing:{totalPrice,currency:'INR'}}),null);
 assert.equal(selectedHotelEstimate(),null);
});

test('notice exists for known increases and decreases only, not unchanged or unavailable comparisons',()=>{
 assert.deepEqual(initialReviewPriceChange(700000,850000),{estimateMinor:700000,reviewedMinor:850000});
 assert.deepEqual(initialReviewPriceChange(850000,700000),{estimateMinor:850000,reviewedMinor:700000});
 for(const estimate of [null,0,-1,NaN,Infinity,1.5])assert.equal(initialReviewPriceChange(estimate,850000),null);
 assert.equal(initialReviewPriceChange(850000,850000),null);
 assert.equal(initialReviewPriceChange(850000,NaN),null);
});
