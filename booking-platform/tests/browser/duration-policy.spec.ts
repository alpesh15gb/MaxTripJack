import {test,expect,flight,departure,returning,searchId,expectNoHorizontalOverflow,capture,reviewedQuote} from './fixtures';

for(const narrow of [false,true]) {
test(`flight segment durations are readable without inventing unknown connections${narrow?' at 320px':''}`, async({page,provider},testInfo)=>{
 if(narrow)await page.setViewportSize({width:320,height:844});
 const first=flight();const second={...first.sI[0],id:'second-segment',da:{code:'DEL',city:'Delhi'},aa:{code:'DXB',city:'Dubai'},dt:`${departure}T13:30:00`,at:`${departure}T16:00:00`,duration:145};first.sI.push(second);
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[first]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DXB',date:departure,adults:'1',autoSearch:'1'}));
 const details=page.locator('.flight-segment-details');await details.locator('summary').press('Enter');
 await expect(details).toContainText('Segment duration: 2h 10m');await expect(details).toContainText('Segment duration: 2h 25m');await expect(details).toContainText('Connection at DEL · duration not supplied');
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'duration-details-synthetic');
 await page.locator('.fare-comparison>summary').click();const next=page.getByRole('button',{name:'Check fare & continue',exact:true});await expect(next).toBeInViewport();
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test(`hotel policy windows are readable and positive amount meaning stays unverified${narrow?' at 320px':''}`, async({page,provider},testInfo)=>{
 if(narrow)await page.setViewportSize({width:320,height:844});
 const policy={isRefundable:true,penalties:[{from:'2026-10-21T00:00:00',to:'2026-10-22T00:00:00',amount:0},{from:'2026-10-22T00:00:00',to:'2026-10-23T00:00:00',amount:1000}]};
 provider.quote=reviewedQuote({product:'HOTEL',summary:{city:'Goa',date:departure,end:returning,adults:1},review:{conditions:{},option:{optionId:'exact-policy-room',cancellation:policy}}});
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Policy fixture stay',customerEstimateMinor:800000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[{optionId:'exact-policy-room',roomInfo:[{name:'Twin room'}],mealBasis:'Room only',pricing:{totalPrice:8000,currency:'INR'},cancellation:policy}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'}));
 await page.getByRole('button',{name:'Choose room',exact:true}).click();await expect(page.locator('#room-choice-title')).toBeFocused();await expect(page.getByRole('button',{name:'Review stay',exact:true})).toBeInViewport();
 await page.getByText('Full cancellation policy & room details',{exact:true}).click();const timeline=page.getByRole('region',{name:'Hotel cancellation windows'});
 await expect(timeline).toContainText('India Standard Time');await expect(timeline).toContainText('21 Oct 2026');await expect(timeline).toContainText('The exact charge cannot be confirmed: the supplier has not specified the currency, units or calculation basis.');
 await expect(timeline).not.toContainText('₹');await timeline.getByText('Supported supplier policy details',{exact:true}).click();await expect(timeline).toContainText('2026-10-21T00:00:00');
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'hotel-policy-windows-synthetic');expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.getByRole('button',{name:'Review stay',exact:true}).click();
 await expect(page.locator('#booking-review-title')).toBeFocused();
 await expect(page.locator('#booking-review-title')).toHaveText('Who’s coming along?');
 await page.getByText('Fare conditions, cancellation & documents',{exact:true}).click();
 const reviewed=page.getByRole('region',{name:'Hotel cancellation windows'});await expect(reviewed).toContainText('The exact charge cannot be confirmed: the supplier has not specified the currency, units or calculation basis.');
 expect(provider.requests('/api/travel/review')).toHaveLength(1);expect(provider.requests('/api/travel/review')[0].body).toMatchObject({optionId:'exact-policy-room'});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'hotel-reviewed-policy-synthetic');
});

}
