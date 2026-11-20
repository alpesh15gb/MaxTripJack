import {test,expect,departure,returning,searchId,flight,openFlightSearch,reviewedQuote,expectNoHorizontalOverflow,capture,type ProviderFixture} from './fixtures';
import type {Locator,Page,TestInfo} from '@playwright/test';
import type {Flight} from '../../src/lib/booking-presentation';

async function expectNativeModalTabCycle(page:Page,dialog:Locator,info:TestInfo){
 const focusState=()=>dialog.evaluate(node=>({inside:node.contains(document.activeElement),tag:document.activeElement?.tagName,id:document.activeElement?.id,documentFocused:document.hasFocus()}));
 await page.keyboard.press('Tab');
 const afterLast=await focusState();
 // Chromium can move from the last native-dialog control to browser chrome.
 // Its activeElement is then BODY; no background document control may receive focus.
 expect(afterLast.inside||afterLast.tag==='BODY').toBe(true);
 if(!afterLast.inside){await page.keyboard.press('Tab');expect((await focusState()).inside).toBe(true);}
 const afterCycle=await focusState();
 await info.attach('native-modal-tab-cycle',{body:JSON.stringify({afterLast,afterCycle}),contentType:'application/json'});
 // Native inertness must also reject a direct attempt to focus the background trigger.
 await page.locator('.flight-filter-trigger:visible,.hotel-filter-toggle:visible').evaluate(node=>(node as HTMLElement).focus());
 expect((await focusState()).inside).toBe(true);
}

function comparisonFlights(provider:ProviderFixture){
 const connector=flight('ONWARD','connector-fare');
 connector.sI=[
  {...connector.sI[0],dt:`${departure}T09:00:00+05:30`,at:`${departure}T10:00:00+05:30`,duration:60,fD:{aI:{name:'Connector Air',code:'6E'},fN:'301'},aa:{code:'AMD',city:'Ahmedabad'}},
  {...connector.sI[0],id:'connection-two',dt:`${departure}T11:00:00+05:30`,at:`${departure}T12:00:00+05:30`,duration:60,fD:{aI:{name:'Connector Air',code:'6E'},fN:'302'},da:{code:'AMD',city:'Ahmedabad'}},
 ];
 connector.totalPriceList[0].customerEstimateMinor=400000;
 const direct=flight('ONWARD','direct-fare');
 direct.sI[0]={...direct.sI[0],dt:`${departure}T06:45:00`,at:`${departure}T08:55:00`,fD:{aI:{name:'Direct Air',code:'6E'},fN:'401'}};
 direct.totalPriceList[0].customerEstimateMinor=600000;
 const fastest=flight('ONWARD','fastest-fare');
 fastest.sI[0]={...fastest.sI[0],dt:`${departure}T09:30:00`,at:`${departure}T11:00:00`,duration:90,fD:{aI:{name:'Quick Air',code:'6E'},fN:'501'}};
 fastest.totalPriceList[0].customerEstimateMinor=900000;
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[connector,direct,fastest]}}}};
}

test('flight comparison shows coherent estimates and keeps sorting independent from non-stop filtering',async({page,provider},info)=>{
 comparisonFlights(provider);
 await openFlightSearch(page);
 const choices=page.getByRole('group',{name:'Sort flights',exact:true});
 const cards=page.locator('.live-flight-card');
 await expect(cards).toHaveCount(3);
 await expect(choices).toHaveCount(1);
 await expect(choices.getByRole('button')).toHaveCount(3);
 const cheapest=choices.getByRole('button',{name:'Cheapest',exact:true});
 const fastest=choices.getByRole('button',{name:'Fastest',exact:true});
 const earliest=choices.getByRole('button',{name:'Earliest',exact:true});
 const selected=choices.getByRole('button',{pressed:true});
 await expect(selected).toHaveCount(1);
 await expect(selected).toHaveAccessibleName('Cheapest');
 await expect(cheapest).toContainText('₹4,000');
 await expect(cheapest).toContainText('3h');
 await expect(fastest).toContainText('₹9,000');
 await expect(fastest).toContainText('1h 30m');
 await expect(earliest).toContainText('06:45');
 await expect(earliest).toContainText('₹6,000');
 await fastest.click();
 await expect(cards.first().locator('.airline-identity')).toContainText('Quick Air');
 await expect(selected).toHaveAccessibleName('Fastest');
 const nonstop=page.getByRole('button',{name:'Non-stop',exact:true});
 await expect(nonstop).toHaveAttribute('aria-pressed','false');
 await nonstop.click();
 await expect(cards).toHaveCount(2);
 await expect(nonstop).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Clear all filters',exact:true})).toBeVisible();
 await expect(selected).toHaveCount(1);
 await expect(selected).toHaveAccessibleName('Fastest');
 await expect(cards.first().locator('.airline-identity')).toContainText('Quick Air');
 await expect(cheapest).toContainText('₹6,000');
 await earliest.click();
 await expect(nonstop).toHaveAttribute('aria-pressed','true');
 await expect(selected).toHaveAccessibleName('Earliest');
 await expect(cards.first().locator('.airline-identity')).toContainText('Direct Air');
 await capture(page,info,'flight-comparison-active-filters');
 await nonstop.click();
 await expect(cards).toHaveCount(3);
 await expect(selected).toHaveAccessibleName('Earliest');
 await cheapest.click();
 await expect(cards.first().locator('.airline-identity')).toContainText('Connector Air');
 await expect(selected).toHaveAccessibleName('Cheapest');
 await expectNoHorizontalOverflow(page);
 await capture(page,info,'flight-comparison-shortcuts');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('missing estimates and times do not promise a faster or earlier flight',async({page,provider})=>{
 const unknown:Flight=flight('ONWARD','unknown-metrics-fare');
 const noTimes={...unknown.sI[0],dt:'unknown',at:'unknown',duration:undefined};
 unknown.sI=[
  {...noTimes,aa:{code:'AMD',city:'Ahmedabad'}},
  {...noTimes,da:{code:'AMD',city:'Ahmedabad'}},
 ];
 unknown.totalPriceList[0].customerEstimateMinor=undefined;
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[unknown]}}}};
 await openFlightSearch(page);
 const sorts=page.getByRole('group',{name:'Sort flights',exact:true});
 await expect(sorts.getByRole('button',{name:'Cheapest',exact:true})).toBeEnabled();
 await expect(sorts.getByRole('button',{pressed:true})).toHaveAccessibleName('Cheapest');
 await expect(sorts.getByRole('button',{name:'Fastest',exact:true})).toBeDisabled();
 await expect(sorts.getByRole('button',{name:'Earliest',exact:true})).toBeDisabled();
 await expect(sorts.getByRole('button',{name:'Cheapest',exact:true})).toContainText('Price at review');
 await expect(sorts.getByRole('button',{name:'Fastest',exact:true})).toContainText('Time unavailable');
 await expect(sorts.getByRole('button',{name:'Earliest',exact:true})).toContainText('Time unavailable');
 await expect(sorts).not.toContainText('₹');
 await expect(page.getByRole('button',{name:'Non-stop',exact:true})).toBeDisabled();
 await expect(page.locator('.live-flight-card')).toHaveCount(1);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('flight sorting fits 320px and stays usable by keyboard',async({page,provider},info)=>{
 test.skip(info.project.name!=='mobile-390','One narrow and keyboard pass is sufficient');
 await page.setViewportSize({width:320,height:844});
 comparisonFlights(provider);
 await openFlightSearch(page);
 const sorts=page.getByRole('group',{name:'Sort flights',exact:true});
 const cheapest=sorts.getByRole('button',{name:'Cheapest',exact:true});
 const fastest=sorts.getByRole('button',{name:'Fastest',exact:true});
 const earliest=sorts.getByRole('button',{name:'Earliest',exact:true});
 const nonStop=page.getByRole('button',{name:'Non-stop',exact:true});
 await expect(earliest).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 await expectNoHorizontalOverflow(page);
 for(const control of [cheapest,fastest,earliest,nonStop]){
  const box=await control.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(321);
  expect(await control.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
 }
 await cheapest.focus();
 await page.keyboard.press('Tab');
 await expect(fastest).toBeFocused();
 await page.keyboard.press('Space');
 await expect(sorts.getByRole('button',{pressed:true})).toHaveAccessibleName('Fastest');
 await page.keyboard.press('Tab');
 await expect(earliest).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(sorts.getByRole('button',{pressed:true})).toHaveAccessibleName('Earliest');
 await nonStop.focus();
 await page.keyboard.press('Space');
 await expect(nonStop).toBeFocused();
 await expect(nonStop).toHaveAttribute('aria-pressed','true');
 await expect(sorts.getByRole('button',{pressed:true})).toHaveAccessibleName('Earliest');
 await expect(page.locator('.live-flight-card')).toHaveCount(2);
 await capture(page,info,'flight-comparison-320px');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('mobile flight filters contain keyboard focus and preserve refinements after closing',async({page,provider},info)=>{
 comparisonFlights(provider);
 await page.setViewportSize({width:390,height:844});
 await openFlightSearch(page);
 await expect(page.locator('.live-flight-card')).toHaveCount(3);
 const trigger=page.getByRole('button',{name:/^Filters/});
 await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Filter flights',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog).toHaveJSProperty('open',true);
 await dialog.getByLabel('Stops',{exact:true}).selectOption('0');
 const apply=dialog.getByRole('button',{name:'Show 2 flights',exact:true});
 await expect(apply).toBeVisible();
 await apply.focus();
 await expectNativeModalTabCycle(page,dialog,info);
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(trigger).toBeFocused();
 await expect(page.locator('.live-flight-card')).toHaveCount(2);
 await trigger.click();
 await expect(dialog.getByLabel('Stops',{exact:true})).toHaveValue('0');
 await dialog.getByRole('button',{name:'Reset flight filters',exact:true}).click();
 await dialog.getByRole('button',{name:'Show 3 flights',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(trigger).toBeFocused();
 await expect(page.locator('.live-flight-card')).toHaveCount(3);
 await expectNoHorizontalOverflow(page);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

function hotelSearch(provider:ProviderFixture){
 provider.search={searchId,results:{hotels:[
  {tjHotelId:'10001',name:'Breakfast Garden Stay',customerEstimateMinor:280589,propertyContentStatus:'resolved',property:{starRating:4,address:'Synthetic Garden Road',propertyType:'Hotel'}},
  {tjHotelId:'10002',name:'Harbour Rooms',customerEstimateMinor:430000,propertyContentStatus:'resolved',property:{starRating:3,address:'Synthetic Harbour Road',propertyType:'Hotel'}},
 ]}};
 return '/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001,10002',city:'Goa',date:departure,end:returning,adults:'1',autoSearch:'1'});
}

for(const product of ['FLIGHT','HOTEL'] as const)test(`${product} open mobile filters close on desktop resize without reopening or locking scroll`,async({page,provider})=>{
 await page.setViewportSize({width:390,height:844});
 if(product==='FLIGHT'){comparisonFlights(provider);await openFlightSearch(page);await expect(page.locator('.live-flight-card')).toHaveCount(3);}
 else {await page.goto(hotelSearch(provider));await expect(page.locator('.hotel-shopping-card')).toHaveCount(2);}
 const trigger=page.getByRole('button',{name:/^Filters/});
 const dialog=page.getByRole('dialog',{name:product==='FLIGHT'?'Filter flights':'Filter stays',exact:true});
 await trigger.click();await expect(dialog).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 await page.setViewportSize({width:1440,height:1000});
 await expect(dialog).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await page.setViewportSize({width:390,height:844});
 await expect(trigger).toBeVisible();await expect(trigger).toHaveAttribute('aria-expanded','false');await expect(dialog).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await trigger.click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('mobile stay filters are modal, retain edits on Escape, and return focus to their trigger',async({page,provider},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(hotelSearch(provider));
 await expect(page.locator('.hotel-shopping-card')).toHaveCount(2);
 const trigger=page.getByRole('button',{name:/^Filters/});
 await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Filter stays',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog).toHaveJSProperty('open',true);
 await dialog.getByLabel('Property name',{exact:true}).fill('Breakfast Garden');
 await expect(dialog.getByRole('button',{name:'Show 1 stay',exact:true})).toBeVisible();
 // Native modal focus containment must survive tabbing past its footer.
 await dialog.getByRole('button',{name:'Show 1 stay',exact:true}).focus();
 await expectNativeModalTabCycle(page,dialog,info);
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(trigger).toBeFocused();
 await expect(page.locator('.hotel-shopping-card')).toHaveCount(1);
 await expect(page.getByRole('article',{name:'Breakfast Garden Stay',exact:true})).toBeVisible();
 await trigger.click();
 await expect(dialog.getByLabel('Property name',{exact:true})).toHaveValue('Breakfast Garden');
 await dialog.getByRole('button',{name:'Reset filters',exact:true}).click();
 await dialog.getByRole('button',{name:'Show 2 stays',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(trigger).toBeFocused();
 await expect(page.locator('.hotel-shopping-card')).toHaveCount(2);
 await expectNoHorizontalOverflow(page);
 await capture(page,info,'mobile-stay-filter-results');
 expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('room preferences update the minimum and rate count while preserving the exact selected option',async({page,provider},info)=>{
 const url=hotelSearch(provider);
 const roomInfo=[{id:'garden-double',name:'Garden Double'}];
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[
  {optionId:'room-only',roomInfo,mealBasis:'ROOM_ONLY',pricing:{totalPrice:2805.89}},
  {optionId:'breakfast-low',roomInfo,mealBasis:'BREAKFAST',pricing:{totalPrice:2982.57}},
  {optionId:'breakfast-flex',roomInfo,mealBasis:'BREAKFAST',pricing:{totalPrice:3500}},
 ]}};
 provider.quote=reviewedQuote({product:'HOTEL',totalMinor:298257,summary:{checkIn:departure,checkOut:returning,adults:1,rooms:[{adults:1,children:0,childAge:[]}]}});
 await page.goto(url);
 await expect(page.locator('.hotel-shopping-card')).toHaveCount(2);
 await capture(page,info,'hotel-comparison-results');
 await page.getByRole('article',{name:'Breakfast Garden Stay',exact:true}).getByRole('button',{name:'Choose room',exact:true}).click();
 const preview=page.getByRole('complementary',{name:'Stay price summary',exact:true});
 await expect(preview).toContainText('₹2,805.89');
 await expect(preview.getByRole('button',{name:'View 3 room rates',exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:'Breakfast included',exact:true}).check();
 await expect(page.locator('.stay-room-rate')).toHaveCount(2);
 await expect(page.locator('.stay-rate-count')).toHaveText('2 of 3 rates match');
 await expect(preview).toContainText('₹2,982.57');
 await expect(preview).not.toContainText('₹2,805.89');
 await expect(preview).not.toContainText('ROOM ONLY');
 await expect(preview.getByRole('button',{name:'View 2 room rates',exact:true})).toBeVisible();
 await expect(page.locator('.stay-room-group')).toHaveCount(1);
 await expect(page.locator('[data-room-option-id="room-only"]')).toHaveCount(0);
 await expectNoHorizontalOverflow(page);
 await capture(page,info,'filtered-room-summary');
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 await page.locator('[data-room-option-id="breakfast-low"]').getByRole('button',{name:'Continue with room',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/review').at(-1)?.body).toMatchObject({searchId,hid:'10001',optionId:'breakfast-low'});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
