import {test,expect,flight,departure,returning,searchId,reviewedQuote,expectNoHorizontalOverflow,capture} from './fixtures';
import type {Page,TestInfo} from '@playwright/test';
import path from 'node:path';

async function reference(page:Page,testInfo:TestInfo,name:string){
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>{let last=scrollY,stable=0,frames=0;const tick=()=>{stable=Math.abs(scrollY-last)<1?stable+1:0;last=scrollY;if(stable>=8||++frames>=120)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});});
 await expectNoHorizontalOverflow(page);
 const body=await page.screenshot({path:testInfo.outputPath(`${name}-${testInfo.project.name}-viewport.png`),fullPage:false,animations:'disabled'});
 await testInfo.attach(`${name} · actual viewport · synthetic inventory`,{body,contentType:'image/png'});
 await capture(page,testInfo,name);
}
const flightQuery=()=>'/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'});

test('flight decision has an explicit next action and reversible fare choice',async({page,provider},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const row=flight();row.totalPriceList.push({...row.totalPriceList[0],id:'flex-exact-id',fareIdentifier:'FLEXIBLE',customerEstimateMinor:720050});
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[row]}}}};
 provider.quote=reviewedQuote({totalMinor:720050});
 await page.goto(flightQuery());
 const card=page.locator('.flight-shopping-list .live-flight-card').first();
 const action=card.locator('.choose-fare-label');await expect(action).toHaveText('Choose fare →');
 await expect.poll(()=>action.evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
 await reference(page,testInfo,'journey-flight-results');
 const summary=card.locator('.fare-comparison>summary');await summary.focus();await page.keyboard.press('Enter');
 await expect(card.getByRole('button',{name:'Check fare & continue',exact:true})).toHaveCount(2);
 await expect(card).toContainText('₹7,200.50');
 await reference(page,testInfo,'journey-fare-choice');
 await card.getByRole('button',{name:'Back to flights',exact:true}).click();await expect(summary).toBeFocused();
 await expect(card.locator('.fare-option')).toHaveCount(0);
 await summary.press('Space');
 await card.locator('.fare-option').filter({has:page.getByRole('heading',{name:'FLEXIBLE',exact:true})}).getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.locator('#booking-review-title')).toBeFocused();
 await expect(page.getByRole('button',{name:'Review booking',exact:true})).toBeVisible();
 await reference(page,testInfo,'journey-traveller-review');
 expect(provider.requests('/api/travel/review').map(call=>call.body)).toEqual([{searchId,priceIds:['flex-exact-id']}]);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('return choice retains selected outbound and focuses complete journey review',async({page,provider},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[flight()],RETURN:[flight('RETURN')]}}}};
 await page.goto(flightQuery()+'&returnDate='+returning);
 await page.locator('.fare-comparison>summary').click();await page.getByRole('button',{name:'Choose this outbound fare',exact:true}).click();
 await expect(page.locator('#flight-results-title')).toHaveText('Choose your return flight');await expect(page.locator('#flight-results-title')).toBeFocused();
 const context=page.getByRole('region',{name:'Selected flight context'});
 await expect(context).toContainText('BOM → DEL · 09:15');await expect(context.getByRole('button',{name:'Change outbound',exact:true})).toBeVisible();
 await reference(page,testInfo,'journey-return-context');
 await page.locator('.fare-comparison>summary').click();await page.getByRole('button',{name:'Choose this return fare',exact:true}).click();
 const review=page.getByRole('button',{name:'Review selected journey (2/2)',exact:true});await expect(review).toBeFocused();await expect(review).toBeInViewport();
 await reference(page,testInfo,'journey-complete-selection');
 await review.click();await expect(page.locator('#booking-review-title')).toBeFocused();
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['onward-standard','return-standard']});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('room workspace and back preserve the exact filtered search without another supplier call',async({page,provider},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const photo='https://i.travelapi.com/lodging/123/goa-layout-sample.jpg';
 await page.route(photo,route=>route.fulfill({contentType:'image/jpeg',path:path.resolve('public/travel/goa.jpg')}));
 const property={address:'Goa destination layout sample — not published inventory',amenities:['Wi-Fi'],photos:[{url:photo,isHero:true,caption:'Illustrative Goa destination, not an actual property photograph'}]};
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Goa retreat · layout sample',customerEstimateMinor:800000,property},{tjHotelId:'10002',name:'Other sample stay',customerEstimateMinor:900000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property,options:[{optionId:'exact-room-option',roomInfo:[{name:'Twin room · layout sample'}],mealBasis:'Room only',pricing:{totalPrice:8000,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001,10002',date:departure,end:returning,adults:'1',autoSearch:'1'}));
 const toggle=page.getByRole('button',{name:/^Filters/});await expect(page.locator('.hotel-shopping-card')).toHaveCount(2);
 await reference(page,testInfo,'journey-stay-results');
 if(await toggle.isVisible())await toggle.click();await page.getByRole('searchbox',{name:'Property name',exact:true}).fill('Goa');
 await page.getByRole('combobox',{name:'Sort stays',exact:true}).selectOption('price-desc');if(await toggle.isVisible())await toggle.click();
 const choose=page.getByRole('button',{name:'Choose room',exact:true});await choose.click();
 await expect(page.locator('#booking-results')).toBeHidden();await expect(page.locator('#room-choice-title')).toBeFocused();
 await expect(page.getByRole('button',{name:'Review stay',exact:true})).toBeVisible();
 await reference(page,testInfo,'journey-room-workspace');
 await page.getByRole('button',{name:'Back to stays',exact:true}).click();await expect(choose).toBeFocused();
 await expect(page.getByRole('combobox',{name:'Sort stays',exact:true})).toHaveValue('price-desc');await expect(page.locator('.hotel-shopping-card')).toHaveCount(1);
 await reference(page,testInfo,'journey-stays-restored');
 if(await toggle.isVisible())await toggle.click();await expect(page.getByRole('searchbox',{name:'Property name',exact:true})).toHaveValue('Goa');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});


test('account review boundary explains the selected journey without implying a reservation',async({page,provider},testInfo)=>{
 provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await page.goto(flightQuery());await page.locator('.fare-comparison>summary').click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.getByRole('link',{name:'Sign in to review selection',exact:true})).toBeVisible();
 await expect(page.locator('.signin-selection-context')).toContainText('BOM → DEL');
 await expect(page.locator('#booking-feedback')).toContainText('check the current price and full conditions');
 await reference(page,testInfo,'journey-account-boundary');
 await page.getByRole('button',{name:'Back to fares',exact:true}).click();await expect(page.locator('#flight-results-title')).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(1);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
