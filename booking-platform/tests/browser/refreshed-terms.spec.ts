import type {Page} from '@playwright/test';
import {reviewedTerms} from '../../src/lib/reviewed-terms';
import {publicSupplierPolicy} from '../../src/lib/public-supplier-policy';
import {hotelRoomInfo,hotelStringList} from '../../src/lib/hotel-presentation';
import {test,expect,capture,departure,returning,flight,flightResults,openFlightSearch,reviewedQuote,searchId,bookingId,expectNoHorizontalOverflow,type ProviderFixture} from './fixtures';

const renewedId='44444444-4444-4444-8444-444444444444';
const consent=(page:Page)=>page.getByRole('checkbox',{name:/I accept the reviewed total and supplier rules/});
const disclosure=(page:Page)=>page.getByRole('region',{name:'Review the refreshed terms',exact:true});
const form=(page:Page)=>page.getByRole('form',{name:'Review and travellers'});
const changedRow=(page:Page,label:string)=>disclosure(page).locator('.policy-row').filter({has:page.locator('dt',{hasText:label})});
function fare(group:'ONWARD'|'RETURN'='ONWARD',refund=1,baggage='15 Kg'){
 const value=flight(group);value.totalPriceList[0].fD.ADULT.rT=refund;value.totalPriceList[0].fD.ADULT.bI.iB=baggage;return value;
}
// These helpers run only in the Playwright process. They reproduce the public
// review projection from synthetic raw supplier payloads; no request reaches a
// provider. UI assertions below use independent expected before/after strings.
function flightQuote(trips:ReturnType<typeof fare>[],id?:string){
 const source={tripInfos:trips,fareRules:{fareRule:{miscInfo:'Cancellation charges depend on the reviewed fare.'}}};
 return reviewedQuote({...(id?{quoteId:id}:{}),...(trips.length>1?{totalMinor:1308000,summary:{from:'BOM',to:'DEL',date:departure,returnDate:returning,adults:1,children:0,infants:0}}:{}),review:{conditions:{},terms:reviewedTerms('FLIGHT',source),fareRules:publicSupplierPolicy(source.fareRules)}});
}
function room(refundable=true){return {optionId:'terms-room',roomInfo:[{name:'Deluxe twin room'}],mealBasis:'BREAKFAST',inclusions:['Wi-Fi','Breakfast'],bookingNotes:'Synthetic review terms; no reservation.',pricing:{totalPrice:8000,currency:'INR'},cancellation:{isRefundable:refundable,penalties:[{from:`${departure}T00:00:00`,to:`${returning}T00:00:00`,amount:refundable?0:100}]}};}
function hotelQuote(option:Record<string,unknown>,id?:string){
 return reviewedQuote({...(id?{quoteId:id}:{}),product:'HOTEL',hotelName:'Synthetic terms stay',totalMinor:800000,summary:{checkIn:departure,checkOut:returning,adults:1,children:0,rooms:[{adults:1,children:0,childAge:[]}]},review:{terms:reviewedTerms('HOTEL',{option}),option:{...option,roomInfo:hotelRoomInfo(option.roomInfo),inclusions:hotelStringList(option.inclusions),cancellation:publicSupplierPolicy(option.cancellation)}}});
}
async function selectFare(page:Page,label='Check fare & continue'){
 const comparison=page.locator('.flight-shopping-list .fare-comparison').first();
 if(await comparison.getAttribute('open')===null)await comparison.locator(':scope > summary').click();
 await page.getByRole('button',{name:label,exact:true}).first().click();
}
async function openFlight(page:Page){await openFlightSearch(page);await selectFare(page);await expect(form(page)).toBeVisible();}
async function openHotel(page:Page,provider:ProviderFixture){
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Synthetic terms stay',customerEstimateMinor:800000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[room()]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'}));
 await page.getByRole('button',{name:'Choose room',exact:true}).click();
 await page.getByRole('button',{name:'Review stay',exact:true}).click();await expect(form(page)).toBeVisible();
}
async function fillTraveller(page:Page){
 await form(page).getByLabel('First name',{exact:true}).fill('Aarav');await form(page).getByLabel('Last name',{exact:true}).fill('Example');
 await form(page).getByLabel('Email',{exact:true}).fill('traveller@example.test');await form(page).getByLabel('Indian mobile number',{exact:true}).fill('9876543210');
}
async function retainedTraveller(page:Page){
 await expect(form(page).getByLabel('First name',{exact:true})).toHaveValue('Aarav');await expect(form(page).getByLabel('Last name',{exact:true})).toHaveValue('Example');
 await expect(form(page).getByLabel('Email',{exact:true})).toHaveValue('traveller@example.test');await expect(form(page).getByLabel('Indian mobile number',{exact:true})).toHaveValue('9876543210');
 expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('traveller@example.test');
}
async function reviewPayment(page:Page){await page.getByRole('button',{name:'Review booking',exact:true}).click();await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();}
async function refresh(page:Page){await page.getByRole('button',{name:'Refresh reviewed price',exact:true}).click();await expect(disclosure(page)).toBeVisible();await expect(page.getByRole('button',{name:'Review booking',exact:true})).toBeEnabled();await expect(page.locator('#refreshed-terms-title')).toBeFocused();await expect(page.locator('.travel-skip')).not.toBeFocused();await expect(page.locator('.travel-skip')).toHaveCSS('clip-path','inset(50%)');}
async function prepareRefreshedFlight(page:Page,provider:ProviderFixture){
 provider.quote=flightQuote([fare()]);await openFlight(page);await fillTraveller(page);
 provider.quote=flightQuote([fare('ONWARD',0,'No allowance')],renewedId);await refresh(page);await retainedTraveller(page);await reviewPayment(page);
}

test('same-price flight baggage/refund changes retain travellers, reset consent, and survive Back',async({page,provider},testInfo)=>{
 provider.quote=flightQuote([fare()]);await openFlight(page);
 await page.locator('.travel-skip').focus();await expect(page.locator('.travel-skip')).toBeFocused();await expect(page.locator('.travel-skip')).toHaveCSS('clip-path','none');await expect(page.locator('.travel-skip')).toBeInViewport();
 await fillTraveller(page);await reviewPayment(page);await consent(page).check();
 provider.quote=flightQuote([fare('ONWARD',0,'No allowance')],renewedId);await refresh(page);
 await expect(disclosure(page).getByRole('status')).toContainText('Total unchanged. 2 reviewed details have changed');
 await expect(changedRow(page,'ADULT checked baggage')).toContainText('Previously: 15 Kg');await expect(changedRow(page,'ADULT checked baggage')).toContainText('Now: No allowance');
 await expect(changedRow(page,'ADULT refundability')).toContainText('Previously: Refundable · charges may apply');await expect(changedRow(page,'ADULT refundability')).toContainText('Now: Non-refundable');
 await retainedTraveller(page);await expectNoHorizontalOverflow(page);await capture(page,testInfo,'same-price-flight-terms-before-after');
 await reviewPayment(page);await expect(consent(page)).not.toBeChecked();await page.getByRole('button',{name:/^Pay .* securely$/}).click();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);await expect(consent(page)).toBeFocused();
 await page.getByRole('button',{name:'Back to travellers',exact:true}).click();await retainedTraveller(page);await expect(disclosure(page)).toBeVisible();
 await reviewPayment(page);await expect(consent(page)).not.toBeChecked();expect(provider.requests('/api/travel/review')).toHaveLength(2);
 await capture(page,testInfo,'refreshed-flight-fresh-consent');
 // Changing selection returns to real results, then a new non-renewal clears the old comparison.
 await page.getByRole('button',{name:'Change selection',exact:true}).click();await expect(page.locator('.flight-shopping-list')).toBeVisible();
 await selectFare(page,'Selected');await retainedTraveller(page);await expect(disclosure(page)).toHaveCount(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('same-price hotel room, meal and cancellation changes show explicit previous/latest values',async({page,provider},testInfo)=>{
 provider.quote=hotelQuote(room());await openHotel(page,provider);await fillTraveller(page);await reviewPayment(page);await consent(page).check();
 const next={...room(false),roomInfo:[{name:'Standard double room'}],mealBasis:'ROOM_ONLY',inclusions:['Wi-Fi']};
 provider.quote=hotelQuote(next,renewedId);await refresh(page);
 await expect(disclosure(page).getByRole('status')).toContainText('Total unchanged. 5 reviewed details have changed');
 await expect(changedRow(page,'Room')).toContainText('Previously: Deluxe twin room');await expect(changedRow(page,'Room')).toContainText('Now: Standard double room');
 await expect(changedRow(page,'Meal plan')).toContainText('Previously: BREAKFAST');await expect(changedRow(page,'Meal plan')).toContainText('Now: ROOM ONLY');
 await expect(changedRow(page,'Refundability')).toContainText('Now: Non-refundable');await expect(changedRow(page,'Cancellation schedule')).toContainText('Supplier amount 0');await expect(changedRow(page,'Cancellation schedule')).toContainText('Supplier amount 100 (currency, units and basis unverified)');
 const schedule=changedRow(page,'Cancellation schedule');await expect(schedule).toContainText('IST →');await expect(schedule).not.toContainText('T18:30:00.000Z');await expect(schedule).not.toContainText('₹');
 await expect(disclosure(page)).toContainText('Same price does not mean same terms.');
 await retainedTraveller(page);await expectNoHorizontalOverflow(page);await capture(page,testInfo,'same-price-hotel-room-meal-cancellation');
 await reviewPayment(page);await expect(consent(page)).not.toBeChecked();await page.getByRole('button',{name:/^Pay .* securely$/}).click();expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.getByRole('button',{name:'Back to travellers',exact:true}).click();await retainedTraveller(page);expect(provider.requests('/api/travel/review')).toHaveLength(2);
});

test('reordered reviewed outbound/return journeys do not invent changed baggage or refund terms',async({page,provider},testInfo)=>{
 const out=fare('ONWARD',1,'15 Kg'),back=fare('RETURN',0,'20 Kg');provider.search=flightResults(true);provider.quote=flightQuote([out,back]);
 await openFlightSearch(page,{roundTrip:true});await selectFare(page,'Choose this outbound fare');await selectFare(page,'Choose this return fare');
 await page.getByRole('button',{name:/Review selected journey \(2\/2\)/}).click();await expect(form(page)).toBeVisible();await fillTraveller(page);
 provider.quote=flightQuote([back,out],renewedId);await refresh(page);
 await expect(disclosure(page).getByRole('status')).toContainText('Total unchanged. No differences detected in the comparable details.');
 await expect(disclosure(page).locator(':scope > dl')).toHaveCount(0);await expect(disclosure(page)).not.toContainText('Previously:');
 await retainedTraveller(page);expect(provider.requests('/api/travel/review').map(call=>call.body)).toEqual([{searchId,priceIds:['onward-standard','return-standard']},{searchId,priceIds:['onward-standard','return-standard']}]);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);await expectNoHorizontalOverflow(page);await capture(page,testInfo,'reordered-journeys-no-false-changes');
});

test('malformed refreshed room/inclusion/policy details disclose unknown rather than unchanged or no restrictions',async({page,provider},testInfo)=>{
 provider.quote=hotelQuote(room());await openHotel(page,provider);await fillTraveller(page);
 provider.quote=hotelQuote({...room(),roomInfo:[{name:'Deluxe twin room'},{name:42}],inclusions:['Wi-Fi',{name:'Unsupported'}],mealBasis:undefined,cancellation:{unsupportedPolicy:{supplierAuthToken:'SYNTHETIC_PRIVATE_TOKEN',fC:{NF:987654321}}}},renewedId);
 await refresh(page);await expect(disclosure(page).getByRole('status')).toContainText('Some terms could not be compared.');
 for(const label of ['Room','Inclusions','Meal plan','Refundability','Cancellation schedule'])await expect(changedRow(page,label)).toContainText('Now: Not supplied or not comparable');
 await disclosure(page).getByText('Compare supported previous and latest cancellation / fare policies',{exact:true}).click();
 await expect(disclosure(page).getByRole('region',{name:'Latest supplier policy',exact:true})).toContainText('Comparable policy details unavailable');
 await expect(disclosure(page)).toContainText('Missing details do not mean no restrictions or no allowance');
 await expect(page.locator('body')).not.toContainText('SYNTHETIC_PRIVATE_TOKEN');await expect(page.locator('body')).not.toContainText('987654321');
 await retainedTraveller(page);expect(provider.requests('/api/payments/create')).toHaveLength(0);await expectNoHorizontalOverflow(page);await capture(page,testInfo,'refreshed-terms-unknown-coverage');
});

for(const status of [409,503])test(`refreshed terms cannot bypass uncertain payment (${status}) lockout`,async({page,provider},testInfo)=>{
 provider.overrides['POST /api/payments/create']={status,body:{error:'Payment order creation is pending reconciliation. Do not create another payment.'}};
 await prepareRefreshedFlight(page,provider);await consent(page).check();await page.getByRole('button',{name:/^Pay .* securely$/}).click();
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('Payment order creation is pending reconciliation');
 await expect(page.getByRole('link',{name:'Check payment status in My trips',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Refresh reviewed price',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Change selection',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Back to travellers',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:/^Pay .* securely$/})).toHaveCount(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(1);expect(provider.requests('/api/payments/create')[0].body).toMatchObject({quoteId:renewedId,acceptedTotalMinor:654000});
 expect(provider.requests('/api/travel/review')).toHaveLength(2);expect(provider.requests('/api/payments/verify')).toHaveLength(0);expect(await page.evaluate('window.__syntheticGateway?.opens.length ?? 0')).toBe(0);
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,`refreshed-terms-uncertain-${status}`);
});

test('payment dismissal after refresh resumes the same synthetic order, never another quote or payment',async({page,provider},testInfo)=>{
 await prepareRefreshedFlight(page,provider);await consent(page).check();await page.getByRole('button',{name:/^Pay .* securely$/}).click();
 await expect.poll(()=>page.evaluate('window.__syntheticGateway?.opens.length ?? 0')).toBe(1);await page.evaluate('window.__syntheticGateway.dismiss()');
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('Checkout closed. Your payment order is preserved.');
 await expect(page.getByRole('button',{name:'Refresh reviewed price',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Change selection',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Resume secure checkout',exact:true}).click();await expect.poll(()=>page.evaluate('window.__syntheticGateway?.opens ?? []')).toEqual(['order_SYNTHETICONLY','order_SYNTHETICONLY']);
 expect(provider.requests('/api/payments/create')).toHaveLength(1);expect(provider.requests('/api/payments/create')[0].body).toMatchObject({quoteId:renewedId,acceptedTotalMinor:654000});
 expect(provider.requests('/api/payments/status')).toHaveLength(1);expect(provider.requests('/api/payments/status')[0].query).toEqual({bookingId});expect(provider.requests('/api/travel/review')).toHaveLength(2);expect(provider.requests('/api/payments/verify')).toHaveLength(0);
 await page.evaluate('window.__syntheticGateway.dismiss()');await expect(disclosure(page)).toBeVisible();await expect(page.getByRole('button',{name:/View confirmation details/})).toHaveCount(0);
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'refreshed-terms-same-order-recovery');
});
