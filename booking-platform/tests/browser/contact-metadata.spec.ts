import path from 'node:path';
import {test,expect,departure,returning,searchId,expectNoHorizontalOverflow,capture} from './fixtures';

for(const narrow of [false,true]){
 test(`contact exposes its existing channels before editorial content${narrow?' at 320px':''}`,async({page,provider},testInfo)=>{
  if(narrow)await page.setViewportSize({width:320,height:844});
  await page.goto('/contact');
  const action=page.getByRole('link',{name:'See contact options',exact:true});
  const bounds=await action.boundingBox();expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(await page.evaluate(()=>innerHeight));
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`contact-entry${narrow?'-320':''}-viewport`,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  await action.focus();await page.keyboard.press('Enter');
  const contacts=page.getByRole('region',{name:'MaxTravel office and contact details'});
  await expect(contacts).toBeFocused();
  await expect(contacts.locator('a[href="tel:+917095018018"]')).toBeInViewport();
  await expect(contacts.locator('a[href="mailto:max@maxtravel.us"]')).toBeVisible();
  await expect(contacts).toContainText('Every day, 9:00 am–9:00 pm (India time)');
  await expect(page).toHaveURL(/\/contact#contact-options$/);
  await testInfo.attach(`contact-options${narrow?'-320':''}-viewport`,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 });
}

const hotelQuery='/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'});

test('pending hotel details are distinct from absence and never replace rates or the photo slot',async({page,provider},testInfo)=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 const photo='https://i.travelapi.com/lodging/fixture/goa.jpg';
 await page.route(photo,route=>route.fulfill({path:path.resolve('public/travel/goa.jpg'),contentType:'image/jpeg'}));
 await page.route('**/api/travel/hotel-content',async route=>{await held;await route.fulfill({json:{searchId,properties:{'10001':{address:'Fixture address, Goa',starRating:4,amenities:[],photos:[{url:photo,caption:'Layout sample, not published inventory'}]}}}});});
 provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'Goa layout sample',customerEstimateMinor:800000,propertyContentStatus:'pending',property:{amenities:[]}}]}};
 let photoHeight=0;
 try{
  await page.goto(hotelQuery);
  const card=page.getByRole('article',{name:'Goa layout sample'});
  await expect(page.locator('.hotel-content-status')).toHaveText('Adding property details…');
  await expect(card).toContainText('Property photos loading…');
  await expect(card).toContainText('Address details loading…');
  await expect(card).not.toContainText('not supplied');
  await expect(card).toContainText('₹8,000.00');
  await expect(card.getByRole('button',{name:/Choose room/})).toBeEnabled();
  await expect(page.locator('#booking-pending')).toHaveCount(0);
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>((resolve,reject)=>{let last=scrollY,stable=0,frames=0;const tick=()=>{stable=Math.abs(scrollY-last)<1?stable+1:0;last=scrollY;if(stable>=8)resolve();else if(++frames>=180)reject(new Error('Search scroll did not settle'));else requestAnimationFrame(tick);};requestAnimationFrame(tick);});});
  await testInfo.attach('metadata-pending-layout',{body:JSON.stringify(await card.evaluate(node=>({scrollY,viewport:innerHeight,card:node.getBoundingClientRect().toJSON()}))),contentType:'application/json'});
  photoHeight=(await card.locator('.hotel-card-photo').boundingBox())!.height;
  await testInfo.attach('hotel-property-details-pending-viewport',{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  // Keep the natural pending-to-loaded scroll position: no intervening full-page capture.
 }finally{release();}
 const card=page.getByRole('article',{name:'Goa layout sample'});
 await expect(card).toContainText('Fixture address, Goa');
 await expect(page.locator('.hotel-content-status')).toHaveText('Compare room options.');
 await expect.poll(()=>card.locator('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 expect(Math.abs((await card.locator('.hotel-card-photo').boundingBox())!.height-photoHeight)).toBeLessThanOrEqual(1);
 await expect(card).toContainText('₹8,000.00');
 await expect(card.getByRole('button',{name:/Choose room/})).toBeEnabled();
 await expectNoHorizontalOverflow(page);
 await testInfo.attach('metadata-loaded-layout',{body:JSON.stringify(await card.evaluate(node=>({scrollY,viewport:innerHeight,card:node.getBoundingClientRect().toJSON()}))),contentType:'application/json'});
 await testInfo.attach('hotel-property-details-loaded-viewport',{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
 await capture(page,testInfo,'hotel-property-details-loaded');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const outcome of ['absent','failure','supplier failure','missing status','mismatched search'] as const){
 test(`optional hotel content ${outcome} has truthful final wording without losing rates`,async({page,provider})=>{
  await page.route('**/api/travel/hotel-content',route=>route.fulfill(outcome==='failure'?{status:503,json:{error:'Fixture unavailable'}}:{json:{searchId:outcome==='mismatched search'?'11111111-1111-4111-8111-111111111119':searchId,properties:{},...(outcome==='supplier failure'?{propertyContentStatuses:{'10001':'unavailable'}}:outcome==='missing status'?{propertyContentStatuses:{}}:{})}}));
  provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'Fixture Stay',customerEstimateMinor:800000,propertyContentStatus:'pending',property:{amenities:[]}}]}};
  await page.goto(hotelQuery);
  const card=page.getByRole('article',{name:'Fixture Stay'});
  await expect(page.locator('.hotel-content-status')).toHaveText(outcome==='absent'?'Compare room options.':'Some details unavailable.');
  await expect(card).toContainText(outcome==='absent'?'Property photos not available':'Property photos unavailable right now');
  await expect(card).toContainText(outcome==='absent'?'Address details not supplied':'Address unavailable right now');
  await expect(card).not.toContainText('loading…');
  await expect(card).toContainText('₹8,000.00');
  await expect(card.getByRole('button',{name:/Choose room/})).toBeEnabled();
  await expect(page.locator('#booking-feedback')).toBeEmpty();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 });
}

test('cached values and known missing fields stay truthful while another property is pending or fails',async({page,provider})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 const photo='https://i.travelapi.com/lodging/fixture/cached-goa.jpg';
 await page.route(photo,route=>route.fulfill({path:path.resolve('public/travel/goa.jpg'),contentType:'image/jpeg'}));
 await page.route('**/api/travel/hotel-content',async route=>{await held;await route.fulfill({status:503,json:{error:'Fixture unavailable'}});});
 provider.search={searchId,propertyContentPending:true,results:{hotels:[
  {tjHotelId:'10001',name:'Cached Stay',customerEstimateMinor:800000,propertyContentStatus:'resolved',property:{address:'Cached fixture address',starRating:4,amenities:[],photos:[{url:photo,caption:'Cached layout sample'}]}},
  {tjHotelId:'10002',name:'Uncached Stay',customerEstimateMinor:900000,propertyContentStatus:'pending',property:{amenities:[]}},
  {tjHotelId:'10003',name:'Cached empty Stay',customerEstimateMinor:1000000,propertyContentStatus:'resolved',property:{amenities:[]}},
 ]}};
 const cached=page.getByRole('article',{name:'Cached Stay',exact:true});
 const cachedEmpty=page.getByRole('article',{name:'Cached empty Stay',exact:true});
 try{
  await page.goto(hotelQuery);
  await expect(page.locator('.hotel-content-status')).toHaveText('Adding property details…');
  await expect(cachedEmpty).toContainText('Property photos not available');
  await expect(cachedEmpty).toContainText('Address details not supplied');
  await expect(cachedEmpty).not.toContainText('loading…');
  await expect(page.getByRole('article',{name:'Uncached Stay'})).toContainText('Address details loading…');
  await expect(cached).toContainText('Cached fixture address');
 }finally{release();}
 await expect(page.locator('.hotel-content-status')).toHaveText('Some details unavailable.');
 await expect(cached).toContainText('Cached fixture address');
 await expect(cached).toContainText('Property category: 4 stars');
 await expect(cached).not.toContainText('unavailable right now');
 await expect.poll(()=>cached.locator('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await expect(cachedEmpty).toContainText('Property photos not available');
 await expect(cachedEmpty).toContainText('Address details not supplied');
 await expect(page.getByRole('article',{name:'Uncached Stay'})).toContainText('Address unavailable right now');
 await expect(cached.getByRole('button',{name:/Choose room/})).toBeEnabled();
});

test('a cached unavailable outcome stays distinct from genuine absence without another metadata request',async({page,provider})=>{
 let contentCalls=0;
 await page.route('**/api/travel/hotel-content',route=>{contentCalls+=1;return route.fulfill({json:{searchId,properties:{}}});});
 provider.search={searchId,propertyContentPending:false,results:{hotels:[{tjHotelId:'10001',name:'Unavailable details Stay',customerEstimateMinor:800000,propertyContentStatus:'unavailable',property:{amenities:[]}}]}};
 await page.goto(hotelQuery);
 await expect(page.locator('.hotel-content-status')).toHaveText('Some details unavailable.');
 const card=page.getByRole('article',{name:'Unavailable details Stay'});
 await expect(card).toContainText('Address unavailable right now');
 await expect(card).not.toContainText('not supplied');
 await expect(card).toContainText('₹8,000.00');
 await expect(card.getByRole('button',{name:/Choose room/})).toBeEnabled();
 expect(contentCalls).toBe(0);
});

for(const narrow of [false,true]){
 test(`hotel sort and filters share a compact readable mobile row${narrow?' at 320px':''}`,async({page,provider},testInfo)=>{
  if(narrow)await page.setViewportSize({width:320,height:844});
  provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Toolbar fixture stay',customerEstimateMinor:800000,propertyContentStatus:'resolved',property:{amenities:[]}}]}};
  await page.goto(hotelQuery);
  const select=page.getByRole('combobox',{name:'Sort stays',exact:true});await expect(select).toBeVisible();
  const mobile=(page.viewportSize()?.width??1440)<=600;
  for(const value of ['price','price-desc','name','supplier']){
   await select.selectOption(value);
   const geometry=await select.evaluate(element=>{
    const s=element as HTMLSelectElement,button=document.querySelector('.hotel-filter-toggle')!,style=getComputedStyle(s),r=s.getBoundingClientRect(),b=button.getBoundingClientRect();
    const ctx=document.createElement('canvas').getContext('2d')!;ctx.font=style.font;
    return {left:r.left,right:r.right,bottom:r.bottom,height:r.height,buttonLeft:b.left,buttonRight:b.right,buttonBottom:b.bottom,buttonHeight:b.height,viewport:innerWidth,text:ctx.measureText(s.selectedOptions[0].text).width,available:s.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};
   });
   expect(geometry.text).toBeLessThanOrEqual(geometry.available);
   if(mobile){expect(geometry.height).toBeGreaterThanOrEqual(44);expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);expect(Math.abs(geometry.bottom-geometry.buttonBottom)).toBeLessThan(1);expect(geometry.right).toBeLessThanOrEqual(geometry.buttonLeft);expect(geometry.left).toBeGreaterThanOrEqual(0);expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.viewport);}
  }
  await expect(page.locator('.hotel-content-status')).toHaveText('Compare room options.');await expectNoHorizontalOverflow(page);
  await testInfo.attach(`hotel-compact-toolbar${narrow?'-320':''}-viewport`,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
 });
}
