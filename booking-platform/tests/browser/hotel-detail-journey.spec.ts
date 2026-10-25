import path from 'node:path';
import type {Page} from '@playwright/test';
import {test,expect,capture,departure,returning,searchId,reviewedQuote,expectNoHorizontalOverflow,type ProviderFixture} from './fixtures';
import {travelDateLabel} from '../../src/lib/travel-date';

// All inventory and images below are synthetic fixtures. No supplier or payment is contacted.
const name='Palm House · synthetic property';
const photos=Array.from({length:3},(_,index)=>({url:`https://i.travelapi.com/lodging/123/journey-${index}.jpg`,isHero:index===0,caption:`Illustrative destination image ${index+1}, not an actual property photograph`}));
const property={starRating:4,propertyType:'Hotel',address:'Fixture Road, Goa — synthetic address',amenities:['Wi-Fi','Parking','Restaurant'],photos};
const hotels=[{tjHotelId:'10001',name,customerEstimateMinor:800000,property},{tjHotelId:'10002',name:'Other synthetic stay',customerEstimateMinor:900000,property:{amenities:[]}}];
const options=[
 {optionId:'exact-room-only',roomInfo:[{id:'twin',name:'Twin room'}],mealBasis:'ROOM_ONLY',inclusions:['Wi-Fi'],pricing:{totalPrice:8000,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}},
 {optionId:'exact-breakfast',roomInfo:[{id:'twin',name:'Twin room'}],mealBasis:'BREAKFAST',inclusions:['Breakfast','Wi-Fi'],pricing:{totalPrice:9200,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}},
];
const criteria=()=>({product:'HOTEL',city:'Goa',hotelIds:'10001,10002',date:departure,end:returning,adults:'2',rooms:JSON.stringify([{adults:2,childAge:[]}]),nationality:'106'});
const searchUrl=()=>'/book?'+new URLSearchParams({...criteria(),autoSearch:'1'});
const detailUrl=()=>'/book?'+new URLSearchParams({...criteria(),browseSearch:searchId,stay:'10001'});
function fixture(provider:ProviderFixture){
 provider.search={searchId,results:{hotels}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property,options}};
 provider.overrides['POST /api/travel/hotel-search-snapshot']={body:{searchId,expiresAt:new Date(Date.now()+10*60_000).toISOString(),criteria:criteria(),results:{hotels}}};
 provider.quote=reviewedQuote({product:'HOTEL',hotelName:name,totalMinor:920000,summary:{checkIn:departure,checkOut:returning,adults:2,children:0,rooms:[{adults:2,children:0,childAge:[]}]},review:{conditions:{},option:options[1]}});
}
async function filters(page:Page,open:boolean){const toggle=page.getByRole('button',{name:/^Filters/});if(await toggle.isVisible()&&(await toggle.getAttribute('aria-expanded')==='true')!==open)await toggle.click();}
const card=(page:Page)=>page.getByRole('article',{name,exact:true});
const title=(page:Page)=>card(page).locator('h3').getByRole('link');

test.beforeEach(async({page,provider})=>{
 fixture(provider);await page.emulateMedia({reducedMotion:'reduce'});
 for(const photo of photos)await page.route(photo.url,route=>route.fulfill({contentType:'image/jpeg',path:path.resolve('public/travel/goa.jpg')}));
});

test('hotel NAME opens property overview, gallery, room rate, review and reversible selection',async({page,provider},testInfo)=>{
 await page.goto(searchUrl());await expect(card(page)).toBeVisible();
 await title(page).click();
 await expect(page).toHaveURL(/stay=10001/);await expect(page.locator('#hotel-detail-title')).toHaveText(name);await expect(page.locator('#booking-results')).toBeHidden();
 await expect(page.locator('#booking-rooms')).toContainText(property.address);await expect(page.locator('#booking-rooms')).toContainText('4');
 await expect(page.locator('#booking-rooms')).toContainText(travelDateLabel(departure));await expect(page.locator('#booking-rooms')).toContainText(travelDateLabel(returning));
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'hotel-name-opened-overview');
 const gallery=page.getByRole('button',{name:/View all.*photos/i});await gallery.click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page).toHaveURL(/gallery=1/);
 await page.keyboard.press('ArrowRight');await expect(page.getByRole('dialog')).toContainText('2');
 await capture(page,testInfo,'hotel-gallery-open');await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).not.toBeVisible();await expect(gallery).toBeFocused();await expect(page).not.toHaveURL(/gallery=1/);
 await gallery.click();await page.goBack();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('#hotel-detail-title')).toBeVisible();
 await page.locator('.stay-rate-preview > .primary').click();await expect(page.locator('#hotel-room-options-title')).toBeInViewport();
 const breakfast=page.locator('.room-option-card').filter({hasText:'₹9,200'});await expect(breakfast).toContainText('BREAKFAST');
 await expect(page.locator('.room-option-card')).toHaveCount(2);await capture(page,testInfo,'hotel-room-rate-comparison');
 await breakfast.getByRole('button',{name:'Review stay',exact:true}).click();await expect(page.locator('#booking-review-title')).toBeVisible();
 expect(provider.requests('/api/travel/review').map(call=>call.body)).toEqual([{searchId,hid:'10001',optionId:'exact-breakfast'}]);
 await page.getByRole('button',{name:'Change selection',exact:true}).click();await expect(page.locator('#hotel-detail-title')).toBeVisible();
 await expect(breakfast).toContainText('Selected');await expect(breakfast.getByRole('button',{name:'Review stay',exact:true})).toBeFocused();await page.getByRole('button',{name:'Back to stays',exact:true}).click();await expect(title(page)).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/payments/create')).toHaveLength(0);await expectNoHorizontalOverflow(page);
});

test('photo opens overview before rooms finish and failed room loading can retry without another search',async({page,provider},testInfo)=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let attempts=0;
 await page.route('**/api/travel/hotel-detail',async route=>{
  attempts++;provider.calls.push({method:'POST',path:'/api/travel/hotel-detail',query:{},body:route.request().postDataJSON()});
  if(attempts===1){await held;await route.fulfill({status:503,json:{error:'Synthetic room service temporarily unavailable.'}});}else await route.fulfill({json:{property,options}});
 });
 await page.goto(searchUrl());await card(page).locator('.hotel-card-photo').getByRole('link').click();
 await expect(page.locator('#hotel-detail-title')).toBeVisible();await expect(page.locator('#booking-rooms')).toContainText(property.address);
 await expect(page.locator('#hotel-room-options')).toContainText(/Checking|Loading/i);await capture(page,testInfo,'hotel-overview-with-independent-room-loading');
 release();await expect(page.locator('#hotel-room-options')).toContainText('Synthetic room service temporarily unavailable.');
 await page.getByRole('button',{name:/Try.*again|Retry/i}).click();await expect(page.locator('.room-option-card')).toHaveCount(2);
 expect(attempts).toBe(2);expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('Back, Forward and refresh retain filtered search, submitted dates and occupancy without a new availability search',async({page,provider},testInfo)=>{
 await page.goto(searchUrl());await expect(card(page)).toBeVisible();await filters(page,true);
 await page.getByRole('searchbox',{name:'Property name',exact:true}).fill('Palm');await page.getByRole('combobox',{name:'Sort stays',exact:true}).selectOption('price-desc');await filters(page,false);
 await title(page).click();await expect(page.locator('#hotel-detail-title')).toBeVisible();await page.goBack();
 await expect(title(page)).toBeFocused();await expect(page.locator('.hotel-shopping-card')).toHaveCount(1);await expect(page.getByRole('combobox',{name:'Sort stays',exact:true})).toHaveValue('price-desc');
 await page.goForward();await expect(page.locator('#hotel-detail-title')).toBeVisible();await page.reload();await expect(page.locator('#hotel-detail-title')).toHaveText(name);
 expect(provider.requests('/api/travel/hotel-search-snapshot')).toHaveLength(1);expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await expect(page.locator('#booking-rooms')).toContainText('2 guests');await expect(page.locator('#booking-rooms')).toContainText(travelDateLabel(departure));
 await page.getByRole('button',{name:'Back to stays',exact:true}).click();await expect(page.locator('.hotel-shopping-card')).toHaveCount(1);
 await filters(page,true);await expect(page.getByRole('searchbox',{name:'Property name',exact:true})).toHaveValue('Palm');await expect(page.getByRole('combobox',{name:'Sort stays',exact:true})).toHaveValue('price-desc');
 await capture(page,testInfo,'hotel-search-restored-after-refresh');expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const reason of ['expired','foreign'])test(`${reason} property deep link offers search recovery and never requests room availability or review`,async({page,provider})=>{
 provider.overrides['POST /api/travel/hotel-search-snapshot']={status:409,body:{error:'This search is no longer available in this browser. Search again to continue.'}};
 await page.goto(detailUrl());await expect(page.locator('#booking-feedback')).toContainText('Search again');
 await expect(page.locator('#hotel-detail-title')).toHaveCount(0);
 expect(provider.requests('/api/travel/hotel-search-snapshot')).toHaveLength(1);expect(provider.requests('/api/travel/search')).toHaveLength(0);expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(0);expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await expect(page.getByLabel('Check-in',{exact:true})).toHaveValue(departure);await expect(page.getByLabel('Check-out',{exact:true})).toHaveValue(returning);
});

test('multi-room bundled rate preserves exact option and total through sign-in review boundary',async({page,provider})=>{
 const roomInfo=[{id:'twin',name:'Twin room'},{id:'family',name:'Family room'}];
 const bundled={...options[1],optionId:'exact-two-room-bundle',roomInfo,pricing:{totalPrice:12000,currency:'INR'}};
 provider.session=null;provider.overrides['POST /api/travel/hotel-detail']={body:{property,options:[bundled]}};
 provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 const params={...criteria(),rooms:JSON.stringify([{adults:2,childAge:[]},{adults:1,childAge:[7]}]),autoSearch:'1'};
 await page.goto('/book?'+new URLSearchParams(params));await title(page).click();
 const rate=page.locator('.room-option-card');await expect(rate).toContainText('Twin room + Family room');await expect(rate).toContainText('₹12,000');await expect(rate).not.toContainText('₹24,000');
 await expect(page.locator('#booking-rooms')).toContainText('2 rooms');await expect(page.locator('#booking-rooms')).toContainText('4 guests');
 await rate.getByRole('button',{name:'Review stay',exact:true}).click();await expect(page.getByRole('link',{name:'Sign in to review selection',exact:true})).toBeVisible();
 await expect(page.locator('.signin-selection-context')).toContainText('Twin room + Family room');
 expect(provider.requests('/api/travel/review').map(call=>call.body)).toEqual([{searchId,hid:'10001',optionId:'exact-two-room-bundle'}]);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('missing photos and static content do not invent property facts or block real room rates',async({page,provider},testInfo)=>{
 provider.search={searchId,propertyContentUnavailable:true,results:{hotels:[{tjHotelId:'10001',name,propertyContentStatus:'unavailable'}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options}};
 await page.goto(searchUrl());await title(page).click();await expect(page.locator('#hotel-detail-title')).toHaveText(name);
 await expect(page.locator('#booking-rooms')).toContainText('Property address not supplied');await expect(page.locator('#booking-rooms')).toContainText(/photos unavailable|No property photos supplied/i);
 await expect(page.locator('#booking-rooms')).not.toContainText('4-star');await expect(page.getByRole('button',{name:/View all.*photos/i})).toHaveCount(0);
 await expect(page.locator('.room-option-card')).toHaveCount(2);await expect(page.locator('.room-option-card').first()).toContainText('Non-refundable');
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'hotel-missing-static-content-usable-rates');expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('empty live rates retain the property overview and offer a reversible return to results',async({page,provider},testInfo)=>{
 provider.overrides['POST /api/travel/hotel-detail']={body:{property,options:[]}};
 await page.goto(searchUrl());await title(page).click();await expect(page.locator('#hotel-detail-title')).toHaveText(name);
 await expect(page.getByRole('heading',{name:'No rooms available for this stay',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Review stay',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'View all 3 photos',exact:true})).toBeVisible();await capture(page,testInfo,'hotel-available-property-no-room-inventory');
 await page.locator('#hotel-room-options').getByRole('button',{name:'Browse other stays',exact:true}).click();await expect(title(page)).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('expired snapshot payload is rejected before live rooms even if the endpoint returns success',async({page,provider})=>{
 provider.overrides['POST /api/travel/hotel-search-snapshot']={body:{searchId,expiresAt:new Date(Date.now()-1000).toISOString(),criteria:criteria(),results:{hotels}}};
 await page.goto(detailUrl());await expect(page.locator('#booking-feedback')).toContainText(/expired/i);await expect(page.locator('#hotel-detail-title')).toHaveCount(0);
 expect(provider.requests('/api/travel/search')).toHaveLength(0);expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(0);expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('browser Back during a held room review cannot resurrect its quote or property URL',async({page,provider})=>{
 let release!:()=>void,settle!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),settled=new Promise<void>(resolve=>{settle=resolve;});let requested=false;
 await page.route('**/api/travel/review',async route=>{requested=true;provider.calls.push({method:'POST',path:'/api/travel/review',query:{},body:route.request().postDataJSON()});await held;await route.fulfill({json:provider.quote}).catch(()=>{}).finally(settle);});
 try{
  await page.goto(searchUrl());await title(page).click();await page.locator('.room-option-card').first().getByRole('button',{name:'Review stay',exact:true}).click();await expect.poll(()=>requested).toBe(true);
  await page.goBack();await expect(card(page)).toBeVisible();await expect(page).not.toHaveURL(/stay=10001/);
  release();await settled;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(card(page)).toBeVisible();await expect(page.locator('#booking-review')).toHaveCount(0);await expect(page).not.toHaveURL(/stayStep=review|stay=10001/);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);expect(provider.requests('/api/payments/create')).toHaveLength(0);
 }finally{release();}
});

test('new submitted search supersedes a held property snapshot without stale criteria or rates',async({page,provider})=>{
 let release!:()=>void,settle!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),settled=new Promise<void>(resolve=>{settle=resolve;});let requested=false;
 await page.route('**/api/travel/hotel-search-snapshot',async route=>{requested=true;provider.calls.push({method:'POST',path:'/api/travel/hotel-search-snapshot',query:{},body:route.request().postDataJSON()});await held;await route.fulfill({json:{searchId,expiresAt:new Date(Date.now()+10*60_000).toISOString(),criteria:criteria(),results:{hotels}}}).catch(()=>{}).finally(settle);});
 const newerId='11111111-1111-4111-8111-111111111119',changed=new Date(returning+'T00:00:00Z');changed.setUTCDate(changed.getUTCDate()+1);const newEnd=changed.toISOString().slice(0,10);
 try{
  await page.goto(detailUrl());await expect.poll(()=>requested).toBe(true);await page.getByLabel('Check-out',{exact:true}).fill(newEnd);
  provider.search={searchId:newerId,results:{hotels:[hotels[1]]}};await page.getByRole('button',{name:'Search stays',exact:true}).click();
  await expect(page.getByRole('article',{name:'Other synthetic stay',exact:true})).toBeVisible();release();await settled;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.locator('.hotel-shopping-card')).toHaveCount(1);await expect(page.locator('#booking-search>summary')).toContainText(travelDateLabel(newEnd));await expect(page.locator('#hotel-detail-title')).toHaveCount(0);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/search')[0].body).toMatchObject({checkOut:newEnd});expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(0);expect(provider.requests('/api/travel/review')).toHaveLength(0);
 }finally{release();}
});

test('pointer-only property URL hydrates authoritative dates, destination, nationality and per-room occupancy',async({page,provider})=>{
 const rooms=[{adults:2,childAge:[]},{adults:1,childAge:[7]}],authoritative={...criteria(),city:'Goa restored destination',nationality:'222',rooms:JSON.stringify(rooms)};
 provider.overrides['GET /api/travel/nationalities']={body:{nationalities:[{countryId:'106',name:'India'},{countryId:'222',name:'Synthetic nationality'}]}};
 provider.overrides['POST /api/travel/hotel-search-snapshot']={body:{searchId,expiresAt:new Date(Date.now()+10*60_000).toISOString(),criteria:authoritative,results:{hotels}}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',browseSearch:searchId,stay:'10001'}));await expect(page.locator('#hotel-detail-title')).toHaveText(name);
 await expect(page.locator('.stay-date-strip')).toContainText(travelDateLabel(departure));await expect(page.locator('.stay-date-strip')).toContainText(travelDateLabel(returning));await expect(page.locator('.stay-date-strip')).toContainText('2 rooms · 4 guests');
 await page.locator('#booking-search>summary').click();
 const form=page.getByRole('form',{name:'Search availability',exact:true});
 await expect(form.getByLabel('Destination',{exact:true})).toHaveValue(authoritative.city);await expect(form.locator('input[name="hotelIds"]')).toHaveValue('10001,10002');
 await expect(form.getByLabel('Check-in',{exact:true})).toHaveValue(departure);await expect(form.getByLabel('Check-out',{exact:true})).toHaveValue(returning);await expect(form.getByLabel('Rooms',{exact:true})).toHaveValue('2');await expect(form.getByLabel('Guest nationality',{exact:true})).toHaveValue('222');
 const first=form.getByRole('group',{name:'Room 1 · Guests',exact:true}),second=form.getByRole('group',{name:'Room 2 · Guests',exact:true});
 await expect(first.getByLabel('Adults',{exact:true})).toHaveValue('2');await expect(first.getByLabel('Children',{exact:true})).toHaveValue('0');
 await expect(second.getByLabel('Adults',{exact:true})).toHaveValue('1');await expect(second.getByLabel('Children',{exact:true})).toHaveValue('1');await expect(second.getByLabel('Child 1 age at check-in',{exact:true})).toHaveValue('7');
 expect(provider.requests('/api/travel/search')).toHaveLength(0);expect(provider.requests('/api/travel/hotel-search-snapshot')).toHaveLength(1);expect(provider.requests('/api/travel/hotel-detail')[0].body).toEqual({searchId,hid:'10001'});expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('rate plans group only identical room compositions without losing bundled option IDs or totals',async({page,provider})=>{
 const combo={...options[1],optionId:'exact-combination',roomInfo:[{id:'twin',name:'Twin room'},{id:'family',name:'Family room'}],pricing:{totalPrice:12000,currency:'INR'}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property,options:[...options,combo]}};
 await page.goto(searchUrl());await title(page).click();
 const groups=page.locator('.stay-room-group');await expect(groups).toHaveCount(2);
 await expect(groups.nth(0).locator('.room-option-card')).toHaveCount(2);await expect(groups.nth(0).locator('.stay-room-group-heading')).toContainText('2 rate plans');
 await expect(groups.nth(0).locator('[data-room-option-id="exact-room-only"]')).toContainText('₹8,000');await expect(groups.nth(0).locator('[data-room-option-id="exact-breakfast"]')).toContainText('₹9,200');
 await expect(groups.nth(1).locator('.room-option-card')).toHaveCount(1);await expect(groups.nth(1)).toContainText('Twin room + Family room');await expect(groups.nth(1).locator('[data-room-option-id="exact-combination"]')).toContainText('₹12,000');
 await groups.nth(1).getByRole('button',{name:'Review stay',exact:true}).click();await expect(page.locator('#booking-review-title')).toBeVisible();
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,hid:'10001',optionId:'exact-combination'});expect(provider.requests('/api/payments/create')).toHaveLength(0);
});


test('switching to Flights supersedes a held hotel snapshot without reopening the hotel journey',async({page,provider})=>{
 let release!:()=>void,settle!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),settled=new Promise<void>(resolve=>{settle=resolve;});let requested=false;
 await page.route('**/api/travel/hotel-search-snapshot',async route=>{requested=true;provider.calls.push({method:'POST',path:'/api/travel/hotel-search-snapshot',query:{},body:route.request().postDataJSON()});await held;await route.fulfill({json:{searchId,expiresAt:new Date(Date.now()+10*60_000).toISOString(),criteria:criteria(),results:{hotels}}}).catch(()=>{}).finally(settle);});
 try{
  await page.goto(detailUrl());await expect.poll(()=>requested).toBe(true);
  await page.locator('.booking-product-tabs').getByRole('button',{name:/Flights/}).click();
  await expect(page.getByRole('button',{name:'Search flights',exact:true})).toBeVisible();await expect(page).toHaveURL(/product=FLIGHT/);await expect(page).not.toHaveURL(/browseSearch=|stay=|gallery=|stayStep=/);
  release();await settled;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.getByRole('button',{name:'Search flights',exact:true})).toBeVisible();await expect(page.locator('#hotel-detail-title')).toHaveCount(0);await expect(page.locator('.hotel-shopping-card')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Restoring your hotel search…',exact:true})).toHaveCount(0);
  expect(provider.requests('/api/travel/search')).toHaveLength(0);expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(0);expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
 }finally{release();}
});
