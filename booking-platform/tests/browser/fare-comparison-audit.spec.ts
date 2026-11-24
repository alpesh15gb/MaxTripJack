import {test,expect,capture,departure,flight,searchId,expectNoHorizontalOverflow} from './fixtures';
import type {Flight} from '../../src/lib/booking-presentation';

test('fare comparison preserves distinct offers, orders comparable totals and shows readable price basis',async({page,provider},testInfo)=>{
 const journey:Flight=flight();
 const base=journey.totalPriceList[0];
 journey.totalPriceList=[
  {...base,id:'audit-high',fareIdentifier:'CORPORATE',customerEstimateMinor:779950},
  {...base,id:'audit-low',fareIdentifier:'CORPORATE',customerEstimateMinor:326150,fD:{ADULT:{...base.fD.ADULT,bI:{...base.fD.ADULT.bI,iB:'25 Kg'},rT:1}}},
  {...base,id:'audit-published',fareIdentifier:'PUBLISHED',customerEstimateMinor:324850},
  {...base,id:'audit-unknown',fareIdentifier:'CORPORATE',customerEstimateMinor:null},
 ];
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const card=page.locator('.flight-shopping-list .live-flight-card');await expect(card).toHaveCount(1);
 await card.locator('.fare-comparison>summary').click();
 const offers=card.locator('.fare-option');await expect(offers).toHaveCount(4);
 await expect(offers.nth(0)).toContainText('Standard fare');await expect(offers.nth(0)).toContainText('₹3,248.50');
 await expect(offers.nth(1)).toContainText('₹3,261.50');await expect(offers.nth(2)).toContainText('₹7,799.50');await expect(offers.nth(3)).toContainText('Price at review');
 await expect(offers.nth(1)).toContainText('+₹13 vs lowest shown fare');
 await expect(offers.nth(1).locator('.fare-difference').first()).toContainText('25 Kg');
 await expect(offers.nth(1)).toContainText('Differs in checked baggage, cancellation');
 await expect(offers.first().locator('.fare-card-estimate')).toContainText('Estimated total · all travellers');
 await expect(card.locator('.fare-comparison-guidance')).toContainText('Lowest INR estimates first; unpriced offers last.');
 await expect(card.locator('.fare-shared-terms')).toHaveText('Totals are estimates for all travellers. Check the final price, cancellation and change fees, seat inclusions and eligibility at review.');
 await expect(card.locator('.fare-details-unavailable')).toHaveCount(1);
 const sharedTerms=await card.locator('.fare-details-unavailable').getAttribute('id');
 expect(sharedTerms).toBeTruthy();for(const offer of await offers.all())await expect(offer).toHaveAttribute('aria-describedby',sharedTerms!);
 for(const qualifier of await card.locator('.fare-comparison>summary small,.fare-option-action small').all()){
  expect(await qualifier.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(14);
 }
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'audit-fare-comparison');
 await offers.first().getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 await page.getByText('Original search details & fare',{exact:true}).click();
 const selectedSummary=page.locator('.selected-itinerary .fare-comparison>summary');
 await expect(selectedSummary).toContainText('Selected fare');
 await expect(selectedSummary).toContainText('Estimated total · all travellers');
 const priceBlock=selectedSummary.locator(':scope > strong');
 const priceGeometry=await priceBlock.evaluate(node=>{const parent=node.parentElement!;const style=getComputedStyle(parent);return {maxWidth:getComputedStyle(node).maxWidth,width:node.getBoundingClientRect().width,available:parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};});
 expect(priceGeometry.maxWidth).toBe('none');
 expect(Math.abs(priceGeometry.width-priceGeometry.available)).toBeLessThan(1);
 expect((await selectedSummary.boundingBox())?.height).toBeLessThan(160);
 for(const qualifier of await selectedSummary.locator('small').all()) expect(await qualifier.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(14);
 await capture(page,testInfo,'audit-selected-fare-receipt');
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['audit-published']});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const width of [null,320])test(`15 fare cards stay aligned and every exact offer is reachable${width?' at 320px':''}`,async({page,provider,isMobile,browserName},info)=>{
 if(width)await page.setViewportSize({width,height:844});
 const journey:Flight=flight(),base=journey.totalPriceList[0];
 journey.totalPriceList=Array.from({length:15},(_,index)=>({...base,id:`rail-offer-${index+1}`,fareIdentifier:'CORPORATE',customerEstimateMinor:500000+index*10000,fD:{
  ...base.fD,
  ADULT:{...base.fD.ADULT,bI:{cB:index%2?'7 Kg plus one small personal item':'7 Kg',iB:index%3?'15 Kg':'2 pieces, maximum 23 Kg per piece'},rT:index%2?1:0},
  ...(index%3===0?{CHILD:{bI:{cB:'5 Kg',iB:'10 Kg'}},INFANT:{bI:{cB:'Not supplied',iB:'10 Kg'}}}:{})
 }}));
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const card=page.locator('.flight-shopping-list .live-flight-card'),disclosure=card.locator('.fare-comparison > summary');
 await disclosure.press('Enter');await expect(card.getByRole('heading',{name:'Compare fares'})).toBeFocused();
 const track=card.locator('.fare-decision-grid'),offers=track.locator('.fare-option');await expect(offers).toHaveCount(15);
 await expect(offers.first().getByRole('heading')).toHaveText('Corporate fare · Option 1');await expect(offers.last().getByRole('heading')).toHaveText('Corporate fare · Option 15');
 await page.evaluate(()=>document.fonts.ready);
 const geometry=await track.evaluate(node=>({width:node.clientWidth,content:node.scrollWidth,overflow:getComputedStyle(node).overflowX,cards:Array.from(node.querySelectorAll('.fare-option')).map(offer=>{const box=offer.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,rows:Array.from(offer.querySelectorAll('.fare-decision-dimensions > div')).map(row=>row.getBoundingClientRect().y),action:offer.querySelector('.fare-option-action button')!.getBoundingClientRect().y};})}));
 expect(geometry.content).toBeGreaterThan(geometry.width);expect(['auto','scroll']).toContain(geometry.overflow);
 for(let index=0;index<geometry.cards.length;index++){
  const item=geometry.cards[index];expect(Math.abs(item.y-geometry.cards[0].y)).toBeLessThan(2);expect(item.rows).toHaveLength(4);
  if(index)expect(item.x).toBeGreaterThanOrEqual(geometry.cards[index-1].x+geometry.cards[index-1].width);
  item.rows.forEach((y,row)=>expect(Math.abs(y-geometry.cards[0].rows[row])).toBeLessThan(2));expect(Math.abs(item.action-geometry.cards[0].action)).toBeLessThan(2);
 }
 const previous=card.getByRole('button',{name:'Previous fare options',exact:true}),next=card.getByRole('button',{name:'Next fare options',exact:true});
 await expect(previous).toBeVisible();await expect(next).toBeVisible();
 const jump=card.getByRole('combobox',{name:'Jump to fare'});
 await expect(jump.locator('option').last()).toHaveText('Corporate fare · Option 15 · ₹6,400');
 await jump.selectOption('14');
 await expect(offers.last().getByRole('heading')).toBeFocused();
 await expect(offers.last().getByRole('heading')).toBeInViewport({ratio:.95});
 await expect(jump.locator('option:checked')).toHaveText(/15 of 15$/);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 await jump.selectOption('0');
 await expect(offers.first().getByRole('heading')).toBeFocused();
 await expect(previous).toBeDisabled();
 const start=await track.evaluate(node=>node.scrollLeft);await next.click();await expect.poll(()=>track.evaluate(node=>node.scrollLeft)).toBeGreaterThan(start);
 const advanced=await track.evaluate(node=>node.scrollLeft);await previous.click();await expect.poll(()=>track.evaluate(node=>node.scrollLeft)).toBeLessThan(advanced);
 if(isMobile&&browserName==='chromium'){
  await track.evaluate(node=>node.scrollTo({left:0,behavior:'instant'}));await track.scrollIntoViewIfNeeded();
  const bounds=await track.boundingBox();expect(bounds).not.toBeNull();const session=await page.context().newCDPSession(page);
  try{
   const x=bounds!.x+bounds!.width-24,y=Math.max(32,bounds!.y+40);
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(const distance of [30,70,110,150])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-distance,y}]});
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await expect.poll(()=>track.evaluate(node=>node.scrollLeft)).toBeGreaterThan(30);
  }finally{await session.detach();}
 }
 expect(provider.requests('/api/travel/review')).toHaveLength(0);await expectNoHorizontalOverflow(page);await capture(page,info,'fifteen-fare-horizontal-comparison');
 // Keyboard navigation must reveal each offscreen action without selecting it.
 const actions=offers.getByRole('button',{name:'Check fare & continue',exact:true});await actions.first().focus();
 for(let index=0;index<15;index++){await expect(actions.nth(index)).toBeFocused();await expect(actions.nth(index)).toBeInViewport({ratio:.95});if(index<14)await page.keyboard.press('Tab');}
 await expect(offers.last()).toContainText('₹6,400');await expectNoHorizontalOverflow(page);await capture(page,info,'last-fare-keyboard-reachable');
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;}),submitted:unknown[]=[];
 await page.route('**/api/travel/review',async route=>{submitted.push(route.request().postDataJSON());await pending;await route.fallback();});
 try{
  await page.keyboard.press('Enter');await expect.poll(()=>submitted.length).toBe(1);
  expect(submitted[0]).toEqual({searchId,priceIds:['rail-offer-15']});
  const status=offers.last().getByRole('status'),checking=offers.last().getByRole('button',{name:'Checking fare…',exact:true});
  await expect(status).toContainText('Checking current fare… Price and availability are not confirmed yet.');
  await expect(status).toBeInViewport({ratio:.95});await expect(checking).toBeInViewport({ratio:.95});
  for(const action of await offers.locator('.fare-option-action button').all())await expect(action).toBeDisabled();
  await expect(previous).toBeDisabled();await expect(next).toBeDisabled();
  await expect(jump).toBeDisabled();
  // Repeated activation of either the chosen fare or a competing fare is inert.
  await offers.first().locator('.fare-option-action button').evaluate(node=>(node as HTMLButtonElement).click());
  await checking.evaluate(node=>(node as HTMLButtonElement).click());
  expect(submitted).toHaveLength(1);await expectNoHorizontalOverflow(page);await capture(page,info,'last-fare-pending-review');
 }finally{release();}
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/review')).toHaveLength(1);expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['rail-offer-15']});expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('a single fare fits its comparison rail without unnecessary scroll controls',async({page,provider})=>{
 const journey=flight();provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const card=page.locator('.flight-shopping-list .live-flight-card');await card.locator('.fare-comparison > summary').click();
 const track=card.locator('.fare-decision-grid');await expect(track.locator('.fare-option')).toHaveCount(1);
 const fit=await track.evaluate(node=>({available:node.clientWidth,content:node.scrollWidth}));expect(fit.content).toBeLessThanOrEqual(fit.available+1);
 await expect(card.getByRole('button',{name:'Previous fare options',exact:true})).toBeHidden();await expect(card.getByRole('button',{name:'Next fare options',exact:true})).toBeHidden();await expectNoHorizontalOverflow(page);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('mixed-currency fare comparison keeps supplier order and returns focus on Escape', async ({page,provider}) => {
 const journey: Flight = flight();
 const base = journey.totalPriceList[0];
 journey.totalPriceList = [
  {...base,id:'foreign-fare',fareIdentifier:'API_742_X',currency:'USD',customerEstimateMinor:90000},
  {...base,id:'brand-fare',fareIdentifier:'SPICESAVER',customerEstimateMinor:620000},
  {...base,id:'standard-fare',fareIdentifier:'PUBLISHED',customerEstimateMinor:580000},
 ];
 provider.search = {searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const card = page.locator('.flight-shopping-list .live-flight-card');
 const disclosure = card.locator('.fare-comparison > summary');
 await disclosure.press('Enter');
 await expect(card.getByRole('heading',{name:'Compare fares'})).toBeFocused();
 await expect(card.locator('.fare-option h4')).toHaveText(['Fare option','SpiceSaver','Standard fare']);
 await expect(card.locator('.fare-option').first()).toContainText('Price at review');
 await expect(card.locator('.fare-option').first()).not.toContainText('₹900');
 await expect(card.locator('.fare-price-comparison')).toHaveCount(0);
 await expect(card.locator('.fare-comparison-guidance')).toContainText('Price differences are unavailable across currencies.');
 await expectNoHorizontalOverflow(page);
 await page.keyboard.press('Escape');
 await expect(disclosure).toBeFocused();
 await expect(card.locator('.fare-option')).toHaveCount(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
