import type {Page} from '@playwright/test';
import {publicSupplierReview} from '../../src/lib/public-supplier-review';
import {test,expect,capture,departure,returning,flight,flightResults,openFlightSearch,reviewedQuote,searchId,expectNoHorizontalOverflow,type ProviderFixture} from './fixtures';

const renewedId='44444444-4444-4444-8444-444444444444';
const form=(page:Page)=>page.getByRole('form',{name:'Review and travellers'});
function supplierRules(amount=3675,missingReturnCancellation=false){
 return {fareRule:{
  'BOM-DEL':{tfr:{
   CANCELLATION:[{st:'0',et:'8760',amount,additionalFee:50,policyInfo:'Cancellation fee applies, limited to the base fare.',fcs:{ACF:amount,ACFT:183.75,CCF:50,CCFT:9},supplierToken:'PRIVATE_POLICY_MARKER'}],
   DATECHANGE:[{st:'0',et:'8760',amount:3150,policyInfo:'Fare difference also applies.'}],
   NO_SHOW:[{st:'0',et:'8760',policyInfo:'No refund for no-show.'}],
  }},
  'DEL-BOM':{tfr:{
   ...(!missingReturnCancellation?{CANCELLATION:[{pp:'BEFORE_DEPARTURE',amount:4200,policyInfo:'Cancellation has a fee.'},{pp:'AFTER_DEPARTURE',policyInfo:'Cancellation not available.'}]}:{}),
   DATECHANGE:[{pp:'DEFAULT',policyInfo:'Changes depend on availability.'}],
  }},
 },bookingId:'PRIVATE_BOOKING_MARKER',status:{success:true}};
}
function quote(amount=3675,missingReturnCancellation=false,id?:string){
 return reviewedQuote({...(id?{quoteId:id}:{}),totalMinor:1308000,
  summary:{from:'BOM',to:'DEL',date:departure,returnDate:returning,adults:1,children:0,infants:0},
  review:publicSupplierReview('FLIGHT',{conditions:{},tripInfos:[flight(),flight('RETURN')],fareRules:supplierRules(amount,missingReturnCancellation)}),
 });
}
async function selectFare(page:Page,label:string){
 const comparison=page.locator('.flight-shopping-list .fare-comparison').first();
 if(await comparison.getAttribute('open')===null)await comparison.locator(':scope > summary').click();
 await page.getByRole('button',{name:label,exact:true}).first().click();
}
async function reviewRoundTrip(page:Page,provider:ProviderFixture){
 provider.search=flightResults(true);
 await openFlightSearch(page,{roundTrip:true});
 await selectFare(page,'Choose this outbound fare');await selectFare(page,'Choose this return fare');
 await page.getByRole('button',{name:/Review selected journey \(2\/2\)/}).click();
 await expect(form(page)).toBeVisible();
 await form(page).getByLabel('First name',{exact:true}).fill('Aarav');await form(page).getByLabel('Last name',{exact:true}).fill('Example');
 await form(page).getByLabel('Email',{exact:true}).fill('traveller@example.test');await form(page).getByLabel('Indian mobile number',{exact:true}).fill('9876543210');
 await expect(page.locator('#booking-summary').getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 await expect(page.locator('.final-traveller-summary')).toContainText('traveller@example.test');
}
async function showConditions(page:Page){
 const details=page.locator('.review-conditions');
 if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();
 return page.getByRole('region',{name:'Cancellation and fare rules',exact:true});
}

test('one-way review after switching from round trip shows only the departure and its fare rules',async({page,provider})=>{
 const criteria={from:'BOM',to:'DEL',date:departure,adults:1};
 provider.quote=reviewedQuote({summary:criteria,
  review:publicSupplierReview('FLIGHT',{conditions:{},tripInfos:[flight(),flight('RETURN')],fareRules:supplierRules()},
   {criteria,selectedTrips:[flight()]})});
 await openFlightSearch(page,{auto:false,roundTrip:true});
 await expect(page.getByLabel('Return date',{exact:true})).toHaveValue(returning);
 await page.getByRole('combobox',{name:'Journey type'}).selectOption('one-way');
 await expect(page.getByLabel('Return date',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 await selectFare(page,'Check fare & continue');
 await expect(form(page)).toBeVisible();
 const receipt=page.getByRole('region',{name:'Selected itinerary',exact:true});
 await expect(receipt.getByText('One way',{exact:true})).toBeVisible();
 await expect(receipt.locator('.review-flights li')).toHaveCount(1);
 await expect(receipt).not.toContainText('DEL → BOM');
 const policy=await showConditions(page);
 await expect(policy.getByRole('heading',{name:'BOM → DEL',exact:true})).toBeVisible();
 await expect(policy.getByRole('heading',{name:'DEL → BOM',exact:true})).toHaveCount(0);
 expect(provider.requests('/api/travel/search')[0].body).not.toHaveProperty('returnDate');
 expect(provider.requests('/api/travel/review')[0].body).toMatchObject({priceIds:['onward-standard']});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await expectNoHorizontalOverflow(page);
});

test('overnight one-way flights group the Goa connection and next-day Delhi arrival',async({page,provider},testInfo)=>{
 const nextDay=new Date(Date.parse(departure)+86_400_000).toISOString().slice(0,10);
 const selection=flight();
 const [direct]=selection.sI;
 const goa={code:'GOI',city:'Goa'};
 selection.sI=[
  {...direct,aa:goa,dt:`${departure}T17:45:00`,at:`${departure}T19:10:00`,duration:85,
   fD:{aI:{name:'Air India Express',code:'IX'},fN:'1519'}},
  {...direct,id:'synthetic-connection',da:goa,dt:`${departure}T22:00:00`,at:`${nextDay}T00:35:00`,duration:155,
   fD:{aI:{name:'Air India Express',code:'IX'},fN:'2224'}},
 ];
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[selection]}}}};
 await openFlightSearch(page);
 await selectFare(page,'Check fare & continue');
 const itinerary=page.getByRole('region',{name:'Selected itinerary'});
 await expect(itinerary.getByRole('heading',{name:'BOM → DEL',exact:true})).toBeVisible();
 await expect(itinerary.locator('.review-flight-leg')).toHaveCount(1);
 await expect(itinerary.getByText('1 stop via Goa (GOI) · 6h 50m total')).toBeVisible();
 await expect(itinerary.locator('.review-flight-connection')).toContainText('Connection at GOI · 2h 50m');
 await expect(itinerary.getByText('Next-day arrival',{exact:true})).toBeVisible();
 await expect(itinerary.getByText('Return',{exact:true})).toHaveCount(0);
 await expect(itinerary.locator('.review-flights li')).toHaveCount(2);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await expectNoHorizontalOverflow(page);
 await capture(page,testInfo,'overnight-one-way-review');
});

test('review shows official-shaped cancellation rules for both routes with readable fee disclosures',async({page,provider},testInfo)=>{
 provider.quote=quote();await reviewRoundTrip(page,provider);const policy=await showConditions(page);
 await expect(page.getByRole('region',{name:'Selected itinerary',exact:true}).getByText('Round trip',{exact:true})).toBeVisible();
 const outbound=policy.locator('.flight-policy-route').filter({has:page.getByRole('heading',{name:'BOM → DEL',exact:true})});
 const inbound=policy.locator('.flight-policy-route').filter({has:page.getByRole('heading',{name:'DEL → BOM',exact:true})});
 await expect(outbound).toBeVisible();await expect(inbound).toBeVisible();
 await expect(outbound).toContainText('0–8760 hours before departure');await expect(outbound).toContainText('3,675');await expect(outbound).toContainText('Supplier fee');
 await expect(inbound).toContainText('Before departure');await expect(inbound).toContainText('4,200');await expect(inbound).toContainText('After departure');await expect(inbound).toContainText('Cancellation not available.');
 await outbound.getByText('Supplied fee breakdown',{exact:true}).click();await expect(outbound).toContainText('Tax on airline cancellation fee');await expect(outbound).toContainText('183.75');
 await outbound.getByText('Date changes',{exact:true}).click();await expect(outbound.getByText('Fare difference also applies.',{exact:true})).toBeVisible();
 await outbound.getByText('No-show',{exact:true}).click();await expect(outbound.getByText('No refund for no-show.',{exact:true})).toBeVisible();
 await expect(policy).not.toContainText('Cancellation charges are unavailable');await expect(policy).not.toContainText('PRIVATE_');await expect(policy).not.toContainText('[object Object]');
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'flight-reviewed-cancellation-rules');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('a return route with date-change rules alone keeps its cancellation warning visible',async({page,provider},testInfo)=>{
 provider.quote=quote(3675,true);await reviewRoundTrip(page,provider);
 await expect(page.locator('.review-conditions')).toHaveAttribute('open','');
 const policy=page.getByRole('region',{name:'Cancellation and fare rules',exact:true});
 const inbound=policy.locator('.flight-policy-route').filter({has:page.getByRole('heading',{name:'DEL → BOM',exact:true})});
 await expect(inbound.getByText(/Cancellation charges are unavailable for this route/)).toBeVisible();
 await expect(inbound).toContainText('Do not assume this fare is refundable.');
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'flight-missing-return-cancellation');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('same-price cancellation fee refresh shows the changed route and preserves traveller details',async({page,provider},testInfo)=>{
 provider.quote=quote();await reviewRoundTrip(page,provider);provider.quote=quote(4000,false,renewedId);
 await page.getByRole('button',{name:'Refresh reviewed price',exact:true}).click();
 const disclosure=page.getByRole('region',{name:'Review the refreshed terms',exact:true});
 await expect(disclosure.getByRole('status')).toContainText('Total unchanged. 1 reviewed detail has changed');
 const changed=disclosure.locator(':scope > dl > .policy-row');await expect(changed).toHaveCount(1);
 await expect(changed).toContainText('BOM → DEL · Cancellation');await expect(changed).toContainText('Previously:');await expect(changed).toContainText('Airline fee 3675');await expect(changed).toContainText('Now:');await expect(changed).toContainText('Airline fee 4000');
 await expect(form(page).getByLabel('First name',{exact:true})).toHaveValue('Aarav');
 await expect(form(page).getByLabel('Email',{exact:true})).toHaveValue('traveller@example.test');
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'flight-refreshed-cancellation-fee');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
