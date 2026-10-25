import test from 'node:test';
import assert from 'node:assert/strict';
import {airportDecisionLabel,fareDecisionLabel,baggageDecisionLabel} from '../src/lib/flight-decision';
import {parseBookingHandoff} from '../src/lib/booking-handoff';
const fare={id:'one',fareIdentifier:'CORPORATE',customerEstimateMinor:100,fD:{}};
test('fare labels preserve opaque offers and disambiguate duplicate supplier names without invented benefits',()=>{
 const offers=[fare,{...fare,id:'two'},{...fare,id:'three',fareIdentifier:'PUBLISHED'}];
 assert.equal(fareDecisionLabel(fare,offers),'CORPORATE · Option 1');assert.equal(fareDecisionLabel(offers[1],offers),'CORPORATE · Option 2');assert.equal(fareDecisionLabel(offers[2],offers),'PUBLISHED');assert.deepEqual(offers.map(row=>row.id),['one','two','three']);
});
test('airport labels use optional supplied public fields and code fallback, never inferred nearby airports',()=>{
 assert.equal(airportDecisionLabel({code:'BOM'}),'BOM');assert.equal(airportDecisionLabel({code:'BOM',city:'Mumbai',name:'Supplied Airport',country:'India'}),'BOM · Supplied Airport · Mumbai · India');assert.equal(airportDecisionLabel(undefined),'Airport not supplied');
});
test('public airport names survive account handoff while unknown private metadata is stripped',()=>{
 const airport={code:'BOM',city:'Mumbai',name:'Supplied Airport',country:'India',terminalSecret:'private'};
 const result=parseBookingHandoff({version:1,savedAt:100,product:'FLIGHT',searchId:'11111111-1111-4111-8111-111111111111',selection:{priceIds:['one']},flights:[{sI:[{dt:'2026-12-01T09:00',at:'2026-12-01T11:00',da:airport,aa:{code:'DEL'},fD:{aI:{name:'Airline'},fN:'123'}}],totalPriceList:[fare]}]},100);
 assert.deepEqual(result?.flights[0].sI[0].da,{code:'BOM',city:'Mumbai',name:'Supplied Airport',country:'India'});assert.equal(JSON.stringify(result).includes('terminalSecret'),false);
});

test('unitless baggage quantities are qualified without inventing kilograms or pieces',()=>{
 for(const value of ['5',5,'0','5 / 10','5.5'])assert.equal(baggageDecisionLabel(value),`${value} (unit not supplied)`);
 for(const value of ['7 Kg','15KG','1 Piece','No allowance','Included as per airline'])assert.equal(baggageDecisionLabel(value),value);
 for(const value of [null,undefined,{},'',NaN,-1])assert.equal(baggageDecisionLabel(value),'Not supplied');
});

test('numeric public baggage survives handoff as raw text without inferred units',()=>{
 const result=parseBookingHandoff({version:1,savedAt:100,product:'FLIGHT',searchId:'11111111-1111-4111-8111-111111111111',selection:{priceIds:['one']},flights:[{sI:[],totalPriceList:[{...fare,fD:{ADULT:{bI:{cB:5,iB:'5'}}}}]}]},100);
 assert.deepEqual(result?.flights[0].totalPriceList[0].fD.ADULT.bI,{cB:'5',iB:'5'});
 assert.equal(baggageDecisionLabel(result?.flights[0].totalPriceList[0].fD.ADULT.bI?.cB),'5 (unit not supplied)');
});
