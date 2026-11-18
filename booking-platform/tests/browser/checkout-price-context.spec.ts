import type {Page} from '@playwright/test';
import type {Flight} from '../../src/lib/booking-presentation';
import {test,expect,flight,openFlightSearch,reviewedQuote,departure,returning,searchId,quoteId,capture,expectNoHorizontalOverflow} from './fixtures';

const notice=(page:Page)=>page.getByRole('region',{name:'Price updated at review',exact:true});
const form=(page:Page)=>page.getByRole('form',{name:'Review and travellers',exact:true});
async function chooseFare(page:Page,name='Check fare & continue'){
 const panel=page.locator('.flight-shopping-list .fare-comparison').first();
 if(await panel.getAttribute('open')===null)await panel.locator(':scope > summary').click();
 await page.getByRole('button',{name,exact:true}).first().click();
}
async function fillGuests(page:Page,names:string[]){
 for(const [index,name] of names.entries()){
  await form(page).getByLabel('First name',{exact:true}).nth(index).fill(name);
  await form(page).getByLabel('Last name',{exact:true}).nth(index).fill('Example');
 }
 await form(page).getByLabel('Email',{exact:true}).fill('price-context@example.test');
 await form(page).getByLabel('Indian mobile number',{exact:true}).fill('9876543210');
}

test('first roundtrip review explains the whole-party price increase and displays outbound before return',async({page,provider},info)=>{
 const out=flight('ONWARD'),back=flight('RETURN');
 out.totalPriceList[0].customerEstimateMinor=400000;back.totalPriceList[0].customerEstimateMinor=300000;
 provider.search={searchId,results:{searchResult:{tripInfos:{RETURN:[back],ONWARD:[out]}}}};
 provider.quote=reviewedQuote({totalMinor:850000,summary:{from:'BOM',to:'DEL',date:departure,returnDate:returning,adults:1,children:0,infants:0}});
 await openFlightSearch(page,{roundTrip:true});
 await chooseFare(page,'Choose this outbound fare');await chooseFare(page,'Choose this return fare');
 await page.getByRole('button',{name:'Review selected journey (2/2)',exact:true}).click();
 await expect(notice(page)).toBeVisible();await expect(notice(page)).toContainText('₹7,000');await expect(notice(page)).toContainText('₹8,500');
 await expect(notice(page)).toContainText('Complete selected itinerary · all travellers');
 const segments=page.locator('.selected-journey-recap li');await expect(segments).toHaveCount(2);
 await expect(segments.nth(0)).toContainText('BOM → DEL');await expect(segments.nth(1)).toContainText('DEL → BOM');
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['onward-standard','return-standard']});
 await expectNoHorizontalOverflow(page);await capture(page,info,'initial-roundtrip-price-comparison');
 await fillGuests(page,['Aarav']);
 await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toContainText('₹8,500');
 provider.overrides['POST /api/travel/promo']={body:{quoteId,totalMinor:840000,originalTotalMinor:850000,discountMinor:10000,code:'SAVE100'}};
 const promo=page.getByRole('region',{name:'Promo code',exact:true});
 await promo.getByLabel('Promo code',{exact:true}).fill('SAVE100');await promo.getByRole('button',{name:'Apply code',exact:true}).click();
 await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toContainText('₹8,400');
 await expect(notice(page)).toHaveCount(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('hotel bundle comparison stays inclusive and final review identifies each guests submitted room',async({page,provider},info)=>{
 const option={optionId:'two-room-bundle',roomInfo:[{id:'double',name:'Garden Double'},{id:'twin',name:'Garden Twin'}],mealBasis:'BREAKFAST',pricing:{totalPrice:13000,currency:'INR'}};
 const rooms=[{adults:1,children:0,childAge:[]},{adults:1,children:0,childAge:[]}];
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Price Context Stay',customerEstimateMinor:900000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[option]}};
 provider.quote=reviewedQuote({product:'HOTEL',hotelName:'Price Context Stay',totalMinor:1200000,summary:{checkIn:departure,checkOut:returning,adults:2,rooms},review:{option}});
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'2',rooms:JSON.stringify(rooms.map(({adults,childAge})=>({adults,childAge}))),autoSearch:'1'}));
 await page.getByRole('button',{name:'Choose room',exact:true}).click();await page.getByRole('button',{name:'Continue with room',exact:true}).click();
 await expect(notice(page)).toContainText('₹13,000');await expect(notice(page)).toContainText('₹12,000');
 await expect(notice(page)).not.toContainText('₹9,000');await expect(notice(page)).not.toContainText('₹26,000');
 await expect(notice(page)).toContainText('Full stay · all selected rooms and guests');
 await fillGuests(page,['Aarav','Isha']);
 const summary=page.locator('.final-traveller-summary');
 await expect(summary.getByRole('listitem').nth(0)).toContainText('Aarav Example');await expect(summary.getByRole('listitem').nth(0)).toContainText('Room 1');
 await expect(summary.getByRole('listitem').nth(1)).toContainText('Isha Example');await expect(summary.getByRole('listitem').nth(1)).toContainText('Room 2');
 await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toContainText('₹12,000');
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,hid:'10001',optionId:'two-room-bundle'});
 const stored=await page.evaluate(()=>JSON.stringify({history:history.state,session:{...sessionStorage}}));expect(stored).not.toContain('Isha');expect(stored).not.toContain('price-context@example.test');
 await expectNoHorizontalOverflow(page);await capture(page,info,'hotel-room-assignment-review');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const reason of ['unknown','non-INR'] as const)test(`first review does not invent a comparison for ${reason} flight estimates`,async({page,provider})=>{
 const selected:Flight=flight();if(reason==='unknown')delete selected.totalPriceList[0].customerEstimateMinor;else selected.totalPriceList[0].currency='USD';
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[selected]}}}};
 provider.quote=reviewedQuote({totalMinor:700000});
 await openFlightSearch(page);await chooseFare(page);await expect(form(page)).toBeVisible();
 await expect(notice(page)).toHaveCount(0);await expect(page.locator('.selected-reviewed-total')).toContainText('₹7,000');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('refresh replaces initial estimate comparison with renewed quote comparison and retains valid details',async({page,provider})=>{
 provider.quote=reviewedQuote({totalMinor:700000});await openFlightSearch(page);await chooseFare(page);
 await expect(notice(page)).toContainText('₹6,540');await fillGuests(page,['Aarav']);
 provider.quote=reviewedQuote({quoteId:'88888888-8888-4888-8888-888888888888',totalMinor:720000});
 await page.getByRole('button',{name:'Refresh reviewed price',exact:true}).click();
 const refreshed=page.getByRole('region',{name:'Review the refreshed terms',exact:true});
 await expect(refreshed).toContainText('Total changed from ₹7,000 to ₹7,200.');
 await expect(notice(page)).toHaveCount(0);await expect(form(page).getByLabel('First name',{exact:true})).toHaveValue('Aarav');
 expect(provider.requests('/api/travel/review')).toHaveLength(2);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
