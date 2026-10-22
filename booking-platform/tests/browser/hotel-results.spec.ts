import {test,expect,capture,departure,returning,searchId,expectNoHorizontalOverflow} from './fixtures';
const photo='https://i.travelapi.com/lodging/123/property.jpg';
const hotels=[
 {tjHotelId:'10001',name:'Palm House',customerEstimateMinor:800000,property:{address:'Example Road, Goa',starRating:4,propertyType:'Hotel',amenities:['Parking','parking','Wi-Fi','Restaurant'],photos:[{url:photo,isHero:true}]}},
 {tjHotelId:'10002',name:'Bay Stay',customerEstimateMinor:400000,property:{address:'Bay Road, Goa',starRating:3,propertyType:'Resort',amenities:['Pool'],photos:[{url:photo,isHero:true}]}},
 {tjHotelId:'10003',name:'Unknown Stay',property:{amenities:[]}},
];
test.beforeEach(async({page})=>{
 await page.route(photo,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#a7c8c5"/><text x="20" y="80">Synthetic property fixture</text></svg>'}));
});

test('hotel results prioritize real stay totals with scoped filters, sorting and intact room flow',async({page,provider},testInfo)=>{

 provider.search={searchId,results:{hotels}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property:hotels[0].property,options:[{optionId:'room1',roomInfo:[{name:'Deluxe twin room'}],mealBasis:'Room only',pricing:{totalPrice:8000,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001,10002,10003',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 const cards=page.locator('.hotel-shopping-card');
 await expect(cards).toHaveCount(3);await expect(cards.first()).toHaveAttribute('aria-label','Bay Stay');
 await expect(page.getByRole('status').filter({hasText:'3 of 3 stays in this search'})).toBeVisible();
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
 expect(geometry.scrollY).toBeGreaterThan(0);
 expect(geometry.name.top).toBeGreaterThanOrEqual(0);expect(geometry.name.bottom).toBeLessThan(geometry.viewportHeight);
 expect(geometry.cta.top).toBeLessThan(geometry.viewportHeight*1.5);
 const viewport=await page.screenshot({path:testInfo.outputPath(`hotel-shopping-viewport-${testInfo.project.name}-synthetic.png`),fullPage:false,animations:'disabled'});
 await testInfo.attach('hotel-shopping viewport · synthetic provider data',{body:viewport,contentType:'image/png'});
 await capture(page,testInfo,'hotel-shopping-loaded');
 await expect(page.locator('#booking-search>summary')).toContainText('Goa');
 await expect(page.locator('#booking-search>summary')).toContainText(departure);
 await expect(page.locator('#booking-search>summary')).toContainText(returning);
 await page.locator('#booking-search>summary').click();await expect(page.getByLabel('Destination',{exact:true})).toBeFocused();
 await expect(cards).toHaveCount(3);await page.locator('#booking-search>summary').click();
 const toggle=page.getByRole('button',{name:/^Filters/});
 if(await toggle.isVisible()){await toggle.focus();await page.keyboard.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','true');}
 await page.getByLabel('Maximum stay total (₹)',{exact:true}).fill('5000');await expect(cards).toHaveCount(1);await expect(cards.first()).toHaveAttribute('aria-label','Bay Stay');
 await page.getByRole('button',{name:'Remove budget filter'}).click();await expect(cards).toHaveCount(3);
 await page.getByLabel('Property category',{exact:true}).selectOption('4');await expect(cards).toHaveCount(1);
 await page.getByLabel('Property name',{exact:true}).fill('not present');await expect(page.getByRole('heading',{name:'No stays match your filters'})).toBeVisible();
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(cards).toHaveCount(3);
 await page.getByLabel('Property type',{exact:true}).selectOption('Resort');await expect(cards).toHaveCount(1);
 if(await toggle.isVisible()){await toggle.click();await toggle.click();await expect(page.getByLabel('Property type',{exact:true})).toHaveValue('Resort');}
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 if(await toggle.isVisible())await toggle.click();
 await page.getByLabel('Sort stays',{exact:true}).selectOption('price-desc');await expect(cards.first()).toHaveAttribute('aria-label','Palm House');
 await expect(cards.last()).toHaveAttribute('aria-label','Unknown Stay');
 await cards.first().getByRole('button',{name:'Choose room'}).click();
 await expect(page.getByRole('heading',{name:'Deluxe twin room',exact:true})).toBeVisible();
 await expect(page.locator('#room-choice-title')).toHaveRole('heading');
 await expect(page.locator('#room-choice-title')).toHaveText('Choose your room');
 await expect(page.locator('#room-choice-title')).toBeFocused();
 expect(provider.requests('/api/travel/hotel-detail')[0].body).toMatchObject({searchId,hid:'10001'});
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/payments/create')).toHaveLength(0);
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
 await page.locator('#booking-search>summary').click();
 const changed=new Date(returning+'T00:00:00Z');changed.setUTCDate(changed.getUTCDate()+1);
 await page.getByLabel('Check-out',{exact:true}).fill(changed.toISOString().slice(0,10));
 await page.locator('#booking-search>summary').click();
 await expect(cards.first().locator('.hotel-stay-price')).toHaveText(original,{useInnerText:true});
 await cards.first().getByRole('button',{name:'Choose room'}).click();
 expect(provider.requests('/api/travel/hotel-detail')[0].body).toMatchObject({searchId,hid:'10002'});
 await page.getByRole('button',{name:'Back to stays',exact:true}).click();
 await expect(cards.first().getByRole('button',{name:'Choose room'})).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 const toggle=page.getByRole('button',{name:/^Filters/});if(await toggle.isVisible())await toggle.click();
 await page.getByLabel('Property name',{exact:true}).fill('Palm');await expect(cards).toHaveCount(1);
 provider.search={searchId:'11111111-1111-4111-8111-111111111119',results:{hotels}};
 await page.locator('#booking-search>summary').click();await page.getByRole('button',{name:'Search stays',exact:true}).click();
 await expect(cards).toHaveCount(3);await expect(page.locator('#booking-search>summary')).toContainText(changed.toISOString().slice(0,10));
 if(await toggle.isVisible())await toggle.click();await expect(page.getByLabel('Property name',{exact:true})).toHaveValue('');
 expect(provider.requests('/api/travel/search')).toHaveLength(2);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('reduced motion keeps post-search result navigation immediate',async({page,provider})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{const original=Element.prototype.scrollIntoView;const recorded:ScrollBehavior[]=[];Object.defineProperty(window,'__resultScrollBehaviors',{value:recorded});Element.prototype.scrollIntoView=function(options?:boolean|ScrollIntoViewOptions){if(this.id==='booking-results'&&typeof options==='object'&&options.behavior)recorded.push(options.behavior);return original.call(this,options);};});
 provider.search={searchId,results:{hotels}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001,10002,10003',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 await expect(page.locator('.hotel-shopping-card')).toHaveCount(3);
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__resultScrollBehaviors:ScrollBehavior[]}).__resultScrollBehaviors)).toEqual(['auto']);
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});
