import {test,expect,flight,flightResults,departure,returning,searchId,reviewedQuote,capture,expectNoHorizontalOverflow} from './fixtures';
import {travelDateTimeLabel} from '../../src/lib/travel-date';
import type {Flight} from '../../src/lib/booking-presentation';
import type {Page} from '@playwright/test';
const query=(round=false)=>'/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',...(round?{returnDate:returning}:{}),autoSearch:'1'});
async function chooseLeg(page:Page){await page.locator('.flight-shopping-list .fare-comparison-trigger').first().click();await page.locator('.flight-shopping-list .fare-option button').first().click();}

for(const width of [null,320])test(`aligned fare decisions expose duplicate labels, known allowances and unknown promises${width?' at 320px':''}`,async({page,provider},info)=>{
 if(width)await page.setViewportSize({width,height:844});
 const journey:Flight=flight(),base=journey.totalPriceList[0];
 journey.sI[0].da={code:'BOM',city:'Mumbai',name:'Supplied Mumbai Airport',country:'India'};
 journey.totalPriceList=[{...base,id:'decision-first',fareIdentifier:'CORPORATE',customerEstimateMinor:600000,fD:{...base.fD,CHILD:{bI:{cB:'5 Kg',iB:'10 Kg'}}}},{...base,id:'decision-second',fareIdentifier:'CORPORATE',customerEstimateMinor:650000,fD:{ADULT:{...base.fD.ADULT,bI:{cB:'5',iB:'5'}}}},{...base,id:'decision-unknown',fareIdentifier:'CORPORATE',customerEstimateMinor:null}];
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto(query());const card=page.locator('.flight-shopping-list .live-flight-card');
 await card.locator('.flight-segment-details>summary').click();await expect(card.locator('.flight-segment-details')).toContainText('Supplied Mumbai Airport');
 await card.locator('.fare-comparison-trigger').click();
 const offers=card.locator('.fare-option');await expect(offers).toHaveCount(3);
 await expect(offers.nth(0).getByRole('heading')).toHaveText('Corporate fare');await expect(offers.nth(1).getByRole('heading')).toHaveText('Corporate fare');
 await expect(card.locator('.fare-shared-terms')).toContainText('meals and seat options at review');
 for(const offer of await offers.all()){
  const rows=offer.locator('.fare-decision-dimensions>div');await expect(rows).toHaveCount(4);
 }
 await expect(offers.first()).toContainText('child: cabin baggage 5 Kg · checked baggage 10 Kg');await expect(offers.last()).toContainText('Price at review');await expect(offers.nth(1).locator('.fare-decision-dimensions')).toContainText('5 (unit not supplied)');await expect(offers.nth(1).locator('.fare-decision-dimensions')).not.toContainText('5 Kg');
 await expect(card.locator('.fare-itinerary-dates')).toContainText(travelDateTimeLabel(journey.sI[0].dt));
 await expectNoHorizontalOverflow(page);await capture(page,info,'aligned-fare-decisions');
 await card.getByRole('button',{name:'Back to flights'}).click();await expect(card.locator('.fare-comparison-trigger')).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(0);
 await card.locator('.fare-comparison-trigger').click();await offers.nth(1).getByRole('button',{name:'Check fare & continue'}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['decision-second']});
});

for(const width of [null,320])for(const unknown of [false,true])test(`complete return selection shows exact dates and ${unknown?'unknown':'combined'} pre-review estimate${width?' at 320px':''}`,async({page,provider},info)=>{
 if(width){
  test.skip(!info.project.name.includes('mobile'),'Additional narrow phone coverage');
  await page.setViewportSize({width,height:844});
 }
 const results=flightResults(true);const outbound=results.results.searchResult.tripInfos.ONWARD[0],back=results.results.searchResult.tripInfos.RETURN![0];
 const next=new Date(returning+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 back.sI[0].dt=returning+'T23:15:00';back.sI[0].at=next.toISOString().slice(0,10)+'T01:25:00';
 if(unknown)Object.assign(back.totalPriceList[0],{customerEstimateMinor:null});
 provider.search=results;provider.quote=reviewedQuote({totalMinor:1308000,summary:{from:'BOM',to:'DEL',date:departure,returnDate:returning,adults:1}});
 await page.goto(query(true));await chooseLeg(page);await chooseLeg(page);
 const summary=page.getByRole('region',{name:'Selected flight context'});
 await expect(summary).toContainText(travelDateTimeLabel(outbound.sI[0].dt));await expect(summary).toContainText(travelDateTimeLabel(back.sI[0].at));await expect(summary).toContainText('+1 calendar day');
 await expect(summary.locator('.selection-combined-total')).toContainText(unknown?'Complete total checked at review':'₹13,080 estimated total');
 await expect(summary).toContainText('Search estimates are not a quote');
 const reviewAction=summary.getByRole('button',{name:'Review selected journey (2/2)'});
 await expect(reviewAction).toBeFocused();
 const visible=await page.evaluate(()=>{
  const header=document.querySelector<HTMLElement>('.concierge-header');
  const dock=document.querySelector<HTMLElement>('#booking-results .shopping-filter-actions');
  return {
   top:header&&['sticky','fixed'].includes(getComputedStyle(header).position)?Math.max(0,header.getBoundingClientRect().bottom):0,
   bottom:dock&&getComputedStyle(dock).position==='fixed'&&dock.offsetHeight?dock.getBoundingClientRect().top:window.innerHeight,
  };
 });
 for(const element of [summary.locator('.selection-combined-total'),reviewAction]){
  const box=await element.boundingBox();expect(box).not.toBeNull();expect(box!.y).toBeGreaterThanOrEqual(visible.top);expect(box!.y+box!.height).toBeLessThanOrEqual(visible.bottom);
 }
 const summaryBox=await summary.boundingBox();expect(summaryBox).not.toBeNull();
 if(summaryBox!.height<=visible.bottom-visible.top-16){expect(summaryBox!.y).toBeGreaterThanOrEqual(visible.top);expect(summaryBox!.y+summaryBox!.height).toBeLessThanOrEqual(visible.bottom);}
 else{const lastLeg=await summary.locator('li').last().boundingBox();expect(lastLeg!.y+lastLeg!.height).toBeGreaterThan(visible.top);}
 await info.attach('completed-return-natural-viewport',{body:await page.screenshot(),contentType:'image/png'});
 expect(provider.requests('/api/travel/search')).toHaveLength(1);

 expect(provider.requests('/api/travel/review')).toHaveLength(0);await expectNoHorizontalOverflow(page);await capture(page,info,unknown?'return-price-unknown':'return-complete-decision');
 await summary.getByRole('button',{name:'Change outbound'}).click();await expect(page.getByRole('heading',{name:'Choose your outbound flight'})).toBeVisible();await expect(summary).toContainText('DEL → BOM');
 let writes=0,release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/travel/review',async route=>{writes++;await held;await route.fulfill({json:provider.quote});});
 try{
  await summary.getByRole('button',{name:'Review selected journey (2/2)'}).click();
  await expect(summary.getByRole('button',{name:'Review selected journey (2/2)'})).toBeDisabled();
  await summary.getByRole('button',{name:'Review selected journey (2/2)'}).evaluate(button=>{(button as HTMLButtonElement).click();});
  await expect.poll(()=>writes).toBe(1);await expect(summary).toContainText('Nothing is reserved yet');
 }finally{release();}
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();expect(writes).toBe(1);
});

test('COMBO fare decisions retain every flight and never invent total itinerary duration',async({page,provider},info)=>{
 const journey=flight();journey.sI.push(flight('RETURN').sI[0]);journey.totalPriceList[0].id='combo-decision';
 provider.search={searchId,results:{searchResult:{tripInfos:{COMBO:[journey]}}}};
 await page.goto(query());const card=page.locator('.flight-shopping-list .live-flight-card');
 await expect(card.locator('.combo-itinerary')).toContainText(travelDateTimeLabel(journey.sI[0].dt));await expect(card.locator('.combo-itinerary')).toContainText(travelDateTimeLabel(journey.sI[1].dt));
 await card.locator('.fare-comparison-trigger').click();
 const dialog=card.getByRole('dialog',{name:'Flight details and fare options'});
 await dialog.locator('.flight-segment-details>summary').click();
 await expect(dialog.locator('.flight-segment-details')).toContainText(journey.sI[0].da.code);
 await expect(dialog.locator('.flight-segment-details')).toContainText(journey.sI[1].aa.code);
 await expect(card.locator('.fare-comparison-trigger')).toContainText('Complete itinerary');
 await expect(dialog).not.toContainText('Total journey');
 await expectNoHorizontalOverflow(page);await capture(page,info,'combo-fare-decisions');expect(provider.requests('/api/travel/review')).toHaveLength(0);
 await card.getByRole('button',{name:'Check fare & continue'}).click();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['combo-decision']});
});

test('selected fare progress and action stay together in a short mobile viewport',async({page,provider},info)=>{
 await page.setViewportSize({width:320,height:600});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/travel/review',async route=>{await gate;await route.fallback();});
 try{
  await page.goto(query());await page.locator('.fare-comparison-trigger').first().click();
  const option=page.locator('.fare-option').first();await option.getByRole('button',{name:'Check fare & continue'}).click();
  const status=option.getByRole('status'),action=option.getByRole('button',{name:'Checking fare…'});
  await expect(status).toBeVisible();await expect(action).toBeDisabled();
  for(const element of [status,action]){
   const box=await element.boundingBox();expect(box).not.toBeNull();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(600);
  }
  await info.attach('selected-fare-short-natural-viewport',{body:await page.screenshot(),contentType:'image/png'});
  release();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();expect(provider.requests('/api/travel/review')).toHaveLength(1);
 }finally{release();}
});
