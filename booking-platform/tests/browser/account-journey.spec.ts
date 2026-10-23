import type { Page, TestInfo } from '@playwright/test';
import { test, expect, capture, departure, expectNoHorizontalOverflow, syntheticSession } from './fixtures';

const destination='/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',resumeSelection:'1'});
const account='/account?'+new URLSearchParams({returnTo:destination});
async function evidence(page:Page,info:TestInfo,name:string){
 await expectNoHorizontalOverflow(page);
 await capture(page,info,name);
 const path=info.outputPath(`${name}-viewport-${info.project.name}-synthetic.png`);
 await page.screenshot({path,animations:'disabled'});
 await info.attach(`${name} actual viewport`,{path,contentType:'image/png'});
}

test('booking return explains sign-in purpose without authenticating or claiming a reservation',async({page,provider},info)=>{
 provider.session=null;
 await page.goto(account);
 await expect(page.getByRole('heading',{level:1,name:'Sign in to review your selection'})).toBeVisible();
 await expect(page.getByRole('main')).toContainText('nothing is booked by signing in');
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Continue to review selection',exact:true})).toHaveCount(0);
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
 await evidence(page,info,'account-booking-signin-purpose');
});

test('verified existing session has an explicit safe return action instead of an automatic redirect',async({page,provider},info)=>{
 await page.goto(account);
 const context=page.getByRole('region',{name:'Continue your booking journey'});
 const link=context.getByRole('link',{name:'Continue to review selection',exact:true});
 await expect(link).toBeVisible();await expect(link).toHaveAttribute('href',destination);
 await expect(page).toHaveURL(new RegExp('/account\\?'));
 await expect(context).toContainText('Selections stay in the original tab for a short time');
 await expect(link).toHaveClass('primary');
 await expect(page.locator('.account-links').getByRole('link',{name:'My trips',exact:true})).toHaveClass('secondary');
 await expect(page.getByRole('button',{name:'Set up authenticator',exact:true})).toHaveClass('secondary');
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 await evidence(page,info,'account-verified-return');
});

test('unverified existing session can request verification with cooldown and continue only after refreshed verified state',async({page,provider},info)=>{
 const session=syntheticSession();provider.session={...session,user:{...session.user,emailVerified:false}};
 provider.overrides['POST /api/auth/send-verification-email']={body:{status:true}};
 await page.goto(account);
 const context=page.getByRole('region',{name:'Continue your booking journey'});
 await expect(page.getByRole('heading',{level:1,name:'Verify your email to continue'})).toBeVisible();
 await expect(context.getByRole('link',{name:'Continue to review selection',exact:true})).toHaveCount(0);
 expect(provider.requests('/api/auth/send-verification-email')).toHaveLength(0);
 await context.getByRole('button',{name:'Send verification email',exact:true}).click();
 await expect(context.getByRole('status')).toContainText('If this email has an unverified account');
 await expect(context.getByRole('button',{name:/Resend available in/})).toBeDisabled();
 expect(provider.requests('/api/auth/send-verification-email')).toHaveLength(1);
 expect(provider.requests('/api/auth/send-verification-email')[0].body).toEqual({email:session.user.email,callbackURL:account});
 await evidence(page,info,'account-existing-session-verification');
 provider.session=session;
 await context.getByRole('button',{name:'Check verification status',exact:true}).click();
 await expect(context.getByRole('link',{name:'Continue to review selection',exact:true})).toBeVisible();
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('verification failure keeps the return action blocked and shows local truthful feedback',async({page,provider})=>{
 const session=syntheticSession();provider.session={...session,user:{...session.user,emailVerified:false}};
 provider.overrides['POST /api/auth/send-verification-email']={status:503,body:{message:'Synthetic unavailable'}};
 await page.goto(account);
 const context=page.getByRole('region',{name:'Continue your booking journey'});
 await context.getByRole('button',{name:'Send verification email',exact:true}).click();
 await expect(context.getByRole('status')).toContainText('Your account status has not been changed');
 await expect(context.getByRole('link',{name:'Continue to review selection',exact:true})).toHaveCount(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('ordinary and malicious account returns do not invent a booking handoff',async({page,provider})=>{
 for(const url of ['/account','/account?'+new URLSearchParams({returnTo:'https://example.invalid/book?resumeSelection=1'})]){
  await page.goto(url);
  await expect(page.getByRole('heading',{level:1,name:'Your account. Your next chapter.'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Continue your booking journey'})).toHaveCount(0);
  await expect(page.locator('.account-links').getByRole('link',{name:'My trips',exact:true})).toHaveAttribute('href','/my-trips');
  await expect(page.locator('.account-links').getByRole('link',{name:'My trips',exact:true})).toHaveClass('primary');
 }
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

test('return without selection intent offers search rather than pretending a fare is saved',async({page,provider})=>{
 const session=syntheticSession();provider.session={...session,user:{...session.user,emailVerified:false}};
 const search='/book?from=BOM&to=DEL';
 await page.goto('/account?'+new URLSearchParams({returnTo:search}));
 await expect(page.getByRole('heading',{level:1,name:'Continue your search'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Return to search',exact:true})).toHaveAttribute('href',search);
 await expect(page.getByRole('link',{name:'Continue to review selection',exact:true})).toHaveCount(0);
});

test('expired selection returns to honest retained-criteria search without automatic provider calls',async({page,provider})=>{
 await page.goto(account);
 await page.evaluate(()=>sessionStorage.setItem('maxtravel:selection:v1',JSON.stringify({version:1,savedAt:0,product:'FLIGHT',searchId:'11111111-1111-4111-8111-111111111111',selection:{priceIds:['synthetic-expired']},flights:[]})));
 await page.getByRole('link',{name:'Continue to review selection',exact:true}).click();
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('Your previous selection has expired');
 await expect(page.getByRole('button',{name:'Search flights',exact:true})).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('failed verification-status refresh never reveals a ready action and can recover explicitly',async({page,provider})=>{
 const session=syntheticSession();provider.session={...session,user:{...session.user,emailVerified:false}};
 await page.goto(account);
 const context=page.getByRole('region',{name:'Continue your booking journey'});
 await expect(context.getByRole('button',{name:'Check verification status',exact:true})).toBeVisible();
 provider.overrides['GET /api/auth/get-session']={status:503,body:{message:'Synthetic session check unavailable'}};
 await context.getByRole('button',{name:'Check verification status',exact:true}).click();
 await expect(context.getByRole('alert')).toContainText('couldn’t refresh your account status');
 await expect(context.getByRole('link',{name:'Continue to review selection',exact:true})).toHaveCount(0);
 delete provider.overrides['GET /api/auth/get-session'];provider.session=session;
 await context.getByRole('button',{name:'Check verification status',exact:true}).click();
 await expect(context.getByRole('link',{name:'Continue to review selection',exact:true})).toBeVisible();
 expect(provider.requests('/api/auth/send-verification-email')).toHaveLength(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('retained verified session cannot advertise readiness during an uncertain held retry',async({page,provider},info)=>{
 await page.goto(account);
 const context=page.getByRole('region',{name:'Continue your booking journey'});
 const ready=context.getByRole('link',{name:'Continue to review selection',exact:true});
 await expect(ready).toBeVisible();
 provider.overrides['GET /api/auth/get-session']={status:503,body:{message:'Synthetic background session failure'}};
 // Exercise the installed client's real visibility-refetch handler, not its private state.
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(context.getByRole('alert')).toContainText('couldn’t refresh your account status');
 await expect(ready).toHaveCount(0);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await page.route('**/api/auth/get-session**',async route=>{requested=true;await held;await route.fulfill({json:provider.session});});
 try{
  await context.getByRole('button',{name:'Check verification status',exact:true}).click();
  await expect.poll(()=>requested).toBe(true);
  await expect(context.getByRole('status')).toContainText('Please wait for the current account check');
  await expect(page.getByRole('heading',{level:1,name:'Checking your account…',exact:true})).toBeVisible();
  await expect(ready).toHaveCount(0);
  await evidence(page,info,'account-verification-status-pending');
 }finally{release();}
 await expect(ready).toBeVisible();
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('missing tab selection is not described as expired and never starts a provider call',async({page,provider},info)=>{
 await page.goto(account);
 await page.evaluate(()=>sessionStorage.removeItem('maxtravel:selection:v1'));
 await page.getByRole('link',{name:'Continue to review selection',exact:true}).click();
 const feedback=page.locator('#booking-feedback').getByRole('alert');
 await expect(feedback).toContainText('We couldn’t recover your selection in this tab');
 await expect(feedback).toContainText('Return to the original tab, or search again');
 await expect(feedback).not.toContainText('has expired');
 await expect(page.getByRole('button',{name:'Search flights',exact:true})).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await evidence(page,info,'selection-missing-this-tab');
});

test('corrupt or future tab selections fail closed without claiming expiry',async({page,provider})=>{
 for(const stored of ['not-json',JSON.stringify({version:1,savedAt:Date.now()+60_000,product:'FLIGHT',searchId:'11111111-1111-4111-8111-111111111111',selection:{priceIds:['synthetic-future']},flights:[]})]){
  await page.goto(account);
  await page.evaluate(value=>sessionStorage.setItem('maxtravel:selection:v1',value),stored);
  await page.getByRole('link',{name:'Continue to review selection',exact:true}).click();
  const feedback=page.locator('#booking-feedback').getByRole('alert');
  await expect(feedback).toContainText('We couldn’t recover your selection in this tab');
  await expect(feedback).not.toContainText('has expired');
 }
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('unreadable browser storage gives a recoverable search explanation, not invented expiry',async({page,provider})=>{
 await page.addInitScript(()=>{
  const original=Storage.prototype.getItem;
  Storage.prototype.getItem=function(key){if(key==='maxtravel:selection:v1')throw new DOMException('Synthetic storage restriction','SecurityError');return original.call(this,key);};
 });
 await page.goto(destination);
 await expect(page.locator('#booking-feedback').getByRole('alert')).toContainText('We couldn’t recover your selection in this tab');
 await expect(page.locator('#booking-feedback')).not.toContainText('has expired');
 await expect(page.getByRole('button',{name:'Search flights',exact:true})).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
