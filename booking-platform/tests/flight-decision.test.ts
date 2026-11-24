import test from 'node:test';
import assert from 'node:assert/strict';
import {airportDecisionLabel,fareDecisionLabel,fareDecisionName,baggageDecisionLabel,fareDecisionDetails,lowestComparableFare} from '../src/lib/flight-decision';
import {parseBookingHandoff} from '../src/lib/booking-handoff';
const fare={id:'one',fareIdentifier:'CORPORATE',customerEstimateMinor:100,fD:{}};
test('fare labels preserve recognizable brands and disambiguate each otherwise identical display name',()=>{
 const offers=[fare,{...fare,id:'two'},{...fare,id:'three',fareIdentifier:'PUBLISHED'},
  {...fare,id:'four',fareIdentifier:'STANDARD'},{...fare,id:'five',fareIdentifier:'SPICEFLEX'},
  {...fare,id:'six',fareIdentifier:'ECONOMY_LITE'},{...fare,id:'seven',fareIdentifier:'ZX_412_B'},{...fare,id:'eight',fareIdentifier:'ZY_15_Q'}];
 assert.deepEqual(offers.map(offer=>fareDecisionLabel(offer,offers)),[
  'Corporate fare · Option 1','Corporate fare · Option 2','Standard fare · Option 1','Standard fare · Option 2',
  'SpiceFlex','Economy Lite','Fare option 1','Fare option 2',
 ]);
 assert.equal(fareDecisionName({...fare,fareIdentifier:'PUBLISHED'}),'Standard fare');
 assert.equal(fareDecisionName({...fare,fareIdentifier:'FLEXI_PLUS'}),'Flexi Plus');
 assert.equal(fareDecisionName({...fare,fareIdentifier:'STRETCH_PLUS'}),'Stretch Plus');
 assert.equal(fareDecisionName({...fare,fareIdentifier:'NDC_Xpress Value'}),'Xpress Value');
 assert.equal(offers[6].fareIdentifier,'ZX_412_B');
});

test('fare comparison anchors to a selectable known estimate and declines to compare a mixed currency list',()=>{
 const cheaper={...fare,id:'ineligible',customerEstimateMinor:50};
 const unknown={...fare,id:'unknown',customerEstimateMinor:null};
 assert.equal(lowestComparableFare([unknown,cheaper,fare],offer=>offer.id!=='ineligible'),fare);
 assert.equal(lowestComparableFare([fare,{...cheaper,currency:'USD'}],()=>true),undefined);
 assert.equal(lowestComparableFare([unknown],()=>true),undefined);
});

test('only known differences in baggage and cancellation are marked for comparison',()=>{
 const standard={...fare,fD:{ADULT:{cc:'ECONOMY',rT:0,bI:{cB:'7 Kg',iB:'15 Kg'}}}};
 const flexible={...fare,fD:{ADULT:{cc:'ECONOMY',rT:1,bI:{cB:'5',iB:'25 Kg'}}}};
 assert.deepEqual(fareDecisionDetails(flexible,standard).filter(row=>row.differs),[
  {label:'Checked baggage',value:'25 Kg',differs:true},
  {label:'Cancellation',value:'Refundable · charges may apply',differs:true},
 ]);
 assert.equal(fareDecisionDetails(fare,standard).some(row=>row.differs),false);
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
