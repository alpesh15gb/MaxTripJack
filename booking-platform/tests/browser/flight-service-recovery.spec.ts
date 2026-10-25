import {test,expect,capture,expectNoHorizontalOverflow,departure,bookingId,quoteId,type ProviderFixture} from './fixtures';
import type {Page} from '@playwright/test';
const parent='81111111-1111-4111-8111-111111111111';
const markerKey='maxtravel.pending-checkout.v1';
async function openManagement(page:Page){if(await page.locator('.trip-management').getAttribute('open')===null)await page.locator('.trip-management > summary').click();}
async function refreshedManagement(page:Page,provider:ProviderFixture,before:number){await expect.poll(()=>provider.requests('/api/bookings').length).toBeGreaterThan(before);await expect(page.getByRole('button',{name:'Refresh booking updates'})).toBeEnabled();await openManagement(page);}
async function prepare(page:Page,provider:ProviderFixture,expired=false,totalMinor=50000,navigate?:()=>Promise<void>){
 provider.bookingsPages['1']={hasMore:false,bookings:[{id:parent,reference:'MX-SYNTHETIC-SERVICE',status:'TICKETED',product:'FLIGHT',currency:'INR',total_minor:'654000',created_at:'2026-10-01T12:00:00Z',itinerary_summary:{from:'BOM',to:'DEL',date:departure,adults:1}}]};
 provider.overrides[`GET /api/bookings/${parent}/cancellation-offer`]={body:{requests:[]}};
 provider.overrides[`POST /api/bookings/${parent}/services`]={body:{searchId:'synthetic-service-search',kind:'ANCILLARY',results:{segments:[{id:'seg',label:'BOM → DEL',pax:[{id:'pax',name:'Synthetic Traveller',type:'ADULT'}],options:[{kind:'MEAL',code:'MEAL',label:'Vegetarian meal',amountMinor:50000}]}]}}};
 provider.overrides['POST /api/travel/service-review']={body:{quoteId,kind:'ANCILLARY',parentReference:'MX-SYNTHETIC-SERVICE',totalMinor,expiresAt:expired?'2020-01-01T12:00:00Z':provider.quote.expiresAt,review:{version:1,blocked:false,lines:[{label:'Service restriction',text:'Extras cannot be refunded'}]}}};
 if(navigate)await navigate();else await page.goto('/my-trips');await openManagement(page);
 await page.getByRole('button',{name:'Add seats, meals & baggage'}).click();
 await page.getByRole('combobox',{name:'meal for Synthetic Traveller · BOM → DEL',exact:true}).selectOption('MEAL');
 await page.getByRole('button',{name:'Review extras total'}).click();
}
const recovery=(page:Page)=>page.getByRole('region',{name:'Interrupted payment recovery'});
async function pay(page:Page,free=false){await page.getByLabel(/I accept the additional total/).check();await page.getByRole('button',{name:free?'Confirm request':'Confirm & pay'}).click();}
const unconfirmed={status:'OUTCOME_UNCONFIRMED',canResume:false,checkoutResolved:false,message:'No payment order is visible yet. Do not start another payment.'};

test('lost service create stays locked through duplicate submission, refresh and Back without another create',async({page,provider},info)=>{
 await prepare(page,provider);
 provider.overrides['POST /api/payments/create']={status:503,body:{error:'Connection lost after sending create'}};
 provider.overrides['GET /api/payments/status']={body:unconfirmed};
 await pay(page);await expect(recovery(page)).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();
 await page.locator('form').filter({has:page.getByRole('button',{name:'Confirm & pay'})}).evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
 expect(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!),markerKey)).toEqual({quoteId});
 await recovery(page).getByRole('button',{name:'Check existing payment status'}).click();
 await page.reload();await openManagement(page);await expect(recovery(page)).toBeVisible();
 await expect(page.getByRole('button',{name:'Add seats, meals & baggage'})).toBeDisabled();
 await page.goto('/account');await page.goBack();await openManagement(page);await expect(recovery(page)).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
 const actions=recovery(page).locator('.service-recovery-actions');
 await expect(actions).toHaveCSS('display','flex');
 await expect(actions).toHaveCSS('row-gap','12px');
 await expect(actions).toHaveCSS('column-gap','12px');
 const controls=actions.locator('button, a');
 await expect(controls).toHaveCount(4);
 await actions.scrollIntoViewIfNeeded();
 const boxes=await controls.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};}));
 for(const box of boxes){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
  const horizontalGap=Math.max(b.x-a.x-a.width,a.x-b.x-b.width),verticalGap=Math.max(b.y-a.y-a.height,a.y-b.y-b.height);
  expect(Math.max(horizontalGap,verticalGap),'Recovery actions must be visually separated, not merely non-overlapping').toBeGreaterThanOrEqual(11.5);
 }
 if(page.viewportSize()!.width<=600){const container=await actions.boundingBox();for(const box of boxes)expect(Math.abs(box.width-container!.width),'Mobile recovery actions must fill their own row').toBeLessThanOrEqual(1);}
 await info.attach('service-recovery-controls-natural-viewport',{body:await page.screenshot({path:info.outputPath(`service-recovery-controls-${info.project.name}-viewport.png`)}),contentType:'image/png'});
 await expectNoHorizontalOverflow(page);await capture(page,info,'service-create-unknown-reload');
});

test('dismissed service checkout resumes only fresh owned status and never creates twice',async({page,provider},info)=>{
 await prepare(page,provider);await pay(page);
 await expect.poll(()=>page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(1);
 await page.evaluate('window.__syntheticGateway.dismiss()');
 await recovery(page).getByRole('button',{name:'Resume existing checkout'}).click();
 await expect.poll(()=>page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(2);
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
 expect(provider.requests('/api/payments/status').length).toBeGreaterThanOrEqual(3);
 await page.evaluate('window.__syntheticGateway.dismiss()');
 await expect(recovery(page).getByRole('button',{name:'Resume existing checkout'})).toBeEnabled();
 provider.overrides['GET /api/payments/status']={body:{bookingId,status:'PAID',paymentStatus:'CAPTURED',canResume:false,checkoutResolved:true,message:'Payment captured; check supplier status.'}};
 // Even a previously visible Resume must recheck the server, not trust its old snapshot.
 const before=provider.requests('/api/bookings').length;
 await recovery(page).getByRole('button',{name:'Resume existing checkout'}).click();
 await refreshedManagement(page,provider,before);
 await expect(recovery(page).getByRole('button',{name:'Resume existing checkout'})).toHaveCount(0);
 expect(await page.evaluate('window.__syntheticGateway.opens.length')).toBe(2);
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add seats, meals & baggage'})).toBeEnabled();
 await capture(page,info,'service-captured-no-reopen');
});

test('lost service verification cannot unlock another payment and supports status recovery',async({page,provider})=>{
 await prepare(page,provider);await pay(page);await expect.poll(()=>page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(1);
 provider.overrides['POST /api/payments/verify']={status:503,body:{error:'Verification outcome unknown'}};
 provider.overrides['GET /api/payments/status']={body:unconfirmed};
 await page.evaluate('window.__syntheticGateway.complete()');
 await expect(recovery(page)).toContainText('No payment order is visible');
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();
 await expect(recovery(page).getByRole('button',{name:'Resume existing checkout'})).toHaveCount(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
 await page.reload();await openManagement(page);await expect(recovery(page)).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
});

test('expired service review has explicit restart and cannot create payment',async({page,provider})=>{
 await prepare(page,provider,true);
 await expect(page.getByText(/This service quote has expired/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();
 await page.locator('form').filter({has:page.getByRole('button',{name:'Confirm & pay'})}).evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.getByRole('button',{name:'Add seats, meals & baggage'}).click();
 await expect(page.getByRole('button',{name:'Review extras total'})).toBeVisible();
});

test('known unavailable service provider clears only the proven new attempt',async({page,provider})=>{
 await prepare(page,provider);
 provider.overrides['POST /api/payments/create']={status:503,body:{code:'PAYMENT_PROVIDER_UNAVAILABLE',error:'Online payment unavailable. No payment was started.'}};
 await pay(page);await expect(page.getByText('Online payment unavailable. No payment was started.')).toBeVisible();
 await expect(recovery(page)).toHaveCount(0);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),markerKey)).toBeNull();
 expect(await page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(0);
});

test('expired existing service order cannot open gateway or create a replacement',async({page,provider})=>{
 await prepare(page,provider);
 provider.overrides['GET /api/payments/status']={body:{bookingId,status:'PAYMENT_PENDING',canResume:false,checkoutResolved:false,message:'Reviewed quote expired; contact support.'}};
 await pay(page);await expect(recovery(page)).toContainText('Reviewed quote expired');
 expect(await page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();
 await expect(recovery(page).getByRole('link',{name:'Contact support about this checkout'})).toHaveAttribute('href','/customer-support');
});

test('pending service create cannot launch checkout after real Link intent before route commit',async({page,provider})=>{
 let releaseNavigation!:()=>void;const navigationHeld=new Promise<void>(resolve=>{releaseNavigation=resolve;});
 await page.route('**/customer-support*',async route=>{await navigationHeld;await route.continue();});
 await prepare(page,provider);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 let requested=false;await page.route('**/api/payments/create',async route=>{requested=true;await held;try{await route.fulfill({json:{bookingId,orderId:'order_SYNTHETICONLY',amount:50000,currency:'INR',keyId:'rzp_test_SYNTHETICONLY'}});}catch{/* Navigation may cancel the browser request. */}});
 try{
  await pay(page);await expect.poll(()=>requested).toBe(true);await expect(recovery(page)).toBeVisible();
  await page.getByRole('link',{name:'Contact support about this checkout'}).click({noWaitAfter:true});
  const response=page.waitForResponse('**/api/payments/create');release();await response;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  // The original component is still mounted: support RSC/navigation is held.
  expect(await page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(0);
  expect(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!),markerKey)).toEqual({quoteId});
 }finally{release();releaseNavigation();}
 await expect(page).toHaveURL(/\/customer-support$/);
 expect(await page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(0);
});

test('browser Back intent preserves pending service recovery and cannot launch its late checkout',async({page,provider})=>{
 await page.goto('/account');
 await prepare(page,provider,false,50000,async()=>{await page.locator('.account-card').getByRole('link',{name:'My trips',exact:true}).click();});
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await page.route('**/api/payments/create',async route=>{requested=true;await held;try{await route.fulfill({json:{bookingId,orderId:'order_SYNTHETICONLY',amount:50000,currency:'INR',keyId:'rzp_test_SYNTHETICONLY'}});}catch{/* The old route may already be gone. */}});
 await pay(page);await expect.poll(()=>requested).toBe(true);
 await page.evaluate(()=>{window.addEventListener('popstate',()=>{Object.assign(window,{__serviceBackIntent:true});},{once:true});});
 const back=page.goBack();await expect.poll(()=>page.evaluate('Boolean(window.__serviceBackIntent)')).toBe(true);
 release();await back;await expect(page).toHaveURL(/\/account$/);
 expect(await page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(0);
 expect(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!),markerKey)).toEqual({quoteId});
});

test('reschedule reaches reviewed additional fare and shares unknown-payment protection',async({page,provider})=>{
 await prepare(page,provider);
 provider.overrides[`GET /api/bookings/${parent}/services`]={body:{trips:[{src:'BOM',dest:'DEL',departureDate:departure}],travellers:[{fn:'Synthetic',ln:'Traveller'}],cancelledUnits:[],reissued:false}};
 provider.overrides[`POST /api/bookings/${parent}/services`]={body:{searchId:'synthetic-reissue-search',kind:'REISSUE',results:{searchResult:{tripInfos:{ONWARD:[{sI:[{da:{code:'BOM'},aa:{code:'DEL'},dt:departure+'T09:00',at:departure+'T11:00',fD:{aI:{name:'Synthetic airline'}}}],totalPriceList:[{id:'new-fare',fareIdentifier:'STANDARD',customerEstimateMinor:50000}]}]}}}}};
 provider.overrides['POST /api/travel/service-review']={body:{quoteId,kind:'REISSUE',parentReference:'MX-SYNTHETIC-SERVICE',totalMinor:50000,expiresAt:provider.quote.expiresAt,review:{version:1,blocked:false,lines:[{label:'Service restriction',text:'Change is subject to supplier confirmation'}]}}};
 await page.getByRole('button',{name:'Reschedule flight',exact:true}).click();
 await page.getByLabel('New departure date').fill(departure);await page.getByLabel('Synthetic Traveller',{exact:true}).check();
 await page.getByRole('button',{name:'Search replacement flights'}).click();await page.getByRole('button',{name:'Review change'}).click();
 provider.overrides['POST /api/payments/create']={status:503,body:{error:'Unknown'}};provider.overrides['GET /api/payments/status']={body:unconfirmed};
 await pay(page);await expect(recovery(page)).toBeVisible();
 await expect(page.getByRole('button',{name:'Reschedule flight',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
});

test('service payment requires explicit consent even for a dispatched submit event',async({page,provider})=>{
 await prepare(page,provider);
 await page.locator('form').filter({has:page.getByRole('button',{name:'Confirm & pay'})}).evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),markerKey)).toBeNull();
});

test('a marker from another trip directs to contextual recovery instead of claiming it is this flight service',async({page,provider})=>{
 await prepare(page,provider);
 await page.evaluate(({key,id})=>sessionStorage.setItem(key,JSON.stringify({quoteId:id})),{key:markerKey,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 await page.reload();await openManagement(page);
 await expect(recovery(page)).toContainText('may belong to another trip');
 await expect(recovery(page).getByRole('link',{name:'Open original checkout recovery'})).toHaveAttribute('href','/book');
 await expect(recovery(page).getByRole('button',{name:'Resume existing checkout'})).toHaveCount(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const free of [false,true])test(`confirmed ${free?'free request':'payment verification'} ends service checkout without leaving a permanent browser lock`,async({page,provider})=>{
 await prepare(page,provider,false,free?0:50000);
 if(free)provider.overrides['POST /api/payments/create']={body:{bookingId,free:true,amount:0,currency:'INR'}};
 const before=provider.requests('/api/bookings').length;
 await pay(page,free);
 if(!free){await expect.poll(()=>page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(1);await page.evaluate('window.__syntheticGateway.complete()');}
 await refreshedManagement(page,provider,before);
 await expect(page.getByRole('button',{name:'Add seats, meals & baggage'})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toHaveCount(0);
 await expect(recovery(page)).toHaveCount(0);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),markerKey)).toBeNull();
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
});

for(const state of ['resumable','unknown','captured'] as const)test(`future hosted contract only (transport currently gated): owned status before redirect: ${state}`,async({page,provider})=>{
 await prepare(page,provider);
 const checkoutUrl='https://api.uat.payglocal.in/gl/payflow-ui/?fixture=synthetic';
 provider.overrides['POST /api/payments/create']={body:{provider:'PAYGLOCAL',bookingId,checkoutUrl,amount:50000,currency:'INR'}};
 provider.overrides['GET /api/payments/status']={body:state==='resumable'?{provider:'PAYGLOCAL',bookingId,checkoutUrl,amount:50000,currency:'INR',status:'PAYMENT_PENDING',canResume:true,quoteExpiresAt:provider.quote.expiresAt}:state==='captured'?{provider:'PAYGLOCAL',bookingId,status:'PAID',paymentStatus:'CAPTURED',canResume:false,checkoutResolved:true}:unconfirmed};
 let redirects=0;
 // Intercept the navigation itself: no hosted provider network or payment occurs.
 await page.route('https://api.uat.payglocal.in/**',async route=>{redirects++;await route.fulfill({contentType:'text/html',body:'<h1>Synthetic hosted checkout boundary</h1>'});});
 const before=provider.requests('/api/bookings').length;
 await pay(page);
 if(state==='resumable'){
  await expect(page.getByRole('heading',{name:'Synthetic hosted checkout boundary'})).toBeVisible();expect(redirects).toBe(1);
  await page.goBack();await openManagement(page);await expect(recovery(page)).toBeVisible();
  await expect(recovery(page).getByRole('link',{name:'Open original checkout recovery'})).toBeVisible();
 }else if(state==='captured'){await refreshedManagement(page,provider,before);await expect(page.getByRole('button',{name:'Confirm & pay'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Add seats, meals & baggage'})).toBeEnabled();expect(redirects).toBe(0);}else{await expect(recovery(page)).toBeVisible();await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();expect(redirects).toBe(0);}
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
 expect(provider.requests('/api/payments/status').length).toBeGreaterThanOrEqual(1);
});

test('future hosted contract only (transport currently gated): resume requires two fresh owned status checks',async({page,provider})=>{
 await prepare(page,provider);
 provider.overrides['POST /api/payments/create']={status:503,body:{error:'Unknown hosted create outcome'}};
 provider.overrides['GET /api/payments/status']={body:unconfirmed};
 await pay(page);await expect(recovery(page)).toContainText('No payment order is visible');
 const hosted={provider:'PAYGLOCAL',bookingId,checkoutUrl:'https://api.uat.payglocal.in/gl/payflow-ui/?fixture=resumed',amount:50000,currency:'INR',status:'PAYMENT_PENDING',canResume:true,quoteExpiresAt:provider.quote.expiresAt};
 provider.overrides['GET /api/payments/status']={body:hosted};
 await recovery(page).getByRole('button',{name:'Check existing payment status'}).click();
 await expect(recovery(page).getByRole('button',{name:'Resume existing checkout'})).toBeVisible();
 let redirects=0;await page.route('https://api.uat.payglocal.in/**',async route=>{redirects++;await route.fulfill({contentType:'text/html',body:'<h1>Synthetic resumed checkout boundary</h1>'});});
 await recovery(page).getByRole('button',{name:'Resume existing checkout'}).click();
 await expect(page.getByRole('heading',{name:'Synthetic resumed checkout boundary'})).toBeVisible();
 expect(redirects).toBe(1);expect(provider.requests('/api/payments/create')).toHaveLength(1);
 expect(provider.requests('/api/payments/status').length).toBeGreaterThanOrEqual(3);
});

for(const free of [false,true])test(`unknown ${free?'free request':'verification'} retires consumed quote when owned status later resolves`,async({page,provider})=>{
 await prepare(page,provider,false,free?0:50000);
 if(free){provider.overrides['POST /api/payments/create']={status:503,body:{error:'Free request outcome unknown'}};provider.overrides['GET /api/payments/status']={body:unconfirmed};}
 await pay(page,free);
 if(!free){
  await expect.poll(()=>page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(1);
  provider.overrides['POST /api/payments/verify']={status:503,body:{error:'Verification outcome unknown'}};
  provider.overrides['GET /api/payments/status']={body:unconfirmed};await page.evaluate('window.__syntheticGateway.complete()');
 }
 await expect(recovery(page)).toContainText('No payment order is visible');
 provider.overrides['GET /api/payments/status']={body:{bookingId,status:free?'BOOKING_PENDING':'PAID',...(free?{}:{paymentStatus:'CAPTURED'}),canResume:false,checkoutResolved:true}};
 const before=provider.requests('/api/bookings').length;
 await recovery(page).getByRole('button',{name:'Check existing payment status'}).click();
 await refreshedManagement(page,provider,before);
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Confirm request'})).toHaveCount(0);
 await expect(recovery(page)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add seats, meals & baggage'})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Reschedule flight',exact:true})).toBeEnabled();
 // Parent refresh remounts management; assert durable outcome rather than transient component copy.
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),markerKey)).toBeNull();
 // Fresh service availability may still be rejected while supplier processing is pending.
 provider.overrides[`POST /api/bookings/${parent}/services`]={status:409,body:{error:'Another operation is pending. Complete it first.'}};
 await page.getByRole('button',{name:'Add seats, meals & baggage'}).click();await expect(page.getByText('Another operation is pending. Complete it first.')).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
});

test('current PayGlocal existing-intent unavailable response retains recovery rather than claiming no payment exists',async({page,provider})=>{
 await prepare(page,provider);
 provider.overrides['POST /api/payments/create']={status:503,body:{error:'PayGlocal checkout is not enabled: merchant UAT contract and verification are pending. No payment was initiated.'}};
 provider.overrides['GET /api/payments/status']={body:{provider:'PAYGLOCAL',bookingId,status:'PAYMENT_PENDING',canResume:false,checkoutResolved:false,message:'PayGlocal verification is not enabled. Check My trips or contact operations; do not pay again.'}};
 await pay(page);await expect(recovery(page)).toContainText('PayGlocal verification is not enabled');
 await expect(page.getByRole('button',{name:'Confirm & pay'})).toBeDisabled();
 await expect(recovery(page).getByRole('button',{name:'Resume existing checkout'})).toHaveCount(0);
 expect(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!),markerKey)).toEqual({quoteId});
 expect(await page.evaluate('window.__syntheticGateway?.opens.length??0')).toBe(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(1);
});
