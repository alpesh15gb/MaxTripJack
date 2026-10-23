import type {Locator,Page,TestInfo} from '@playwright/test';
import {test,expect,openFlightSearch,departure,returning,searchId,syntheticSession,expectNoHorizontalOverflow} from './fixtures';

const key='maxtravel:selection:v1';
async function chooseFlight(page:Page){
 await page.locator('.fare-comparison > summary').first().click();
 await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
}
async function followAccountLink(page:Page,selection=true){
 const link=page.getByRole('link',{name:selection?'Sign in to review selection':'Sign in, then search again',exact:true});
 const href=await link.getAttribute('href');expect(href).not.toBeNull();
 const accountUrl=new URL(href!,page.url()).href;
 await link.click();
 // Next client navigation completes after the click handler. Before reading the
 // URL, reloading or pressing Back, prove the destination/history entry committed.
 await expect(page).toHaveURL(accountUrl);
 await expect(page.getByRole('heading',{level:1,name:selection?'Sign in to review your selection':'Sign in to continue your search',exact:true})).toBeVisible();
 return accountUrl;
}
async function naturalViewportEvidence(page:Page,info:TestInfo,name:string,critical:Locator[]){
 // Observe the application's own focus/scroll. Never scroll a locator or take a
 // full-page capture before recording the actual viewport seen by the traveller.
 const settled=await page.evaluate(async()=>{
  await document.fonts.ready;
  return new Promise<boolean>(resolve=>{let last=scrollY,stable=0,frames=0;const tick=()=>{stable=Math.abs(scrollY-last)<1?stable+1:0;last=scrollY;if(stable>=8)resolve(true);else if(++frames>=120)resolve(false);else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 });
 expect(settled,'natural viewport must settle before evidence capture').toBe(true);
 await expectNoHorizontalOverflow(page);
 const focusedElement=await page.evaluateHandle(()=>document.activeElement);
 const viewport=await page.evaluate(()=>({scrollX,scrollY,width:innerWidth,height:innerHeight,visualLeft:visualViewport?.offsetLeft??0,visualTop:visualViewport?.offsetTop??0,visualWidth:visualViewport?.width??innerWidth,visualHeight:visualViewport?.height??innerHeight,focusedId:document.activeElement?.id??null,focusedTag:document.activeElement?.tagName??null}));
 const bounds=await Promise.all(critical.map(locator=>locator.evaluate(node=>{
  const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {text:node.textContent,top:r.top,bottom:r.bottom,left:r.left,right:r.right,centerVisible:Boolean(hit&&node.contains(hit))};
 })));
 const path=info.outputPath(`${name}-${info.project.name}-synthetic-viewport.png`);
 await page.screenshot({path,fullPage:false,animations:'disabled'});
 await info.attach(`${name} · natural viewport · synthetic provider data`,{path,contentType:'image/png'});
 await info.attach(`${name} · natural viewport geometry`,{body:JSON.stringify({viewport,bounds},null,2),contentType:'application/json'});
 for(const bound of bounds){
  expect(bound.top,`${bound.text}: complete top in natural viewport`).toBeGreaterThanOrEqual(viewport.visualTop-1);
  expect(bound.bottom,`${bound.text}: complete bottom in natural viewport`).toBeLessThanOrEqual(viewport.visualTop+viewport.visualHeight+1);
  expect(bound.left,`${bound.text}: complete left in natural viewport`).toBeGreaterThanOrEqual(viewport.visualLeft-1);
  expect(bound.right,`${bound.text}: complete right in natural viewport`).toBeLessThanOrEqual(viewport.visualLeft+viewport.visualWidth+1);
  expect(bound.centerVisible,`${bound.text}: not obscured at its center`).toBe(true);
 }
 expect(await page.evaluate(()=>({scrollX,scrollY,focusedId:document.activeElement?.id??null}))).toEqual({scrollX:viewport.scrollX,scrollY:viewport.scrollY,focusedId:viewport.focusedId});
 expect(await page.evaluate(previous=>document.activeElement===previous,focusedElement),'capture must preserve the actual focused element').toBe(true);
 await focusedElement.dispose();
}
async function savedSelection(page:Page){
 const saved=page.getByRole('region',{name:'Saved selection',exact:true});
 await expect(saved).toBeVisible();
 await expect(saved).toContainText('No price or availability is confirmed');
 await expect(saved).not.toContainText('₹');
 return saved;
}

test('flight sign-in interruption preserves visible choice through Back, Forward and reload without repeat supplier calls',async({page,provider},info)=>{
 provider.session=null;
 provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await openFlightSearch(page);await chooseFlight(page);
 await expect(page.locator('#booking-signin-title')).toBeVisible();
 await expect(page.locator('.signin-selection-context')).toContainText('Selected fare: STANDARD');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 const historyUrl=page.url();
 expect(new URL(historyUrl).searchParams.get('resumeReview')).toBe('0');
 expect(new URL(historyUrl).searchParams.get('selectionKey')).toMatch(/^[0-9a-f-]{36}$/);
 await followAccountLink(page);
 await expect(page).toHaveURL(/\/account\?/);
 await page.goBack();
 await expect(page).toHaveURL(historyUrl);
 await expect(page.getByRole('main')).toContainText('Selected fare: STANDARD');
 await page.goForward();await expect(page).toHaveURL(/\/account\?/);
 await page.goBack();await expect(page).toHaveURL(historyUrl);
 await page.reload();
 const saved=await savedSelection(page);
 await expect(saved).toContainText('BOM → DEL');await expect(saved).toContainText('Selected fare: STANDARD');
 await expect(saved).toBeFocused();
 await naturalViewportEvidence(page,info,'saved-flight-recovery',[saved.getByRole('heading',{name:'Your saved selection',exact:true}),saved.getByRole('heading',{name:'BOM → DEL',exact:true}),saved.getByText('Selected fare: STANDARD',{exact:true}),saved.getByRole('link',{name:'Sign in to review selection',exact:true}),saved.getByRole('button',{name:'Search again',exact:true})]);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('verified history return remains view-only; explicit account Continue checks selected fare once',async({page,provider})=>{
 provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await openFlightSearch(page);await chooseFlight(page);
 await expect(page.locator('#booking-signin-title')).toBeVisible();
 const historyUrl=page.url();
 const accountUrl=await followAccountLink(page);
 provider.session=syntheticSession();delete provider.overrides['POST /api/travel/review'];
 await page.goto(historyUrl);
 const saved=await savedSelection(page);
 await expect(saved.getByRole('button',{name:'Check current price and conditions',exact:true})).toBeVisible();
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 await page.goto(accountUrl);
 await page.getByRole('link',{name:'Continue to review selection',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(2);
 expect(provider.requests('/api/travel/review')[1].body).toMatchObject({searchId,priceIds:['onward-standard']});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('hotel account interruption retains property, room and meals but never a cached price',async({page,provider},info)=>{
 provider.session=null;
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Palm House',customerEstimateMinor:800000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[{optionId:'deluxe',roomInfo:[{name:'Deluxe twin room'}],mealBasis:'BREAKFAST',pricing:{totalPrice:8000},cancellation:{isRefundable:false,penalties:[]}}]}};
 provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 await page.getByRole('button',{name:'Choose room',exact:true}).click();
 await page.getByRole('button',{name:'Review stay',exact:true}).click();
 await expect(page.locator('.signin-selection-context')).toContainText('Deluxe twin room');
 const historyUrl=page.url();
 await followAccountLink(page);await page.goBack();
 await expect(page).toHaveURL(historyUrl);
 await expect(page.getByRole('main')).toContainText('Deluxe twin room');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 await page.reload();
 const saved=await savedSelection(page);
 await expect(saved).toContainText('Palm House');await expect(saved).toContainText('Deluxe twin room');await expect(saved).toContainText('BREAKFAST');
 await expect(saved).toBeFocused();
 await naturalViewportEvidence(page,info,'saved-hotel-recovery',[saved.getByRole('heading',{name:'Your saved selection',exact:true}),saved.getByRole('heading',{name:'Palm House',exact:true}),saved.getByText('Deluxe twin room',{exact:true}),saved.getByRole('link',{name:'Sign in to review selection',exact:true}),saved.getByRole('button',{name:'Search again',exact:true})]);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const corruption of ['expired','malformed','malformed-key','superseded'] as const){
 test(`${corruption} selection cannot trigger another search or review from history`,async({page,provider})=>{
  provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
  await openFlightSearch(page);await chooseFlight(page);
  await expect(page.locator('#booking-signin-title')).toBeVisible();
  const historyUrl=page.url();
  await followAccountLink(page);
  await page.evaluate(({key,corruption})=>{
   const handoff=JSON.parse(sessionStorage.getItem(key)!);
   if(corruption==='expired')handoff.savedAt=Date.now()-14*60*1000;
   if(corruption==='malformed')handoff.selection={priceIds:[]};
   if(corruption==='superseded')handoff.key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
   sessionStorage.setItem(key,JSON.stringify(handoff));
  },{key,corruption});
  const returnUrl=new URL(historyUrl);if(corruption==='malformed-key')returnUrl.searchParams.set('selectionKey','not-a-key');
  await page.goto(returnUrl.href);
  await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText(corruption==='expired'?'Your previous selection has expired':'We couldn’t recover your selection');
  await expect(page.getByRole('region',{name:'Saved selection',exact:true})).toHaveCount(0);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
 });
}

test('account A selection cannot be restored by account B',async({page,provider})=>{
 const a=syntheticSession('account-a');provider.session={...a,user:{...a.user,emailVerified:false}};
 provider.overrides['POST /api/travel/review']={status:403,body:{error:'Verify your email before continuing.'}};
 await openFlightSearch(page);await chooseFlight(page);
 await expect(page.locator('#booking-signin-title')).toBeVisible();
 const historyUrl=page.url();
 const stored=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!),key);
 expect(stored.ownerId).toBe('account-a');
 provider.session=syntheticSession('account-b');
 await page.goto(historyUrl);
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('We couldn’t recover your selection');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
});

test('same return URL in a separate tab cannot invent a saved selection or call suppliers',async({page,provider})=>{
 provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await openFlightSearch(page);await chooseFlight(page);
 await expect(page.locator('#booking-signin-title')).toBeVisible();
 const separate=await page.context().newPage(),unexpected:string[]=[];
 // This tab has its own empty sessionStorage; intercept every API/external call
 // as strictly as the main fixture. Never let a new tab reach a real provider.
 await separate.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://127.0.0.1:3100'){await route.abort();return;}
  if(url.pathname==='/api/auth/get-session'){await route.fulfill({json:null});return;}
  if(url.pathname.startsWith('/api/')){unexpected.push(url.pathname);await route.fulfill({status:501,json:{error:'Unmocked separate-tab request'}});return;}
  await route.continue();
 });
 try{
  await separate.goto(page.url());
  await expect(separate.locator('#booking-feedback').getByRole('alert')).toContainText('We couldn’t recover your selection');
  expect(unexpected).toEqual([]);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
 }finally{await separate.close();}
});

test('slow fare check stays beside the chosen fare and blocks repeated clicks',async({page,provider},info)=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/travel/review',async route=>{await gate;await route.fallback();});
 try{
  await openFlightSearch(page);await chooseFlight(page);
  const option=page.locator('.fare-option').first(),status=option.getByRole('status');
  await expect(option.getByRole('button',{name:'Checking fare…',exact:true})).toBeDisabled();
  await expect(status).toBeVisible();
  await expect.poll(()=>status.evaluate(node=>{const r=node.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;})).toBe(true);
  await naturalViewportEvidence(page,info,'selected-fare-check-pending',[status,option.getByRole('button',{name:'Checking fare…',exact:true})]);
  await option.locator('button').last().evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
  release();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 }finally{release();}
});

test('selection that expires while open is not sent for supplier review',async({page,provider})=>{
 provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await openFlightSearch(page);await chooseFlight(page);
 await expect(page.locator('#booking-signin-title')).toBeVisible();
 const historyUrl=page.url();
 provider.session=syntheticSession();delete provider.overrides['POST /api/travel/review'];
 await page.goto(historyUrl);const saved=await savedSelection(page);
 await page.clock.setSystemTime(Date.now()+15*60*1000);
 await saved.getByRole('button',{name:'Check current price and conditions',exact:true}).click();
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('Your previous selection has expired');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
});

test('slow room review stays beside its rate and blocks repeated clicks',async({page,provider},info)=>{
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Palm House',customerEstimateMinor:800000}]}};
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/travel/review',async route=>{await gate;await route.fallback();});
 try{
  await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
  await page.getByRole('button',{name:'Choose room',exact:true}).click();
  await page.getByRole('button',{name:'Review stay',exact:true}).click();
  const option=page.locator('.room-option-card').first(),status=option.getByRole('status');
  await expect(option.getByRole('button',{name:'Checking room…',exact:true})).toBeDisabled();
  await expect(status).toBeVisible();
  await expect.poll(()=>status.evaluate(node=>{const r=node.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;})).toBe(true);
  await naturalViewportEvidence(page,info,'selected-room-check-pending',[status,option.getByRole('button',{name:'Checking room…',exact:true})]);
  await option.locator('button').last().evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
  release();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 }finally{release();}
});

test('room availability progress stays with the chosen property and prevents duplicate detail calls',async({page,provider},info)=>{
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Palm House',customerEstimateMinor:800000}]}};
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/travel/hotel-detail',async route=>{await gate;await route.fallback();});
 try{
  await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'2',autoSearch:'1'}));
  await page.getByRole('button',{name:'Choose room',exact:true}).click();
  const property=page.getByRole('article',{name:'Palm House',exact:true}),status=property.getByRole('status');
  await expect(property.getByRole('button',{name:'Checking rooms…',exact:true})).toBeDisabled();
  await expect(status).toBeVisible();
  await expect.poll(()=>status.evaluate(node=>{const r=node.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;})).toBe(true);
  await naturalViewportEvidence(page,info,'property-room-availability-pending',[status,property.getByRole('button',{name:'Checking rooms…',exact:true})]);
  await page.keyboard.press('Enter');release();
  await expect(page.getByRole('region',{name:'Room options',exact:true})).toBeVisible();
  expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 }finally{release();}
});

async function seedOwnedSelection(page:Page,ownerId:string){
 const selectionKey='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await page.goto('/account');
 await expect(page.getByRole('heading',{level:1,name:'Your account. Your next chapter.'})).toBeVisible();
 await page.evaluate(({key,ownerId,selectionKey,searchId})=>sessionStorage.setItem(key,JSON.stringify({version:1,key:selectionKey,ownerId,savedAt:Date.now(),product:'FLIGHT',searchId,selection:{priceIds:['onward-standard']},flights:[]})),{key,ownerId,selectionKey,searchId});
 return '/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',resumeSelection:'1',resumeReview:'0',selectionKey});
}

test('initial delayed account session cannot prematurely consume an owner-bound handoff',async({page,provider})=>{
 const owner=syntheticSession();provider.session=owner;
 const returnUrl=await seedOwnedSelection(page,owner.user.id);
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),pending=new Promise<void>(resolve=>{entered=resolve;});
 await page.route('**/api/auth/get-session',async route=>{entered();await gate;await route.fallback();});
 try{
  await page.goto(returnUrl);await pending;
  // The outer stableIdentity gate must keep the workspace unmounted until the
  // first session resolves, rather than interpreting pending data as sign-out.
  await expect(page.getByRole('heading',{name:'Getting your journey ready…',exact:true})).toBeVisible();
  await expect(page.locator('#booking-feedback')).toHaveCount(0);
  expect(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!).ownerId,key)).toBe(owner.user.id);
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  release();await savedSelection(page);
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
 }finally{release();}
});

test('temporary account refetch preserves owner data and the saved choice until an explicit price check',async({page,provider})=>{
 const owner=syntheticSession();provider.session=owner;
 const returnUrl=await seedOwnedSelection(page,owner.user.id);
 await page.goto(returnUrl);const saved=await savedSelection(page);
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),pending=new Promise<void>(resolve=>{entered=resolve;});
 await page.route('**/api/auth/get-session',async route=>{entered();await gate;await route.fallback();});
 try{
  // Exercise BetterAuth's real notification/refetch path. Its session atom
  // retains current.data while isRefetching; no fake React state is injected.
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'better-auth.message',newValue:JSON.stringify({event:'session',data:{trigger:'signIn'},clientId:'synthetic-refetch'}),storageArea:localStorage,url:location.href})));
  await pending;
  await expect(saved).toBeVisible();
  expect(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!).ownerId,key)).toBe(owner.user.id);
  await saved.getByRole('button',{name:'Check current price and conditions',exact:true}).click();
  await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
 }finally{release();}
});

test('an older account Continue link cannot adopt a newer saved selection',async({page,provider})=>{
 provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await openFlightSearch(page);await chooseFlight(page);
 await expect(page.locator('#booking-signin-title')).toBeVisible();
 const originalKey=new URL(page.url()).searchParams.get('selectionKey');
 const signIn=page.getByRole('link',{name:'Sign in to review selection',exact:true});
 const accountTarget=new URL((await signIn.getAttribute('href'))!,'http://127.0.0.1:3100');
 const returnTarget=new URL(accountTarget.searchParams.get('returnTo')!,'http://127.0.0.1:3100');
 expect(returnTarget.searchParams.get('selectionKey')).toBe(originalKey);
 expect(returnTarget.searchParams.get('resumeReview')).toBe('1');
 await followAccountLink(page);
 await page.evaluate(key=>{
  const handoff=JSON.parse(sessionStorage.getItem(key)!);
  handoff.key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';handoff.selection={priceIds:['different-newer-fare']};
  sessionStorage.setItem(key,JSON.stringify(handoff));
 },key);
 provider.session=syntheticSession();delete provider.overrides['POST /api/travel/review'];
 await page.reload();
 const continueLink=page.getByRole('link',{name:'Continue to review selection',exact:true});
 await expect(continueLink).toHaveAttribute('href',new RegExp(`selectionKey=${originalKey}`));
 await continueLink.click();
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('We couldn’t recover your selection');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('legacy keyless account Continue cannot adopt a newer keyed handoff',async({page,provider})=>{
 const owner=syntheticSession();provider.session=owner;
 await seedOwnedSelection(page,owner.user.id);
 const legacy='/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',resumeSelection:'1'});
 await page.goto('/account?'+new URLSearchParams({returnTo:legacy}));
 await page.getByRole('link',{name:'Continue to review selection',exact:true}).click();
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('We couldn’t recover your selection');
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('failed storage replacement clears old selection and keeps account Back free of supplier requests',async({page,provider})=>{
 provider.session=null;provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await openFlightSearch(page);await chooseFlight(page);
 await expect(page.locator('#booking-signin-title')).toBeVisible();
 expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).not.toBeNull();
 await page.evaluate(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key==='maxtravel:selection:v1')throw new DOMException('Synthetic storage quota','QuotaExceededError');return original.call(this,key,value);};
 });
 await page.getByRole('button',{name:'Back to fares',exact:true}).click();
 await page.locator('.fare-option').getByRole('button',{name:'Selected',exact:true}).click();
 await expect(page.locator('#booking-feedback')).toContainText('cannot preserve this selection');
 expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
 const historyUrl=page.url();
 expect(new URL(historyUrl).searchParams.has('resumeSelection')).toBe(false);
 expect(new URL(historyUrl).searchParams.has('autoSearch')).toBe(false);
 await followAccountLink(page,false);
 await page.goBack();await expect(page).toHaveURL(historyUrl);
 await expect(page.locator('#booking-search')).toBeVisible();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(2);
 await page.reload();
 await expect(page.getByRole('button',{name:'Search flights',exact:true})).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(2);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
