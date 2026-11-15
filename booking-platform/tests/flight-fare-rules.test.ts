import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSupplierPolicy} from '../src/lib/public-supplier-policy';
import {publicSupplierReview} from '../src/lib/public-supplier-review';
import {flightFareRuleTerms,flightFareRuleRoutes,hasFlightCancellationRules,flightRuleWindow} from '../src/lib/flight-fare-rules';
import {compareReviewedTerms} from '../src/lib/review-term-changes';

// Shapes verified against TripJack's official linked Fare Rule.zip; synthetic
// text/values below exercise the contract without using any live customer data.
const timedRule=()=>({amount:3675,additionalFee:50,policyInfo:'Cancellation fee applies, limited to the base fare.',fcs:{ACF:3675,ACFT:183.75,CCF:50,CCFT:9},st:'0',et:'8760'});
const sample=()=>({fareRule:{'BOM-DEL':{tfr:{CANCELLATION:[timedRule()],DATECHANGE:[{amount:3150,policyInfo:'Fare difference also applies.',st:'0',et:'8760'}],NO_SHOW:[{policyInfo:'No refund for no-show.',st:'0',et:'8760'}],SEAT_CHARGEABLE:[{policyInfo:'',st:'0',et:'8760'}]}}},status:{success:true,httpStatus:200}});

test('official route-keyed timed fare rules survive the public review boundary and repeated projection',()=>{
 const raw=sample(),publicReview=publicSupplierReview('FLIGHT',{fareRules:raw});
 const safe=publicReview.fareRules!;
 assert.deepEqual(publicSupplierPolicy(safe),safe);
 assert.equal(flightFareRuleRoutes(safe)[0].policy.tfr?.CANCELLATION?.[0].amount,3675);
 assert.equal(flightFareRuleRoutes(safe)[0].policy.tfr?.CANCELLATION?.[0].st,0);
 assert.ok(hasFlightCancellationRules(safe));
 assert.ok(publicReview.terms.some(row=>row.key==='fareRules.BOM-DEL.CANCELLATION'&&row.value!==null));
 assert.doesNotMatch(JSON.stringify(safe),/status|httpStatus|SEAT_CHARGEABLE/);
});

test('period-based rules keep before/after departure restrictions and each route separate',()=>{
 const raw={fareRule:{'DEL-DXB':{tfr:{CANCELLATION:[{pp:'BEFORE_DEPARTURE',amount:14000,policyInfo:'Cancellation has a fee.'},{pp:'AFTER_DEPARTURE',policyInfo:'Cancellation not available.'}]}},'DXB-DEL':{tfr:{DATECHANGE:[{pp:'DEFAULT',policyInfo:'Changes subject to availability.'}]}}}};
 const routes=flightFareRuleRoutes(publicSupplierPolicy(raw));
 assert.equal(flightRuleWindow(routes[0].policy.tfr!.CANCELLATION![1]),'After departure');
 assert.equal(hasFlightCancellationRules(raw),false,'Date-change availability must not imply cancellation availability on the return');
 assert.equal(flightFareRuleTerms(raw).find(row=>row.key==='fareRules.DXB-DEL.CANCELLATION')?.value,null);
});

test('public policy projects only documented fields at every nested level',()=>{
 const raw={fareRule:{'BOM-DEL':{supplierToken:'PRIVATE_ROUTE',tfr:{CANCELLATION:[{...timedRule(),supplierToken:'PRIVATE_ROW',fcs:{...timedRule().fcs,NF:987654321,apikey:'PRIVATE_FEE'}}],supplierToken:'PRIVATE_TYPE'}},supplierToken:'PRIVATE_ROOT'},apikey:'PRIVATE_ENVELOPE',bookingId:'PRIVATE_BOOKING',fC:{NF:987654321}};
 const safe=publicSupplierPolicy(raw);
 assert.ok(hasFlightCancellationRules(safe));
 assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|987654321|supplierToken|apikey|bookingId|"NF"/);
 assert.equal(publicSupplierPolicy({status:{success:true},fareRule:{secret:'PRIVATE'}}),null);
});

test('invalid bands invalidate the whole category, retaining a visible unavailable route',()=>{
 for(const malformed of [{...timedRule(),st:'bad'},{...timedRule(),et:9000},{...timedRule(),st:40,et:20},{...timedRule(),pp:'BEFORE_DEPARTURE'},{...timedRule(),amount:NaN},{...timedRule(),policyInfo:'a'.repeat(2001)},{st:0,et:12}]){
  const raw={fareRule:{'BOM-DEL':{tfr:{CANCELLATION:[timedRule(),malformed]}}}};
  const safe=publicSupplierPolicy(raw);
  assert.equal(hasFlightCancellationRules(safe),false);
  assert.equal(flightFareRuleRoutes(safe)[0].policy.tfr,undefined);
  assert.equal(flightFareRuleTerms(safe)[0].value,null);
 }
 assert.equal(hasFlightCancellationRules({fareRule:{'BOM-DEL':{tfr:{CANCELLATION:Array.from({length:41},timedRule)}}}}),false);
});

test('detailed route notes preserve complete clauses beyond 2000 characters and legacy fixtures still work',()=>{
 const note='Detailed conditions apply. '.repeat(110)+'The remaining ticket is not refundable.';
 const raw={fareRule:{'DEL-KWI':{miscInfo:[note,'All passengers must follow the listed conditions.'],fareRuleInfo:{token:'PRIVATE'}}}};
 const safe=publicSupplierPolicy(raw);
 assert.deepEqual(flightFareRuleRoutes(safe)[0].policy.miscInfo,[note,'All passengers must follow the listed conditions.']);
 assert.equal(hasFlightCancellationRules(safe),false,'Full text does not automatically establish cancellation availability');
 assert.deepEqual(publicSupplierPolicy({fareRule:{miscInfo:'Legacy policy note.'}}),{fareRule:{miscInfo:'Legacy policy note.'}});
 assert.equal(flightFareRuleRoutes({fareRule:{'DEL-KWI':{miscInfo:['Valid note',42]}}})[0].policy.miscInfo,undefined);
});

test('refresh compares fees, taxes, time bands and text but ignores route, category and band ordering',()=>{
 const first={fareRule:{'BOM-DEL':{tfr:{CANCELLATION:[timedRule(),{...timedRule(),st:12,et:48}]}},'DEL-BOM':{tfr:{NO_SHOW:[{pp:'AFTER_DEPARTURE',policyInfo:'No refund.'}]}}}};
 const same={fareRule:{'DEL-BOM':first.fareRule['DEL-BOM'],'BOM-DEL':{tfr:{CANCELLATION:[{...timedRule(),st:'12',et:'48'},{...timedRule(),et:8760,st:0}]}}},bookingId:'new-private-reference'};
 assert.deepEqual(compareReviewedTerms(flightFareRuleTerms(first),flightFareRuleTerms(same)),[]);
 for(const change of [{amount:4000},{fcs:{ACF:3675,ACFT:200,CCF:50,CCFT:9}},{policyInfo:'Cancellation not available.'},{st:24,et:8760}]){
  const changed=sample();Object.assign(changed.fareRule['BOM-DEL'].tfr.CANCELLATION[0],change);
  const diffs=compareReviewedTerms(flightFareRuleTerms(sample()),flightFareRuleTerms(changed));
  assert.equal(diffs.length,1);assert.match(diffs[0].label,/BOM → DEL · Cancellation/);
 }
 const disappeared=compareReviewedTerms(flightFareRuleTerms(sample()),flightFareRuleTerms({fareRule:{'BOM-DEL':{tfr:{}}}}));
 assert.ok(disappeared.some(row=>row.key.endsWith('CANCELLATION')&&row.after==='Not supplied or not comparable'));
});

test('rendered fare rules are readable, escaped and never invent free cancellation or currency',async()=>{
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {default:SupplierPolicy}=await import('../src/components/supplier-policy');
 const raw=sample();raw.fareRule['BOM-DEL'].tfr.CANCELLATION[0].policyInfo='<script>unsafe()</script> Cancellation has a fee.';
 const html=renderToStaticMarkup(createElement(SupplierPolicy,{title:'Cancellation and fare rules',value:publicSupplierReview('FLIGHT',{fareRules:raw}).fareRules}));
 assert.match(html,/BOM → DEL/);assert.match(html,/0–8760 hours before departure/);assert.match(html,/3,675/);assert.match(html,/Date changes/);assert.match(html,/No-show/);
 assert.match(html,/Currency and whether fees apply per person/);assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>|₹|Refundable|Free cancellation|\[object Object\]|>Tfr</);
 const unavailable=renderToStaticMarkup(createElement(SupplierPolicy,{title:'Cancellation and fare rules',value:{fareRule:{'BOM-DEL':{tfr:{DATECHANGE:[{policyInfo:'Changes permitted.'}]}}}}}));
 assert.match(unavailable,/Cancellation charges are unavailable for this route/);
 const zero=renderToStaticMarkup(createElement(SupplierPolicy,{title:'Fare conditions',value:{fareRule:{'BOM-DEL':{tfr:{CANCELLATION:[{amount:0,pp:'DEFAULT'}]}}}}}));
 assert.doesNotMatch(zero,/Free cancellation|Refundable/);
});

test('fee-breakdown-only comparison retains the missing currency/basis qualification',()=>{
 const rows=flightFareRuleTerms({fareRule:{'BOM-DEL':{tfr:{CANCELLATION:[{fcs:{ACF:20},pp:'BEFORE_DEPARTURE'}]}}}});
 assert.match(rows[0].display!,/Airline cancellation fee 20/);assert.match(rows[0].display!,/Currency and per-person basis not supplied/);
});

test('small positive supplier fees stay positive in checkout instead of rounding to zero',async()=>{
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {default:SupplierPolicy}=await import('../src/components/supplier-policy');
 const value={fareRule:{'BOM-DEL':{tfr:{CANCELLATION:[{amount:0.0000001,additionalFee:0.00000001,pp:'BEFORE_DEPARTURE'}]}}}};
 const html=renderToStaticMarkup(createElement(SupplierPolicy,{title:'Fare conditions',value}));
 assert.match(html,/Airline fee<\/dt><dd>0\.0000001<\/dd>/);
 assert.match(html,/Supplier fee<\/dt><dd>0\.00000001<\/dd>/);
 assert.doesNotMatch(html,/<dd>0<\/dd>|Free cancellation/);
});
