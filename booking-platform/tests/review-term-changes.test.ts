import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareReviewedTerms} from '../src/lib/review-term-changes';
import {reviewedTerms} from '../src/lib/reviewed-terms';
const hotel=(refund=true,meal='BREAKFAST')=>({option:{roomInfo:[{name:'Double'}],mealBasis:meal,inclusions:['Wifi','Breakfast'],cancellation:{isRefundable:refund,penalties:[{from:'2027-01-01T00:00:00',to:'2027-01-02T00:00:00',amount:0}]}}});
const trip=(from:string,to:string,refund=1,bags='15 Kg')=>({sI:[{da:{code:from},aa:{code:to},dt:'2027-01-01T10:00:00'}],totalPriceList:[{fd:{ADULT:{rT:refund,bI:{iB:bags,cB:'7 Kg'},fC:{NF:999}}}}]});
test('same-price stricter hotel terms show before and after, not an inferred price change',()=>{
 const rows=compareReviewedTerms(reviewedTerms('HOTEL',hotel()),reviewedTerms('HOTEL',hotel(false,'ROOM_ONLY')));
 assert.equal(rows.length,2);assert.equal(rows[0].before,'BREAKFAST');assert.equal(rows[0].after,'ROOM ONLY');assert.equal(rows[1].after,'Non-refundable');
});
test('unchanged normalized terms ignore object order, inclusions order, transient IDs and pricing',()=>{
 const a=hotel(),b={...hotel(),bookingId:'new',expiresAt:'new',option:{...hotel().option,inclusions:['Breakfast','Wifi'],pricing:{totalPrice:999}}};
 assert.deepEqual(compareReviewedTerms(reviewedTerms('HOTEL',a),reviewedTerms('HOTEL',b)),[]);
});
test('price-only changes do not fabricate changed terms',()=>{
 assert.deepEqual(compareReviewedTerms(reviewedTerms('FLIGHT',{tripInfos:[trip('DEL','BOM')],totalPriceInfo:{TF:100}}),reviewedTerms('FLIGHT',{tripInfos:[trip('DEL','BOM')],totalPriceInfo:{TF:200}})),[]);
});
test('missing or malformed terms are unknown, never none or non-refundable',()=>{
 const before=reviewedTerms('HOTEL',hotel()),after=reviewedTerms('HOTEL',{}),rows=compareReviewedTerms(before,after);
 assert.ok(rows.every(row=>row.after==='Not supplied or not comparable'));
 assert.deepEqual(compareReviewedTerms(undefined,undefined),[]);
 assert.equal(reviewedTerms('HOTEL',{option:{cancellation:{isRefundable:'false',penalties:[]}}}).find(row=>row.key==='refund')?.value,null);
});
test('return-flight baggage and refund differences are identified without search data',()=>{
 const a={tripInfos:[trip('DEL','BOM'),trip('BOM','DEL')]},b={tripInfos:[trip('DEL','BOM'),trip('BOM','DEL',0,'No allowance')]};
 const rows=compareReviewedTerms(reviewedTerms('FLIGHT',a),reviewedTerms('FLIGHT',b));
 assert.equal(rows.length,2);assert.ok(rows.every(row=>row.label.includes('BOM → DEL')));assert.equal(rows[1].after,'No allowance');
 assert.equal(JSON.stringify(reviewedTerms('FLIGHT',a)).includes('999'),false);
});
test('fare-rule notes compared as supplied text, not raw response metadata',()=>{
 const old=reviewedTerms('FLIGHT',{fareRules:{fareRule:{miscInfo:'Cancellation permitted'},status:{success:true}}});
 const latest=reviewedTerms('FLIGHT',{fareRules:{fareRule:{miscInfo:'Cancellation not permitted'},status:{success:true}}});
 assert.equal(compareReviewedTerms(old,latest)[0].after,'Cancellation not permitted');
});
test('canonical cancellation schedule ignores ordering and equivalent offset formats',()=>{
 const a=hotel(),b=hotel();b.option.cancellation.penalties=[{from:'2026-12-31T18:30:00Z',to:'2027-01-01T18:30:00Z',amount:0}];
 assert.deepEqual(compareReviewedTerms(reviewedTerms('HOTEL',a),reviewedTerms('HOTEL',b)),[]);
 b.option.cancellation.penalties[0].amount=100;
 assert.match(compareReviewedTerms(reviewedTerms('HOTEL',a),reviewedTerms('HOTEL',b))[0].after,/currency, units and basis unverified/);
});

const firstReview=Date.parse('2026-11-16T01:07:30+05:30'),nextReview=Date.parse('2026-11-16T01:09:30+05:30');
function rollingHotel(start='2026-11-16T01:07:00'){
 return {option:{...hotel().option,cancellation:{isRefundable:true,penalties:[
  {from:start,to:'2026-11-21T05:59:00',amount:0},
  {from:'2026-11-21T05:59:00',to:'2026-11-23T00:00:00',amount:2033.53},
 ]}}};
}
const hotelTerms=(source:unknown,observedAt=firstReview)=>reviewedTerms('HOTEL',source,observedAt);
test('rolling origin in a currently active free hotel window does not invent a terms change',()=>{
 const before=hotelTerms(rollingHotel()),after=hotelTerms(rollingHotel('2026-11-16T01:09:00'),nextReview);
 assert.deepEqual(compareReviewedTerms(before,after),[]);
 // Original dates remain available in the full policy; only equality is semantic.
 assert.match(before.find(row=>row.key==='cancellation')!.display!,/01:07 am/);
 assert.match(after.find(row=>row.key==='cancellation')!.display!,/01:09 am/);
 assert.equal(after.find(row=>row.key==='cancellation')?.hotelCancellation?.observedAt,nextReview);
});

test('rolling hotel origin never hides changed charges, future boundaries or expired windows',()=>{
 const before=hotelTerms(rollingHotel());
 for(const change of [
  (value:ReturnType<typeof rollingHotel>)=>{value.option.cancellation.penalties[0].amount=1;},
  (value:ReturnType<typeof rollingHotel>)=>{value.option.cancellation.penalties[1].amount=2034;},
  (value:ReturnType<typeof rollingHotel>)=>{value.option.cancellation.penalties[0].to='2026-11-21T05:58:59.999';value.option.cancellation.penalties[1].from='2026-11-21T05:58:59.999';},
  (value:ReturnType<typeof rollingHotel>)=>{value.option.cancellation.penalties[1].to='2026-11-22T23:59:59';},
  (value:ReturnType<typeof rollingHotel>)=>{value.option.cancellation.penalties[1].from='2026-11-21T06:00:00';},
 ]){
  const after=rollingHotel('2026-11-16T01:09:00');change(after);
  assert.ok(compareReviewedTerms(before,hotelTerms(after,nextReview)).some(row=>row.key==='cancellation'));
 }
 for(const observedAt of [Date.parse('2026-11-21T05:59:00+05:30'),Date.parse('2026-11-23T00:00:00+05:30')]){
  assert.equal(compareReviewedTerms(before,hotelTerms(rollingHotel('2026-11-16T01:09:00'),observedAt)).length,1);
 }
});

test('future, backward or unknown hotel window origins retain exact comparison',()=>{
 const before=hotelTerms(rollingHotel());
 for(const [start,observedAt] of [
  ['2026-11-16T01:10:00',nextReview],
  ['2026-11-16T01:06:00',nextReview],
  ['2026-11-16T01:09:00',NaN],
  ['2026-11-16T01:09:00',Infinity],
  ['2026-11-16T01:09:00',firstReview-1],
 ] as const){
  assert.equal(compareReviewedTerms(before,hotelTerms(rollingHotel(start),observedAt)).length,1);
 }
 const initiallyFuture=hotelTerms(rollingHotel(),firstReview-60_000);
 assert.equal(compareReviewedTerms(initiallyFuture,hotelTerms(rollingHotel('2026-11-16T01:09:00'),nextReview)).length,1);
 const withoutCapture=before.map(term=>{const plain={...term};delete plain.hotelCancellation;return plain;});
 assert.equal(compareReviewedTerms(withoutCapture,hotelTerms(rollingHotel('2026-11-16T01:09:00'),nextReview)).length,1);
});

test('rolling origin with missing or changed refundability and incomplete schedules stays visible',()=>{
 const before=hotelTerms(rollingHotel());
 for(const isRefundable of [false,undefined,'true']){
  const option=rollingHotel('2026-11-16T01:09:00').option;
  const after=hotelTerms({option:{...option,cancellation:{...option.cancellation,isRefundable}}},nextReview);
  const changes=compareReviewedTerms(before,after);
  assert.ok(changes.some(row=>row.key==='refund'));assert.ok(changes.some(row=>row.key==='cancellation'));
 }
 for(const boundary of ['2026-11-21T06:00:00','2026-11-21T05:58:00','2026-02-30T00:00:00','not supplied']){
  const old=rollingHotel(),latest=rollingHotel('2026-11-16T01:09:00');
  old.option.cancellation.penalties[1].from=boundary;latest.option.cancellation.penalties[1].from=boundary;
  const previous=hotelTerms(old),next=hotelTerms(latest,nextReview);
  if(previous.find(row=>row.key==='cancellation')?.value===null){
   assert.equal(next.find(row=>row.key==='cancellation')?.value,null,'Malformed schedules stay unknown');
   assert.ok(compareReviewedTerms(before,next).some(row=>row.key==='cancellation'));
  }else assert.equal(compareReviewedTerms(previous,next).length,1,'Gaps/overlaps cannot support semantic equality');
 }
});

test('cancellation comparison rejects stale or malformed metadata instead of masking exact changes',()=>{
 const before=hotelTerms(rollingHotel()),latest=hotelTerms(rollingHotel('2026-11-16T01:09:00'),nextReview);
 const term=latest.find(row=>row.key==='cancellation')!;
 for(const data of [null,{...term.hotelCancellation,windows:[null]},{...term.hotelCancellation,windows:Array(41).fill(term.hotelCancellation!.windows[0])},{...term.hotelCancellation,observedAt:'2026-11-16'}]){
  const after=latest.map(row=>row.key==='cancellation'?{...row,hotelCancellation:data}:row) as typeof latest;
  assert.equal(compareReviewedTerms(before,after).length,1);
 }
 assert.equal(compareReviewedTerms(before,latest.map(row=>row.key==='cancellation'?{...row,value:row.value+'; additional supplied restriction'}:row)).length,1);
});

test('unchanged hotel refresh is neutral while full prior/latest policies remain available',async()=>{
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {default:RefreshedTerms}=await import('../src/components/refreshed-terms');
 const before={totalMinor:203353,review:{terms:hotelTerms(rollingHotel()),option:rollingHotel().option}};
 const after={totalMinor:203353,review:{terms:hotelTerms(rollingHotel('2026-11-16T01:09:00'),nextReview),option:rollingHotel('2026-11-16T01:09:00').option}};
 const html=renderToStaticMarkup(createElement(RefreshedTerms,{before,after}));
 assert.match(html,/refreshed-terms--unchanged/);assert.match(html,/No differences detected in the comparable details/);
 assert.doesNotMatch(html,/Same price does not mean same terms|Previously:|Now:/);
 assert.match(html,/Previous supplier policy/);assert.match(html,/Latest supplier policy/);
 assert.match(html,/2026-11-16T01:07:00/);assert.match(html,/2026-11-16T01:09:00/);
 assert.match(html,/Some terms could not be compared/);
});
test('normalization is bounded and never includes private fare fields',()=>{
 const rows=reviewedTerms('FLIGHT',{tripInfos:Array.from({length:1000},()=>trip('DEL','BOM'))});assert.ok(rows.length<=120);
 assert.equal(rows.some(row=>row.label.includes('Journey 13')),false);
});
test('refresh disclosure remains accessible and retains the comparison and private draft boundary',()=>{
 const ui=readFileSync(new URL('../src/components/refreshed-terms.tsx',import.meta.url),'utf8');
 assert.match(ui,/role="status"/);assert.match(ui,/aria-labelledby="refreshed-terms-title"/);assert.match(ui,/Previously:/);assert.match(ui,/Now:/);assert.match(ui,/Total unchanged/);assert.match(ui,/No differences detected in the comparable details/);
 const checkout=readFileSync(new URL('../src/components/live-booking.tsx',import.meta.url),'utf8');
 assert.match(checkout,/setPreviousReview\(renew\?quote:null\)/);assert.match(checkout,/previousReview&&<RefreshedTerms/);assert.match(checkout,/entry\[0\]!=='consent'/);
});

test('rendered disclosure distinguishes same price, price change and unknown policy',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {default:RefreshedTerms}=await import('../src/components/refreshed-terms');
 const before={totalMinor:10000,review:{terms:reviewedTerms('HOTEL',hotel())}};
 const after={totalMinor:10000,review:{terms:reviewedTerms('HOTEL',hotel(false))}};
 const html=renderToStaticMarkup(createElement(RefreshedTerms,{before,after}));
 assert.match(html,/Total unchanged/);assert.match(html,/Previously:/);assert.match(html,/Non-refundable/);assert.match(html,/role="status"/);
 assert.match(renderToStaticMarkup(createElement(RefreshedTerms,{before,after:{...after,totalMinor:12000}})),/Total changed from/);
 assert.match(renderToStaticMarkup(createElement(RefreshedTerms,{before,after:{totalMinor:10000,review:{}}})),/Not supplied or not comparable/);
});
test('ambiguous or malformed fare aliases cannot break the quote or invent benefits',()=>{
 for(const price of [null,{fd:{ADULT:{rT:1}},fD:{ADULT:{rT:0}}}]){
  const rows=reviewedTerms('FLIGHT',{tripInfos:[{totalPriceList:[price]}]});
  assert.equal(rows.some(row=>row.key.includes('.refund')),false);
 }
});

test('malformed or oversized room/inclusion lists become wholly unknown, not partial equality',()=>{
 const valid=hotel();
 for(const roomInfo of [[{name:'Double'},{name:42}],Array.from({length:5},()=>({name:'Double'})),[{name:'a'.repeat(2001)}]]){
  assert.equal(reviewedTerms('HOTEL',{option:{...valid.option,roomInfo}}).find(row=>row.key==='room')?.value,null);
 }
 for(const inclusions of [['Breakfast',{name:'Not included'}],Array.from({length:41},()=> 'Breakfast'),['a'.repeat(2001)]]){
  assert.equal(reviewedTerms('HOTEL',{option:{...valid.option,inclusions}}).find(row=>row.key==='inclusions')?.value,null);
 }
 const a=reviewedTerms('HOTEL',{option:{inclusions:['a'.repeat(500)+'first']}}),b=reviewedTerms('HOTEL',{option:{inclusions:['a'.repeat(500)+'different']}});
 assert.equal(compareReviewedTerms(a,b).length,1);
});
test('journey reordering preserves identity; ambiguous duplicates and missing departures are unknown',()=>{
 const outward=trip('DEL','BOM',1,'15 Kg'),back=trip('BOM','DEL',0,'20 Kg');
 assert.deepEqual(compareReviewedTerms(reviewedTerms('FLIGHT',{tripInfos:[outward,back]}),reviewedTerms('FLIGHT',{tripInfos:[back,outward]})),[]);
 for(const tripInfos of [[outward,outward],[{...outward,sI:[{da:{code:'DEL'},aa:{code:'BOM'}}]}]]){
  assert.equal(reviewedTerms('FLIGHT',{tripInfos}).some(row=>row.key.startsWith('trip.')),false);
 }
});
test('public policy projection and refreshed/current policy rendering never expose arbitrary supplier data',async()=>{
 const {publicSupplierPolicy,publicSupplierAlerts}=await import('../src/lib/public-supplier-policy');
 const raw={fareRule:{miscInfo:'Known policy',supplierAuthToken:'NESTED_PRIVATE_TOKEN'},supplierAuthToken:'SYNTHETIC_PRIVATE_TOKEN',fC:{NF:987654}};
 assert.deepEqual(publicSupplierPolicy(raw),{fareRule:{miscInfo:'Known policy'}});
 assert.equal(publicSupplierPolicy({unsupportedRule:'private'}),null);
 assert.equal(publicSupplierPolicy('a'.repeat(2001)),null);
 assert.equal(publicSupplierAlerts([{message:'unknown',supplierAuthToken:'secret'}]),null);
 const hotelPolicy=publicSupplierPolicy({...hotel().option.cancellation,supplierAuthToken:'secret',fC:{NF:987654}});
 assert.equal(JSON.stringify(hotelPolicy).includes('secret'),false);assert.equal(JSON.stringify(hotelPolicy).includes('987654'),false);
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {default:RefreshedTerms}=await import('../src/components/refreshed-terms'),{default:SupplierPolicy}=await import('../src/components/supplier-policy');
 const quote={totalMinor:100,review:{fareRules:raw}};
 for(const html of [renderToStaticMarkup(createElement(RefreshedTerms,{before:quote,after:quote})),renderToStaticMarkup(createElement(SupplierPolicy,{title:'Current policy',value:raw}))]){
  assert.match(html,/Known policy/);assert.doesNotMatch(html,/PRIVATE_TOKEN|987654|Supplier Auth Token/);assert.match(html,/Other terms may be unavailable/);
 }
 const boundary=readFileSync(new URL('../src/lib/supplier-flow.ts',import.meta.url),'utf8');
 assert.match(boundary,/review:publicSupplierReview\(product,data\)/);
 const projection=readFileSync(new URL('../src/lib/public-supplier-review.ts',import.meta.url),'utf8');
 assert.match(projection,/fareRules:publicSupplierPolicy\(data.fareRules\)/);assert.match(projection,/cancellation:publicSupplierPolicy\(option.cancellation\)/);
});

test('existing scalar hotel policy text remains supported without admitting nested supplier fields',async()=>{
 const {publicSupplierPolicy}=await import('../src/lib/public-supplier-policy');
 const policy='Cancellation charges apply after the displayed deadline.';
 const safe=publicSupplierPolicy({policy,supplierAuthToken:'SYNTHETIC_PRIVATE_TOKEN',fC:{NF:987654321}});
 assert.deepEqual(safe,{policy});
 assert.equal(publicSupplierPolicy({policy:{text:policy,supplierAuthToken:'SYNTHETIC_PRIVATE_TOKEN'}}),null);
 assert.equal(publicSupplierPolicy({policy:'a'.repeat(2001)}),null);
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {default:Timeline}=await import('../src/components/hotel-cancellation-timeline');
 const html=renderToStaticMarkup(createElement(Timeline,{value:{policy,supplierAuthToken:'SYNTHETIC_PRIVATE_TOKEN',fC:{NF:987654321}}}));
 assert.match(html,/Supported supplier policy details/);assert.ok(html.includes(policy));assert.match(html,/cannot confirm the cancellation schedule/);
 assert.doesNotMatch(html,/SYNTHETIC_PRIVATE_TOKEN|987654321|₹/);
});

test('supported policy disclosure retains raw dates and amounts without inventing currency or units',async()=>{
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {default:Timeline}=await import('../src/components/hotel-cancellation-timeline');
 for(const amount of [1000,2407.09]){
  const html=renderToStaticMarkup(createElement(Timeline,{value:{isRefundable:true,penalties:[{from:'2026-10-21T00:00:00',to:'2026-10-22T00:00:00',amount}]}}));
  assert.match(html,/2026-10-21T00:00:00/);assert.ok(html.includes(String(amount)));assert.match(html,/currency, units or calculation basis/);assert.doesNotMatch(html,/₹/);
  const timeline=html.slice(html.indexOf('<ol'),html.indexOf('</ol>'));
  assert.ok(!timeline.includes(String(amount)),'Readable timeline must not imply a numeric charge without verified units');
 }
});

test('cancellation comparison displays readable IST dates while canonical equality remains stable',async()=>{
 const before=hotel(),after=hotel();after.option.cancellation.penalties[0].amount=100;
 const old=reviewedTerms('HOTEL',before),next=reviewedTerms('HOTEL',after),change=compareReviewedTerms(old,next)[0];
 assert.match(change.after,/1 Jan 2027, 12:00 am IST → 2 Jan 2027, 12:00 am IST/);
 assert.match(change.after,/Supplier amount 100 \(currency, units and basis unverified\)/);assert.doesNotMatch(change.after,/T18:30:00|₹/);
 const term=next.find(row=>row.key==='cancellation')!;assert.match(term.value!,/2026-12-31T18:30:00.000Z/);
 assert.deepEqual(compareReviewedTerms(next,next.map(row=>({...row,display:'Different display formatting only'}))),[]);
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {default:RefreshedTerms}=await import('../src/components/refreshed-terms');
 const html=renderToStaticMarkup(createElement(RefreshedTerms,{before:{totalMinor:100,review:{terms:old}},after:{totalMinor:100,review:{terms:next}}}));
 assert.match(html,/1 Jan 2027, 12:00 am IST/);assert.doesNotMatch(html,/2026-12-31T18:30:00.000Z/);
 assert.match(html,/Same price does not mean same terms/);assert.match(html,/id="refreshed-terms-title" tabindex="-1"/);
 assert.ok(html.indexOf('This comparison does not cover every supplier rule')>html.indexOf('<details>'),'Longer coverage explanation stays in disclosure');
});

test('readable hotel policy boundaries preserve nonzero seconds and milliseconds',async()=>{
 const {hotelPolicyDateTime}=await import('../src/lib/hotel-cancellation-timeline');
 assert.match(hotelPolicyDateTime(Date.parse('2027-01-01T00:00:12.345+05:30')),/12:00:12\.345 am/);
});


test('nonrefundable active window origin may advance but amounts and refundability remain exact',()=>{
 const before=rollingHotel(),after=rollingHotel('2026-11-16T01:09:00');
 for(const value of [before,after]){value.option.cancellation.isRefundable=false;value.option.cancellation.penalties[0].amount=2033;}
 assert.deepEqual(compareReviewedTerms(hotelTerms(before),hotelTerms(after,nextReview)),[]);
 after.option.cancellation.penalties[0].amount=2034;
 assert.ok(compareReviewedTerms(hotelTerms(before),hotelTerms(after,nextReview)).some(row=>row.key==='cancellation'));
});
