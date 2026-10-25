import {test,expect,flight,departure,returning,searchId,reviewedQuote,expectNoHorizontalOverflow,capture} from './fixtures';
import type {Locator,Page,TestInfo} from '@playwright/test';
import path from 'node:path';
import {travelDateLabel} from '../../src/lib/travel-date';

async function reference(page:Page,testInfo:TestInfo,name:string,critical:Locator[]=[]){
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>{let last=scrollY,stable=0,frames=0;const tick=()=>{stable=Math.abs(scrollY-last)<1?stable+1:0;last=scrollY;if(stable>=8||++frames>=120)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});});
 await expectNoHorizontalOverflow(page);
 const bounds=await Promise.all(critical.map(locator=>locator.evaluate(node=>{const r=node.getBoundingClientRect();return {text:node.textContent,top:r.top,bottom:r.bottom,height:innerHeight};})));
 const body=await page.screenshot({path:testInfo.outputPath(`${name}-${testInfo.project.name}-viewport.png`),fullPage:false,animations:'disabled'});
 await testInfo.attach(`${name} · actual viewport · synthetic inventory`,{body,contentType:'image/png'});
 await capture(page,testInfo,name);
 if(bounds.length)await testInfo.attach(`${name} next-action geometry`,{body:Buffer.from(JSON.stringify(bounds,null,2)),contentType:'application/json'});
 for(const bound of bounds){expect(bound.top,`${bound.text}: complete top within natural viewport`).toBeGreaterThanOrEqual(0);expect(bound.bottom,`${bound.text}: complete bottom within natural viewport`).toBeLessThanOrEqual(bound.height);}
}
async function expectFlightCardContentsFit(card:Locator){
 const geometry=await card.evaluate(node=>{const bounds=node.getBoundingClientRect();return {left:bounds.left,right:bounds.right,scrollLeft:node.scrollLeft,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,children:Array.from(node.querySelectorAll('.flight-result-top,.airline-monogram,.flight-route-line strong,.fare-comparison>summary>strong,.choose-fare-label')).map(child=>{const r=child.getBoundingClientRect();return {text:child.textContent,left:r.left,right:r.right};})};});
 expect(geometry.scrollWidth,'flight card must not conceal horizontal overflow').toBeLessThanOrEqual(geometry.clientWidth+1);
 expect(Math.abs(geometry.scrollLeft),'flight card must not retain an internal horizontal pan').toBeLessThanOrEqual(1);
 for(const child of geometry.children){expect(child.left,`${child.text}: complete left within card`).toBeGreaterThanOrEqual(geometry.left-1);expect(child.right,`${child.text}: complete right within card`).toBeLessThanOrEqual(geometry.right+1);}
}
const flightQuery=()=>'/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'});

for(const width of [null,320])test.describe(width?'320px decision surfaces':'Project viewport decision surfaces',()=>{
 test.beforeEach(async({page})=>{if(width)await page.setViewportSize({width,height:844});});

test('flight decision has an explicit next action and reversible fare choice',async({page,provider},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const row=flight();row.totalPriceList.push({...row.totalPriceList[0],id:'flex-exact-id',fareIdentifier:'FLEXIBLE',customerEstimateMinor:720050});
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[row]}}}};
 provider.quote=reviewedQuote({totalMinor:720050});
 await page.goto(flightQuery());
 await expect(page.locator('#flight-results-title')).toHaveText('Available flights');
 await expect(page.getByRole('heading',{name:'Choose your flight',exact:true})).toHaveCount(1);
 await expect(page.getByRole('region',{name:'Available options',exact:true})).toBeVisible();
 const card=page.locator('.flight-shopping-list .live-flight-card').first();
 const action=card.locator('.choose-fare-label');await expect(action).toHaveText('Choose fare →');
 await expect.poll(()=>action.evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
 if(page.viewportSize()!.width<=600)await expect(page.locator('.results-heading')).toHaveCSS('margin-bottom','2px');
 await reference(page,testInfo,'journey-flight-results');
 const summary=card.locator('.fare-comparison>summary');await summary.focus();await page.keyboard.press('Enter');
 await expect(card.getByRole('button',{name:'Check fare & continue',exact:true})).toHaveCount(2);
 await expect(card).toContainText('₹7,200.50');
 await expect(card.locator('.fare-choice-heading h3')).toBeFocused();
 await expect(card.locator('.fare-details-unavailable').first()).toHaveCSS('font-size','14px');
 await reference(page,testInfo,'journey-fare-choice',[card.getByRole('button',{name:'Check fare & continue',exact:true}).first(),card.locator('.fare-option-heading strong').first()]);
 if(page.viewportSize()!.width<=600)await expect(card.locator('.fare-comparison[open]>summary')).toHaveCSS('display','grid');
 await expectFlightCardContentsFit(card);
 await card.getByRole('button',{name:'Back to flights',exact:true}).click();await expect(summary).toBeFocused();
 await expect(card.locator('.fare-option')).toHaveCount(0);
 await summary.press('Space');
 await card.locator('.fare-option').filter({has:page.getByRole('heading',{name:'FLEXIBLE',exact:true})}).getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.locator('#booking-review-title')).toBeFocused();
 await expect(page.getByRole('button',{name:'Review booking',exact:true})).toBeVisible();
 await expect(page.locator('#booking-review')).toContainText(travelDateLabel(departure));
 await expect(page.locator('.selected-journey-recap')).toContainText(travelDateLabel(departure));
 await expect(page.locator('#booking-summary')).toContainText(travelDateLabel(departure));
 await expect(page.locator('.selected-journey-recap')).not.toContainText(departure);
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
 await reference(page,testInfo,'journey-room-workspace',[page.getByRole('button',{name:'Review stay',exact:true}).first(),page.locator('.room-option-action strong').first()]);
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
 await expect(page.locator('#booking-signin-title')).toBeFocused();
 const layout=await page.locator('.flight-shopping-list .live-flight-card').first().evaluate(card=>{
  const measure=(node:Element)=>{const r=node.getBoundingClientRect(),css=getComputedStyle(node);return {tag:node.tagName,className:node.className,text:node.textContent?.slice(0,60),left:r.left,right:r.right,width:r.width,scrollLeft:node.scrollLeft,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,overflowX:css.overflowX,overflowY:css.overflowY,display:css.display,open:node instanceof HTMLDetailsElement?node.open:undefined,flexDirection:css.flexDirection,order:css.order,gridColumns:css.gridTemplateColumns,minWidth:css.minWidth,maxWidth:css.maxWidth,padding:css.padding,margin:css.margin,whiteSpace:css.whiteSpace};};
  const parents:ReturnType<typeof measure>[]=[];for(let node:Element|null=card;node;node=node.parentElement)parents.push(measure(node));
  return {viewport:{width:innerWidth,scrollX,documentWidth:document.documentElement.scrollWidth},parents,children:Array.from(card.querySelectorAll('*')).map(measure)};
 });
 await testInfo.attach('auth boundary flight layout diagnostics',{body:Buffer.from(JSON.stringify(layout,null,2)),contentType:'application/json'});
 await reference(page,testInfo,'journey-account-boundary',[page.getByRole('link',{name:'Sign in to review selection',exact:true}),page.locator('#booking-signin-title')]);
 await expectFlightCardContentsFit(page.locator('.flight-shopping-list .live-flight-card').first());
 await page.getByRole('button',{name:'Back to fares',exact:true}).click();await expect(page.locator('#flight-results-title')).toBeFocused();
 await expectFlightCardContentsFit(page.locator('.flight-shopping-list .live-flight-card').first());
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(1);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('storage-unavailable review shows focused honest sign-in and search-again guidance',async({page,provider},testInfo)=>{
 provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='maxtravel:selection:v1')throw new Error('Synthetic selection storage unavailable');return original.call(this,key,value);};});
 await page.goto(flightQuery());await page.locator('.fare-comparison>summary').click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.locator('#booking-signin-title')).toBeFocused();
 await expect(page.locator('#booking-feedback')).toContainText('cannot preserve this selection');
 const next=page.getByRole('link',{name:'Sign in, then search again',exact:true});
 await expect(next).not.toHaveAttribute('href',/resumeSelection|autoSearch/);
 await expect(page.getByRole('link',{name:'Sign in to review selection',exact:true})).toHaveCount(0);
 await reference(page,testInfo,'journey-storage-unavailable',[next,page.locator('#booking-signin-title')]);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

});
