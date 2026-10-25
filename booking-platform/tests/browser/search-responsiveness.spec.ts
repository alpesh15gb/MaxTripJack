import type {Request} from '@playwright/test';
import {test,expect,flight,departure,returning,searchId,hotelOption,reviewedQuote,expectNoHorizontalOverflow,capture} from './fixtures';

for(const product of ['FLIGHT','HOTEL'] as const){
 test(`${product} shows visible feedback while supplier response is held`,async({page,provider},testInfo)=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  let requested=false;
  await page.route('**/api/travel/search',async route=>{requested=true;await held;await route.fulfill({json:product==='FLIGHT'?provider.search:{searchId,results:{hotels:[{tjHotelId:'10001',name:'Fixture Stay',customerEstimateMinor:800000}]}}});});
  const query:Record<string,string>=product==='FLIGHT'?{product,from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}:{product,city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'};
  try{
   await page.goto('/book?'+new URLSearchParams(query));
   const pending=page.getByRole('status',{name:'Search and booking activity'});
   await expect(pending).toContainText('Waiting for live supplier availability');
   await expect(pending).toBeInViewport();expect(requested).toBe(true);
   await expect(page.locator('#booking-results')).toHaveCount(0);
   await expect(page.getByRole('form',{name:'Search availability'}).getByRole('button',{name:'Checking availability…',exact:true})).toBeDisabled();
   await expectNoHorizontalOverflow(page);
   await testInfo.attach(`${product.toLowerCase()}-pending-viewport`,{body:await page.screenshot({fullPage:false,animations:'disabled'}),contentType:'image/png'});
   await capture(page,testInfo,`${product.toLowerCase()}-supplier-pending`);
  }finally{release();}
  await expect(page.locator('#booking-results')).toBeVisible();
  await expect(page.locator('#booking-pending')).toHaveCount(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 });
}

test('large flight response mounts fare details only when opened and retains all options',async({page,provider},testInfo)=>{
 const flights=Array.from({length:145},(_,i)=>{const row=flight('ONWARD',`fare-${i}`);row.totalPriceList=Array.from({length:8},(_,j)=>({...row.totalPriceList[0],id:`fare-${i}-${j}`,customerEstimateMinor:654000+i*100+j}));return row;});
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:flights}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const cards=page.locator('.flight-shopping-list .live-flight-card');await expect(cards).toHaveCount(145);
 await expect(page.locator('.fare-comparison-options')).toHaveCount(0);
 await expect(page.locator('.flight-results-count,.results-count').filter({hasText:'145 of 145'})).toBeVisible();
 const first=cards.first();const disclosure=first.locator('.fare-comparison>summary');
 await disclosure.focus();await page.keyboard.press('Enter');await expect(first.locator('.fare-option')).toHaveCount(8);
 await first.locator('.fare-comparison>summary').click();await expect(first.locator('.fare-option')).toHaveCount(0);
 await disclosure.focus();await page.keyboard.press('Space');await expect(first.locator('.fare-option')).toHaveCount(8);
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'large-flight-response');
 await disclosure.focus();await page.keyboard.press('Tab');
 await expect(first.getByRole('button',{name:'Back to flights',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(first.getByRole('button',{name:'Check fare & continue',exact:true}).first()).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['fare-0-0']});
});

test('hotel rates and room actions render before optional content; stale content cannot change new results',async({page,provider})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let contentRequested=false;
 await page.route('**/api/travel/hotel-content',async route=>{contentRequested=true;await held;await route.fulfill({json:{searchId,properties:{'10001':{address:'Old search address',amenities:[]}}}}).catch(()=>{});});
 provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'Initial Stay',customerEstimateMinor:800000}]}};
 try{
  await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'}));
  await expect(page.getByRole('article',{name:'Initial Stay'})).toContainText('₹8,000.00');
  await expect(page.getByRole('button',{name:/Choose room/})).toBeEnabled();
  await expect.poll(()=>contentRequested).toBe(true);await expect(page.locator('#booking-pending')).toHaveCount(0);
  provider.search={searchId:'11111111-1111-4111-8111-111111111119',results:{hotels:[{tjHotelId:'10001',name:'New Stay',customerEstimateMinor:900000}]}};
  await page.locator('#booking-search>summary').click();await page.getByRole('button',{name:'Search stays',exact:true}).click();
  await expect(page.getByRole('article',{name:'New Stay'})).toContainText('₹9,000.00');
 }finally{release();}
 await expect(page.getByText('Old search address',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('article',{name:'New Stay'})).toContainText('₹9,000.00');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('optional hotel content failure leaves rates and room actions usable without search error',async({page,provider})=>{
 await page.route('**/api/travel/hotel-content',route=>route.fulfill({status:503,json:{error:'Static content temporarily unavailable'}}));
 provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'Available Stay',customerEstimateMinor:800000}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'}));
 await expect(page.getByRole('article',{name:'Available Stay'})).toContainText('₹8,000.00');
 await expect(page.getByRole('button',{name:/Choose room/})).toBeEnabled();
 await expect(page.locator('#booking-feedback')).toBeEmpty();
});

test('optional hotel details enrich matching results without changing rate or filters',async({page,provider})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/travel/hotel-content',async route=>{await held;await route.fulfill({json:{searchId,properties:{'10001':{address:'Confirmed fixture address',amenities:['Pool']}}}});});
 provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'Available Stay',customerEstimateMinor:800000}]}};
 try{
  await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'}));
  await expect(page.getByRole('article',{name:'Available Stay'})).toContainText('₹8,000.00');
  const toggle=page.getByRole('button',{name:/^Filters/});if(await toggle.isVisible())await toggle.click();
  await page.getByRole('searchbox',{name:'Property name'}).fill('Available');
 }finally{release();}
 await expect(page.getByRole('article',{name:'Available Stay'})).toContainText('Confirmed fixture address');
 await expect(page.getByRole('article',{name:'Available Stay'})).toContainText('₹8,000.00');
 await expect(page.getByRole('searchbox',{name:'Property name'})).toHaveValue('Available');
});


for(const metadataFirst of [false,true]){
 test(`room rates and policy stay unchanged when metadata arrives ${metadataFirst?'before':'after'} room detail`,async({page,provider})=>{
  let releaseContent!:()=>void,releaseDetail!:()=>void;
  const heldContent=new Promise<void>(resolve=>{releaseContent=resolve;});
  const heldDetail=new Promise<void>(resolve=>{releaseDetail=resolve;});
  let contentRequested=false,detailRequested=false;
  await page.route('**/api/travel/hotel-content',async route=>{contentRequested=true;await heldContent;await route.fulfill({json:{searchId,properties:{'10001':{address:'Verified room property address',amenities:['Pool']}},propertyContentStatuses:{'10001':'resolved'}}}).catch(()=>{});});
  await page.route('**/api/travel/hotel-detail',async route=>{detailRequested=true;if(metadataFirst)await heldDetail;await route.fulfill({json:{options:[hotelOption]}}).catch(()=>{});});
  provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'Room First Stay',customerEstimateMinor:1840000}]}};
  provider.quote=reviewedQuote({product:'HOTEL',hotelName:'Room First Stay',totalMinor:1840000,summary:{checkIn:departure,checkOut:returning,adults:1},review:{conditions:{},option:hotelOption}});
  try{
   await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'}));
   await expect.poll(()=>contentRequested).toBe(true);
   await page.getByRole('button',{name:/Choose room/}).click();
   await expect.poll(()=>detailRequested).toBe(true);
   if(metadataFirst){
    releaseContent();
    await expect(page.locator('#booking-rooms')).toContainText('Verified room property address');
    releaseDetail();
   }
   const rooms=page.locator('#booking-rooms');
   await expect(rooms).toBeVisible();
   const option=rooms.locator('.room-option-card');
   await expect(option).toContainText('₹18,400.00');
   await option.locator('.stay-room-conditions>summary').click();
   await option.getByText('Supported supplier policy details',{exact:true}).click();
   await expect(option).toContainText('Cancellation charges apply after the displayed deadline.');
   const rateAndPolicy=await option.innerText();
   if(!metadataFirst){await expect(rooms).not.toContainText('Verified room property address');releaseContent();}
   await expect(rooms).toContainText('Verified room property address');
   expect(await option.innerText()).toBe(rateAndPolicy);
   await rooms.getByRole('button',{name:'Review stay',exact:true}).click();
   await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
   expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,hid:'10001',optionId:hotelOption.optionId});
   expect(provider.requests('/api/payments/create')).toHaveLength(0);
  }finally{releaseContent();releaseDetail();}
 });
}

test('late property content cannot follow a traveller into a different hotel room workspace',async({page,provider})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await page.route('**/api/travel/hotel-content',async route=>{requested=true;await held;await route.fulfill({json:{searchId,properties:{'10001':{address:'First hotel only address',amenities:[]},'10002':{address:'Second hotel verified address',amenities:[]}},propertyContentStatuses:{'10001':'resolved','10002':'resolved'}}}).catch(()=>{});});
 provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'First Stay',customerEstimateMinor:1840000},{tjHotelId:'10002',name:'Second Stay',customerEstimateMinor:1840000}]}};
 try{
  await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001,10002',date:departure,end:returning,adults:'1',autoSearch:'1'}));
  await expect.poll(()=>requested).toBe(true);
  await page.getByRole('article',{name:'First Stay'}).getByRole('button',{name:/Choose room/}).click();
  const rooms=page.locator('#booking-rooms');
  await expect(rooms.getByRole('heading',{name:'First Stay',exact:true})).toBeVisible();
  await rooms.getByRole('button',{name:'Back to stays',exact:true}).click();
  await page.getByRole('article',{name:'Second Stay'}).getByRole('button',{name:/Choose room/}).click();
  await expect(rooms.getByRole('heading',{name:'Second Stay',exact:true})).toBeVisible();
  release();
  await expect(rooms).toContainText('Second hotel verified address');
  await expect(rooms).not.toContainText('First hotel only address');
  await expect(rooms.locator('.room-option-card')).toContainText('₹18,400.00');
 }finally{release();}
});

test('leaving the search and reopening the same hotel rejects the old metadata generation',async({page,provider})=>{
 const newerSearchId='11111111-1111-4111-8111-111111111119';
 let release!:()=>void,contentSettled!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 const settled=new Promise<void>(resolve=>{contentSettled=resolve;});
 let requestSettled!:()=>void;
 const browserRequestSettled=new Promise<void>(resolve=>{requestSettled=resolve;});
 const onRequestSettled=(request:Request)=>{if(new URL(request.url()).pathname==='/api/travel/hotel-content'&&request.postDataJSON()?.searchId===searchId)requestSettled();};
 page.on('requestfinished',onRequestSettled);page.on('requestfailed',onRequestSettled);
 await page.route('**/api/travel/hotel-content',async route=>{requested=true;await held;await route.fulfill({json:{searchId,properties:{'10001':{address:'Stale room address',amenities:[]}}}}).catch(()=>{}).finally(contentSettled);});
 provider.search={searchId,propertyContentPending:true,results:{hotels:[{tjHotelId:'10001',name:'Initial Stay',customerEstimateMinor:1840000}]}};
 try{
  await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',autoSearch:'1'}));
  await expect.poll(()=>requested).toBe(true);
  await page.getByRole('button',{name:/Choose room/}).click();
  const rooms=page.locator('#booking-rooms');
  await expect(rooms).toBeVisible();
  await rooms.getByRole('button',{name:'Back to stays',exact:true}).click();
  provider.search={searchId:newerSearchId,results:{hotels:[{tjHotelId:'10001',name:'New Search Stay',customerEstimateMinor:1840000,property:{address:'Current search address',amenities:[]}}]}};
  await page.locator('#booking-search>summary').click();
  await page.getByRole('button',{name:'Search stays',exact:true}).click();
  await page.getByRole('article',{name:'New Search Stay'}).getByRole('button',{name:/Choose room/}).click();
  await expect(rooms.getByRole('heading',{name:'New Search Stay',exact:true})).toBeVisible();
  await expect(rooms).toContainText('Current search address');
  release();
  // Drain the intercepted old request and the next render; no old content may enter the current workspace.
  await settled;await browserRequestSettled;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(rooms).not.toContainText('Stale room address');
  await expect(rooms).toContainText('Current search address');
  expect(provider.requests('/api/travel/hotel-detail').map(request=>request.body)).toEqual([{searchId,hid:'10001'},{searchId:newerSearchId,hid:'10001'}]);
 }finally{release();page.off('requestfinished',onRequestSettled);page.off('requestfailed',onRequestSettled);}
});
