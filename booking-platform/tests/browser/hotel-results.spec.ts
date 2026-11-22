import {formatBookingDate} from '../../src/lib/travel-date';
import {travelDateLabel} from '../../src/lib/travel-date';
import {toggleResultSearch, test,expect,capture,departure,returning,searchId,expectNoHorizontalOverflow} from './fixtures';
import type {Page} from '@playwright/test';
async function filters(page:Page,open:boolean){
 const dialog=page.getByRole('dialog',{name:'Filter stays',exact:true});
 if(!open){if(await dialog.isVisible())await dialog.getByRole('button',{name:'Close filters',exact:true}).click();return;}
 const toggle=page.getByRole('button',{name:/^Filters/});
 if(await toggle.isVisible()){await toggle.focus();await page.keyboard.press('Enter');await expect(dialog).toBeVisible();}
}
const photo='https://i.travelapi.com/lodging/123/property.jpg';
const hotels=[
 {tjHotelId:'10001',name:'Palm House',customerEstimateMinor:800000,property:{address:'Example Road, Goa',starRating:4,propertyType:'Hotel',amenities:['Parking','parking','Wi-Fi','Restaurant'],photos:[{url:photo,isHero:true}]}},
 {tjHotelId:'10002',name:'Bay Stay',customerEstimateMinor:400000,property:{address:'Bay Road, Goa',starRating:3,propertyType:'Resort',amenities:['Pool'],photos:[{url:photo,isHero:true}]}},
 {tjHotelId:'10003',name:'Unknown Stay',property:{amenities:[]}},
];
test.beforeEach(async({page})=>{
 await page.route(photo,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#a7c8c5"/><text x="20" y="80">Synthetic property fixture</text></svg>'}));
});

test('hotel search with no stays opens the existing search criteria from the empty state',async({page,provider})=>{
 provider.search={searchId,results:{hotels:[]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 const empty=page.locator('#booking-results .empty-results');
 await expect(empty.getByRole('heading',{name:'No stays found',exact:true})).toBeVisible();
 await empty.getByRole('button',{name:'Edit stay search',exact:true}).click();
 await expect(page.getByLabel('Destination',{exact:true})).toBeFocused();
 await expect(page.getByLabel('Destination',{exact:true})).toHaveValue('Goa');
 await expect(page.getByLabel('Check-in',{exact:true})).toHaveValue(formatBookingDate(departure));
 await expect(page.getByLabel('Check-out',{exact:true})).toHaveValue(formatBookingDate(returning));
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(0);
});

for(const width of [320,390])test(`${width}px hotel totals and room actions stay readable without splitting amounts`,async({page,provider},testInfo)=>{
 await page.setViewportSize({width,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 const amounts=[204659,12345678];
 provider.search={searchId,results:{hotels:amounts.map((amount,index)=>({tjHotelId:`1000${index+1}`,name:`Mobile stay ${index+1}`,customerEstimateMinor:amount}))}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:amounts.map((amount,index)=>({optionId:`mobile-room-${index}`,roomInfo:[{name:`Room ${index+1}`}],pricing:{totalPrice:amount/100,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}}))}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001,10002',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 const cards=page.locator('.hotel-shopping-card');
 await expect(cards).toHaveCount(2);
 const missingPhoto=cards.first().locator('.hotel-card-photo');
 await expect(missingPhoto).toContainText('Property photos not available');
 expect((await missingPhoto.boundingBox())!.height).toBeLessThanOrEqual(64);
 await page.evaluate(async()=>{await document.fonts.ready;});
 // A document overflow assertion alone misses prices wrapped at the decimal.
 const amountBounds=async(selector:string,index:number)=>page.locator(selector).nth(index).evaluate(node=>{
  const amount=Array.from(node.childNodes).find(child=>child.nodeType===Node.TEXT_NODE&&child.textContent?.includes('₹'));
  if(!amount)throw new Error('Expected a formatted rupee amount');
  const range=document.createRange();range.selectNodeContents(amount);
  const lines=Array.from(range.getClientRects()).filter(rect=>rect.width>0),box=node.getBoundingClientRect();
  return {lines:lines.length,left:box.left,right:box.right,textLeft:Math.min(...lines.map(line=>line.left)),textRight:Math.max(...lines.map(line=>line.right))};
 });
 for(let index=0;index<2;index++){
  await cards.nth(index).locator('.hotel-result-action').scrollIntoViewIfNeeded();
  const bounds=await amountBounds('.hotel-shopping-card .hotel-stay-price>strong',index);
  expect(bounds.lines).toBe(1);expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.left);expect(bounds.textRight).toBeLessThanOrEqual(bounds.right);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`mobile-hotel-total-${index}`,{body:await page.screenshot({path:testInfo.outputPath(`mobile-hotel-total-${index}.png`),animations:'disabled'}),contentType:'image/png'});
 }
 await cards.first().getByRole('button',{name:'Choose room',exact:true}).click();
 const rates=page.locator('.stay-room-rate');
 await expect(rates).toHaveCount(2);
 const preview=await amountBounds('.stay-preview-price>strong',0);
 expect(preview.lines).toBe(1);expect(preview.textRight).toBeLessThanOrEqual(preview.right);
 for(let index=0;index<2;index++){
  const action=rates.nth(index).locator('.stay-room-rate-action');
  await action.scrollIntoViewIfNeeded();
  const bounds=await amountBounds('.stay-room-rate-action>strong',index);
  expect(bounds.lines).toBe(1);expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.left);expect(bounds.textRight).toBeLessThanOrEqual(bounds.right);
  const button=action.getByRole('button',{name:'Continue with room',exact:true});
  const buttonBounds=await button.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const box=node.getBoundingClientRect(),text=range.getBoundingClientRect();return {height:box.height,left:box.left,right:box.right,textLeft:text.left,textRight:text.right,lines:range.getClientRects().length};});
  expect(buttonBounds.lines).toBe(1);expect(buttonBounds.height).toBeGreaterThanOrEqual(44);
  expect(buttonBounds.textLeft).toBeGreaterThanOrEqual(buttonBounds.left);expect(buttonBounds.textRight).toBeLessThanOrEqual(buttonBounds.right);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`mobile-room-action-${index}`,{body:await page.screenshot({path:testInfo.outputPath(`mobile-room-action-${index}.png`),animations:'disabled'}),contentType:'image/png'});
 }
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('hotel results prioritize real stay totals with scoped filters, sorting and intact room flow',async({page,provider},testInfo)=>{

 provider.search={searchId,results:{hotels}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property:hotels[0].property,options:[{optionId:'room1',roomInfo:[{name:'Deluxe twin room'}],mealBasis:'Room only',pricing:{totalPrice:8000,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001,10002,10003',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 const cards=page.locator('.hotel-shopping-card');
 await expect(cards).toHaveCount(3);await expect(cards.first()).toHaveAttribute('aria-label','Bay Stay');
 await expect(page.getByRole('status').filter({hasText:'3 of 3 loaded stays'})).toBeVisible();
 await expect(cards.first()).toContainText('Estimated stay total');await expect(cards.first()).toContainText('1 room · 2 guests');
 await expect(cards.first()).toContainText('From ₹4,000');await expect(cards.first()).not.toContainText('per night');
 await expect(page.getByRole('article',{name:'Unknown Stay',exact:true})).toContainText('Price available with rooms');
 await expect(page.getByRole('article',{name:'Palm House',exact:true}).getByRole('listitem').filter({hasText:/^parking$/i})).toHaveCount(1);
 const firstTop=await cards.first().evaluate(node=>node.getBoundingClientRect().top+window.scrollY);
 expect(firstTop).toBeLessThan((page.viewportSize()?.height??844)*.85);
 await expectNoHorizontalOverflow(page);
 // Preserve actual post-search scroll; neutral focus must not reveal the skip-link in captures.
 await page.locator('#hotel-results-title').evaluate(node=>(node as HTMLElement).focus({preventScroll:true}));
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>{let last=scrollY,stable=0,frames=0;function tick(){stable=Math.abs(scrollY-last)<1?stable+1:0;last=scrollY;if(stable>=8||++frames>=120)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});});
 const geometry=await cards.first().evaluate(node=>{const rect=(element:Element|null)=>{const r=element!.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {scrollY,viewportHeight:innerHeight,card:rect(node),name:rect(node.querySelector('h3')),cta:rect(node.querySelector('button')),activeElement:document.activeElement?.id};});
 await testInfo.attach('hotel-loaded-viewport-geometry',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});
 await expect(cards.first()).toBeInViewport();
 expect(geometry.name.top).toBeGreaterThanOrEqual(0);expect(geometry.name.bottom).toBeLessThan(geometry.viewportHeight);
 expect(geometry.cta.top).toBeLessThan(geometry.viewportHeight*1.5);
 const viewport=await page.screenshot({path:testInfo.outputPath(`hotel-shopping-viewport-${testInfo.project.name}-synthetic.png`),fullPage:false,animations:'disabled'});
 await testInfo.attach('hotel-shopping viewport · synthetic provider data',{body:viewport,contentType:'image/png'});
 await capture(page,testInfo,'hotel-shopping-loaded');
 await expect(page.locator('#booking-search>summary')).toContainText('Goa');
 await expect(page.locator('#booking-search>summary')).toContainText(travelDateLabel(departure));
 await expect(page.locator('#booking-search>summary')).toContainText(travelDateLabel(returning));
 await toggleResultSearch(page);await expect(page.getByLabel('Destination',{exact:true})).toBeFocused();
 await expect(page.getByLabel('Check-in',{exact:true})).toHaveValue(formatBookingDate(departure));await expect(page.getByLabel('Check-out',{exact:true})).toHaveValue(formatBookingDate(returning));
 await expect(cards).toHaveCount(3);await toggleResultSearch(page);
 await filters(page,true);
 await page.getByLabel('Maximum stay total (₹)',{exact:true}).fill('5000');await expect(cards).toHaveCount(1);await expect(cards.first()).toHaveAttribute('aria-label','Bay Stay');
 await filters(page,false);await page.getByRole('button',{name:'Remove budget filter'}).click();await expect(cards).toHaveCount(3);await filters(page,true);
 await page.getByLabel('Property category',{exact:true}).selectOption('4');await expect(cards).toHaveCount(1);
 await page.getByLabel('Property name',{exact:true}).fill('not present');await filters(page,false);await expect(page.getByRole('heading',{name:'No stays match your filters'})).toBeVisible();await filters(page,true);
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(cards).toHaveCount(3);
 await page.getByLabel('Property type',{exact:true}).selectOption('Resort');await expect(cards).toHaveCount(1);
 await filters(page,false);await filters(page,true);await expect(page.getByLabel('Property type',{exact:true})).toHaveValue('Resort');
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 await filters(page,false);
 await page.getByLabel('Sort stays',{exact:true}).selectOption('price-desc');await expect(cards.first()).toHaveAttribute('aria-label','Palm House');
 await expect(cards.last()).toHaveAttribute('aria-label','Unknown Stay');
 await cards.first().getByRole('button',{name:'Choose room'}).click();
 await expect(page.locator('.stay-room-group-heading').getByRole('heading',{name:'Deluxe twin room',exact:true})).toBeVisible();
 await expect(page.locator('#hotel-detail-title')).toHaveRole('heading');
 await expect(page.locator('#hotel-detail-title')).toHaveText('Palm House');
 await expect(page.getByRole('heading',{level:1,name:'Choose your room',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{level:2,name:'Choose your room',exact:true})).toHaveCount(1);
 await expect(page.locator('#hotel-room-options-title')).toBeFocused();
 await expect(page.locator('#hotel-room-options-title')).toBeInViewport();
 expect(provider.requests('/api/travel/hotel-detail')[0].body).toMatchObject({searchId,hid:'10001'});
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/search')[0].body).toMatchObject({checkIn:departure,checkOut:returning});expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'hotel-shopping-room-options');
 await page.getByRole('button',{name:'Back to stays',exact:true}).click();
 await expect(cards.first()).toHaveAttribute('aria-label','Palm House');
 await expect(cards.first().getByRole('button',{name:'Choose room'})).toBeFocused();
 await expect(page.getByLabel('Sort stays',{exact:true})).toHaveValue('price-desc');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
});

test('unsubmitted hotel date edits preserve searched totals; a fresh search resets scoped filters',async({page,provider})=>{
 provider.search={searchId,results:{hotels}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001,10002,10003',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 const cards=page.locator('.hotel-shopping-card');await expect(cards).toHaveCount(3);
 const original=await cards.first().locator('.hotel-stay-price').innerText();
 await toggleResultSearch(page);
 const changed=new Date(returning+'T00:00:00Z');changed.setUTCDate(changed.getUTCDate()+1);
 await page.getByLabel('Check-out',{exact:true}).fill(changed.toISOString().slice(0,10));
 await toggleResultSearch(page);
 await expect(cards.first().locator('.hotel-stay-price')).toHaveText(original,{useInnerText:true});
 await cards.first().getByRole('button',{name:'Choose room'}).click();
 expect(provider.requests('/api/travel/hotel-detail')[0].body).toMatchObject({searchId,hid:'10002'});
 await page.getByRole('button',{name:'Back to stays',exact:true}).click();
 await expect(cards.first().getByRole('button',{name:'Choose room'})).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await filters(page,true);
 await page.getByLabel('Property name',{exact:true}).fill('Palm');await expect(cards).toHaveCount(1);
 provider.search={searchId:'11111111-1111-4111-8111-111111111119',results:{hotels}};
 await filters(page,false);await toggleResultSearch(page);await page.getByRole('button',{name:'Search stays',exact:true}).click();
 await expect(cards).toHaveCount(3);await expect(page.locator('#booking-search>summary')).toContainText(travelDateLabel(changed.toISOString().slice(0,10)));
 await filters(page,true);await expect(page.getByLabel('Property name',{exact:true})).toHaveValue('');await filters(page,false);
 expect(provider.requests('/api/travel/search')).toHaveLength(2);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('reduced motion keeps post-search result navigation immediate',async({page,provider})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{const original=Element.prototype.scrollIntoView;const recorded:ScrollBehavior[]=[];Object.defineProperty(window,'__resultScrollBehaviors',{value:recorded});Element.prototype.scrollIntoView=function(options?:boolean|ScrollIntoViewOptions){if(this.id==='booking-results'&&typeof options==='object'&&options.behavior)recorded.push(options.behavior);return original.call(this,options);};});
 provider.search={searchId,results:{hotels}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001,10002,10003',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 await expect(page.locator('.hotel-shopping-card')).toHaveCount(3);
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__resultScrollBehaviors:ScrollBehavior[]}).__resultScrollBehaviors)).toEqual(['auto']);
 await expect(page.locator('.hotel-shopping-card').first()).toBeInViewport();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});
