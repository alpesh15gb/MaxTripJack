import {test,expect,flight,departure,returning,searchId,expectNoHorizontalOverflow,capture} from './fixtures';
import {travelDateLabel} from '../../src/lib/travel-date';

test('flight cards distinguish total journey time from a connection without changing local dates',async({page,provider},testInfo)=>{
 const itinerary=flight();
 itinerary.sI[0]={...itinerary.sI[0],dt:`${departure}T10:00:00+05:30`,at:`${departure}T12:00:00+05:30`,duration:120};
 itinerary.sI.push({...itinerary.sI[0],da:{code:'DEL',city:'Delhi'},aa:{code:'DXB',city:'Dubai'},dt:`${departure}T13:30:00+05:30`,at:`${departure}T16:00:00+04:00`,duration:240});
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[itinerary]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DXB',date:departure,adults:'1',autoSearch:'1'}));
 const card=page.locator('.flight-shopping-list .live-flight-card');
 await expect(card).toContainText('Total journey 7h 30m');
 await expect(card).toContainText(travelDateLabel(departure));
 await expect(card).toContainText('Outbound journey');await expect(card).not.toContainText('flight group');
 await card.locator('.flight-segment-details>summary').click();
 await expect(card).toContainText('Connection at DEL · 1h 30m');
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'readable-flight-results-synthetic');
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('hotel amenities, photo labels and cancellation charges show only supported meaning',async({page,provider},testInfo)=>{
 const property={amenities:['No Accessible Shuttle','Parking'],photos:[{url:'https://i.travelapi.com/lodging/10000/room.jpg',caption:'CoverImage',isHero:true}]};
 await page.route(property.photos[0].url,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#a7c8c5"/><text x="20" y="80">Synthetic property fixture</text></svg>'}));
 const policy={penalties:[{from:'2026-10-23T00:00:00',to:'2026-10-31T00:00:00',amount:2407.09}]};
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Clarity fixture stay',customerEstimateMinor:449970,property}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property,options:[{optionId:'clarity-room',roomInfo:[{name:'Superior room'}],mealBasis:'Room only',pricing:{totalPrice:4499.7,currency:'INR'},cancellation:policy}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 const card=page.locator('.hotel-shopping-card');
 await expect(card.locator('.hotel-amenity-list')).toContainText('Parking');
 await expect(card).not.toContainText('No Accessible Shuttle');
 await expect(card.locator('img')).toHaveAttribute('alt','Clarity fixture stay · supplier property photo 1');
 await page.getByRole('button',{name:'Choose room',exact:true}).click();
 await expect(page.locator('.room-stay-dates')).toContainText(travelDateLabel(departure));
 await expect(page.locator('.room-option-card')).toContainText('All selected rooms and guests');
 await page.getByText('Full cancellation policy & room details',{exact:true}).click();
 const timeline=page.getByRole('region',{name:'Hotel cancellation windows'});
 await expect(timeline.getByText('Exact charge needs confirmation',{exact:true})).toBeVisible();
 await expect(timeline.locator('ol')).not.toContainText('2407.09');await expect(timeline.locator('ol')).not.toContainText('₹');
 await timeline.getByText('Original supplier policy details',{exact:true}).click();
 await expect(timeline.getByRole('region',{name:'Supplier cancellation terms'})).toContainText('2407.09');
 await expect(page.getByText('CoverImage',{exact:true})).toHaveCount(0);
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'readable-hotel-policy-synthetic');
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
