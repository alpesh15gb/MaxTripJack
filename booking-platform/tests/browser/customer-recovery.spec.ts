import { test, expect, departure, expectNoHorizontalOverflow, capture, syntheticSession } from './fixtures';

const reset='/reset-password?token=synthetic-only&returnTo=%2Fbook%3Ffrom%3DBOM%26to%3DDEL';
async function fillReset(page:import('@playwright/test').Page){
 await page.getByLabel('New password',{exact:true}).fill('SyntheticNewPassword123');
 await page.getByLabel('Confirm new password',{exact:true}).fill('SyntheticNewPassword123');
}
test('lost reset response offers reconciliation, preserves destination and never blindly resubmits',async({page,provider},info)=>{
 provider.session=null;let writes=0;
 await page.route('**/api/auth/reset-password',route=>{writes++;return route.abort('failed');});
 await page.goto(reset);await fillReset(page);
 await page.getByRole('button',{name:'Update password',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('could not confirm whether your password changed');
 await expect(page.getByRole('heading',{name:'Password updated',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Update password',exact:true})).toBeDisabled();
 await expect(page.getByLabel('New password',{exact:true})).toHaveValue('SyntheticNewPassword123');
 await expectNoHorizontalOverflow(page);await capture(page,info,'reset-unknown-outcome');
 await page.getByRole('link',{name:'Request a fresh reset link',exact:true}).click();
 await expect(page.getByRole('button',{name:'Send reset link',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/returnTo=%2Fbook%3Ffrom%3DBOM%26to%3DDEL&mode=reset/);
 expect(writes).toBe(1);
});
test('overdue reset ignores late success and duplicate submit events',async({page,provider})=>{
 provider.session=null;await page.clock.install();let writes=0;let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/auth/reset-password',async route=>{writes++;await held;await route.fulfill({json:{status:true}});});
 try{
  await page.goto(reset);await fillReset(page);
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  await expect.poll(()=>writes).toBe(1);
  await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await page.clock.fastForward(15_001);
  await expect(page.getByRole('alert')).toContainText('could not confirm whether your password changed');
 }finally{const response=page.waitForResponse('**/api/auth/reset-password');release();await response;}
 await page.clock.fastForward(100);
 await expect(page.getByRole('button',{name:'Update password',exact:true})).toBeDisabled();
 await expect(page.getByRole('heading',{name:'Password updated',exact:true})).toHaveCount(0);
 expect(writes).toBe(1);
});
test('explicit expired reset remains recoverable and missing link goes directly to recovery form',async({page,provider})=>{
 provider.session=null;
 provider.overrides['POST /api/auth/reset-password']={status:400,body:{message:'Reset link expired. Request a new link.'}};
 await page.goto(reset);await fillReset(page);await page.getByRole('button',{name:'Update password',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Reset link expired');
 await expect(page.getByRole('button',{name:'Update password',exact:true})).toBeEnabled();
 await page.goto('/reset-password?returnTo=%2Ftravellers');
 await page.getByRole('link',{name:'Back to account recovery',exact:true}).click();
 await expect(page.getByRole('button',{name:'Send reset link',exact:true})).toBeVisible();
 expect(provider.requests('/api/auth/request-password-reset')).toHaveLength(0);
});
test('SMTP-blocked registration gives a truthful next step, not a check-email success',async({page,provider},info)=>{
 provider.session=null;provider.overrides['POST /api/auth/sign-up/email']={status:503,body:{error:'Registration opens after email verification delivery is configured.'}};
 await page.goto('/account');await page.getByRole('button',{name:'Create account',exact:true}).first().click();
 await page.getByLabel('Your name',{exact:true}).fill('Synthetic Person');await page.getByLabel('Email',{exact:true}).fill('person@example.test');await page.getByLabel('Password',{exact:true}).fill('SyntheticPassword123');
 await page.getByRole('button',{name:'Create account',exact:true}).last().click();
 await expect(page.getByRole('status')).toContainText('Account creation is temporarily unavailable');
 await expect(page.getByRole('status')).toContainText('Email verification is required');
 await expect(page.getByRole('heading',{name:'Check your email',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue('person@example.test');
 await expectNoHorizontalOverflow(page);await capture(page,info,'signup-delivery-unavailable');
});
const pending={id:'73333333-3333-4333-8333-333333333333',reference:'MX-PRIVATE-PENDING',status:'PAYMENT_PENDING',product:'FLIGHT',currency:'INR',total_minor:'654000',created_at:'2026-10-23T12:00:00Z',itinerary_summary:{from:'BOM',to:'DEL',date:departure,adults:1}};
test('lost access during pending-status refresh removes private records and stops polling',async({page,provider},info)=>{
 await page.clock.install();provider.bookingsPages['1']={bookings:[pending],hasMore:true};
 await page.goto('/my-trips');await expect(page.getByText(pending.reference,{exact:true})).toBeVisible();
 provider.overrides['GET /api/bookings']={status:401,body:{error:'Sign in required.'}};
 await page.clock.fastForward(5_000);
 await expect(page.getByRole('alert')).toContainText('Sign in again to view your private booking updates');
 await expect(page.getByText(pending.reference,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Load older trips',exact:true})).toHaveCount(0);
 const reads=provider.requests('/api/bookings').length;await page.clock.fastForward(20_000);expect(provider.requests('/api/bookings')).toHaveLength(reads);
 await expect(page.getByRole('link',{name:'Open account',exact:true})).toHaveAttribute('href','/account?returnTo=%2Fmy-trips');
 await expectNoHorizontalOverflow(page);await capture(page,info,'trips-access-expired');
 delete provider.overrides['GET /api/bookings'];await page.reload();await expect(page.getByText(pending.reference,{exact:true})).toBeVisible();
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});
test('lost access during older-trip loading clears retained private records',async({page,provider})=>{
 provider.bookingsPages['1']={bookings:[{...pending,status:'TICKETED'}],hasMore:true};await page.goto('/my-trips');
 await expect(page.getByText(pending.reference,{exact:true})).toBeVisible();
 provider.overrides['GET /api/bookings']={status:403,body:{error:'Verified account required.'}};
 await page.getByRole('button',{name:'Load older trips',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Access to these booking details is no longer available');await expect(page.getByText(pending.reference,{exact:true})).toHaveCount(0);
});

test('unknown reset retires the token from current history so reload cannot replay it',async({page,provider})=>{
 provider.session=null;let writes=0;
 await page.route('**/api/auth/reset-password',route=>{writes++;return route.abort('failed');});
 await page.goto(reset);await fillReset(page);await page.getByRole('button',{name:'Update password',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('could not confirm whether your password changed');
 await expect(page).not.toHaveURL(/token=/);
 await page.reload();await expect(page.getByLabel('New password',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Back to account recovery',exact:true})).toBeVisible();expect(writes).toBe(1);
});

test('leaving a pending reset ignores its late completion and keeps the new page',async({page,provider})=>{
 provider.session=null;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let writes=0;
 await page.route('**/api/auth/reset-password',async route=>{writes++;await held;await route.fulfill({json:{status:true}});});
 try{
  await page.goto(reset);await fillReset(page);await page.getByRole('button',{name:'Update password',exact:true}).click();await expect.poll(()=>writes).toBe(1);
  await page.getByRole('link',{name:'← Account',exact:true}).click();
  await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 }finally{const response=page.waitForResponse('**/api/auth/reset-password');release();await response;}
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page).toHaveURL(/\/account\?/);await expect(page.getByRole('heading',{name:'Password updated',exact:true})).toHaveCount(0);
});

test('switching account recovery modes retains email but clears password and never submits on navigation',async({page,provider})=>{
 provider.session=null;await page.goto('/account?returnTo=%2Ftravellers');
 await page.getByLabel('Email',{exact:true}).fill('person@example.test');await page.getByLabel('Password',{exact:true}).fill('SyntheticPassword123');
 await page.getByRole('button',{name:'Need a verification email?',exact:true}).click();
 await expect(page.getByLabel('Email for verification',{exact:true})).toHaveValue('person@example.test');
 await page.getByRole('button',{name:'Back to sign in',exact:true}).click();
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue('person@example.test');await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Reset password',exact:true}).click();await expect(page.getByLabel('Email',{exact:true})).toHaveValue('person@example.test');
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

test('leaving a pending sign-in prevents its late response from redirecting the new journey',async({page,provider})=>{
 provider.session=null;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let writes=0;
 await page.route('**/api/auth/sign-in/email',async route=>{writes++;await held;await route.fulfill({json:{user:{id:'synthetic'},token:null}});});
 try{
  await page.goto('/account?returnTo=%2Ftravellers');await page.getByLabel('Email',{exact:true}).fill('person@example.test');await page.getByLabel('Password',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Sign in',exact:true}).last().click();await expect.poll(()=>writes).toBe(1);
  await page.locator('.account-shell').getByRole('link',{name:'← Max Travel home',exact:true}).click();await expect(page).toHaveURL('/');
 }finally{const response=page.waitForResponse('**/api/auth/sign-in/email');release();await response;}
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page).toHaveURL('/');expect(writes).toBe(1);
});

test('pending reset retires its URL token before reload and browser Back cannot auto-replay the write',async({page,provider})=>{
 provider.session=null;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let writes=0;
 await page.route('**/api/auth/reset-password',async route=>{writes++;await held;await route.fulfill({json:{status:true}});});
 try{
  await page.goto('/account');await page.goto(reset);await fillReset(page);
  await page.getByRole('button',{name:'Update password',exact:true}).click();await expect.poll(()=>writes).toBe(1);
  await expect(page).not.toHaveURL(/token=/);
  expect(await page.evaluate(()=>JSON.stringify(history.state))).not.toContain("synthetic-only");
  await page.reload();await expect(page.getByLabel('New password',{exact:true})).toHaveCount(0);
  await page.goBack();await expect(page).toHaveURL('/account');await page.goForward();
  await expect(page).not.toHaveURL(/token=/);await expect(page.getByLabel('New password',{exact:true})).toHaveCount(0);
 }finally{release();}
 expect(writes).toBe(1);
});

test('a malformed successful HTTP reset response is still an unknown password outcome',async({page,provider})=>{
 provider.session=null;provider.overrides['POST /api/auth/reset-password']={body:{}};
 await page.goto(reset);await fillReset(page);await page.getByRole('button',{name:'Update password',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('could not confirm whether your password changed');
 await expect(page.getByRole('heading',{name:'Password updated',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Update password',exact:true})).toBeDisabled();
});

// Exercise the installed cross-tab storage notification using a real same-origin
// second tab. Its entire document is mocked; it never loads application APIs.
async function refreshSession(page:import('@playwright/test').Page){
 const other=await page.context().newPage();
 try{
  await other.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic session notification only</title>'}));
  await other.goto('http://127.0.0.1:3100/synthetic-session-notification');
  await other.evaluate(()=>localStorage.setItem('better-auth.message',JSON.stringify({event:'session',data:{trigger:'getSession'},clientId:'synthetic-test-tab',timestamp:Date.now()})));
 }finally{await other.close();}
}

test('settled trip history is identity-bound and clears derived search/filter state across A to B',async({page,provider})=>{

 const a=syntheticSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 const b=syntheticSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 provider.session=a;provider.bookingsPages['1']={bookings:[{...pending,status:'TICKETED',reference:'MX-ACCOUNT-A-PRIVATE'}],hasMore:true};
 await page.goto('/my-trips');await expect(page.getByText('MX-ACCOUNT-A-PRIVATE',{exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search loaded bookings'}).fill('ACCOUNT-A-PRIVATE');
 await page.getByRole('button',{name:'Flights',exact:true}).click();
 await page.getByRole('button',{name:'Upcoming & current',exact:true}).click();
 provider.session=b;provider.bookingsPages['1']={bookings:[{...pending,id:'74444444-4444-4444-8444-444444444444',reference:'MX-ACCOUNT-B-PRIVATE',status:'CONFIRMED',product:'HOTEL',itinerary_summary:{hotelName:'Account B stay',checkIn:departure,checkOut:departure,rooms:[{adults:1}]}}],hasMore:false};
 await refreshSession(page);
 await expect(page.getByText('MX-ACCOUNT-B-PRIVATE',{exact:true})).toBeVisible();
 await expect(page.getByText('MX-ACCOUNT-A-PRIVATE',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('searchbox',{name:'Search loaded bookings'})).toHaveValue('');
 await expect(page.getByRole('button',{name:'All trips',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Any travel date',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Load older trips',exact:true})).toHaveCount(0);
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

test('a late A confirmation cannot surface or revoke access after B becomes the settled identity',async({page,provider})=>{
 provider.session=syntheticSession('account-a');
 provider.bookingsPages['1']={bookings:[{...pending,status:'TICKETED',reference:'MX-ACCOUNT-A'}],hasMore:false};
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;let finished=false;
 await page.route(`**/api/bookings/${pending.id}/details`,async route=>{requested=true;await held;try{await route.fulfill({status:403,json:{error:'A no longer authorized'}});}catch{/* The old component may already have aborted this read. */}finally{finished=true;}});
 try{
  await page.goto('/my-trips');await page.getByRole('button',{name:'View confirmation details',exact:true}).click();await expect.poll(()=>requested).toBe(true);
  provider.session=syntheticSession('account-b');provider.bookingsPages['1']={bookings:[{...pending,id:'74444444-4444-4444-8444-444444444444',status:'TICKETED',reference:'MX-ACCOUNT-B'}],hasMore:false};
  await refreshSession(page);await expect(page.getByText('MX-ACCOUNT-B',{exact:true})).toBeVisible();
 }finally{release();}
 await expect.poll(()=>finished).toBe(true);
 await expect(page.getByText('MX-ACCOUNT-A',{exact:true})).toHaveCount(0);
 await expect(page.getByText('MX-ACCOUNT-B',{exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});

for(const status of [401,403] as const)test(`confirmation ${status} removes the whole private workspace with truthful access feedback`,async({page,provider})=>{
 provider.bookingsPages['1']={bookings:[{...pending,status:'TICKETED'}],hasMore:true};
 provider.overrides[`GET /api/bookings/${pending.id}/details`]={status,body:{error:'Synthetic access change'}};
 await page.goto('/my-trips');await page.getByRole('searchbox',{name:'Search loaded bookings'}).fill('MX-PRIVATE');
 await page.getByRole('button',{name:'View confirmation details',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText(status===401?'Sign in again':'Access to these booking details is no longer available');
 if(status===403)await expect(page.getByRole('alert')).toContainText('does not establish that you were signed out');
 await expect(page.getByText(pending.reference,{exact:true})).toBeHidden();
 await expect(page.getByRole('link',{name:'Download confirmation PDF',exact:true})).toHaveCount(0);
 await expect(page.getByRole('searchbox',{name:'Search loaded bookings'})).toHaveCount(0);
 await expect(page.locator('.trip-management')).toHaveCount(0);
});

test('settled trips hide on network uncertainty and clear on confirmed sign-out',async({page,provider})=>{
 provider.bookingsPages['1']={bookings:[{...pending,status:'TICKETED'}],hasMore:false};await page.goto('/my-trips');await expect(page.getByText(pending.reference,{exact:true})).toBeVisible();
 provider.overrides['GET /api/auth/get-session']={status:503,body:{message:'Synthetic unavailable'}};await refreshSession(page);
 await expect(page.getByRole('alert')).toContainText('couldn’t verify account access');
 await expect(page.getByRole('alert')).toContainText('does not establish that you were signed out');
 await expect(page.getByText(pending.reference,{exact:true})).toBeHidden();
 delete provider.overrides['GET /api/auth/get-session'];provider.session=null;
 await page.getByRole('button',{name:'Check account access',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Sign in to view your private booking updates');
 await expect(page.getByText(pending.reference,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Open account',exact:true})).toBeVisible();
});

test('MFA enrollment secrets and pending completion are scoped to the authenticated identity',async({page,provider})=>{
 provider.session=syntheticSession('account-a');
 provider.overrides['POST /api/auth/two-factor/enable']={body:{totpURI:'otpauth://totp/SYNTHETIC-A?secret=NOTAREALSECRET',backupCodes:['SYNTHETIC-A-BACKUP']}};
 await page.goto('/account');await page.locator('.account-card').getByLabel('Current password',{exact:true}).first().fill('SyntheticPassword123');
 await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();
 await expect(page.getByLabel('Authenticator setup URI',{exact:true})).toHaveValue('otpauth://totp/SYNTHETIC-A?secret=NOTAREALSECRET');
 provider.session=syntheticSession('account-b');await refreshSession(page);
 await expect(page.getByRole('button',{name:'Set up authenticator',exact:true})).toBeVisible();
 await expect(page.getByLabel('Authenticator setup URI',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Backup codes',{exact:true})).toHaveCount(0);
 await expect(page.locator('.account-card').getByLabel('Current password',{exact:true}).first()).toHaveValue('');
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await page.route('**/api/auth/two-factor/enable',async route=>{requested=true;await held;await route.fulfill({json:{totpURI:'otpauth://totp/SYNTHETIC-B?secret=NOTAREALSECRET',backupCodes:['SYNTHETIC-B-BACKUP']}});});
 try{
  await page.locator('.account-card').getByLabel('Current password',{exact:true}).first().fill('SyntheticPassword123');await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();await expect.poll(()=>requested).toBe(true);
  provider.session=syntheticSession('account-c');await refreshSession(page);await expect(page.getByRole('button',{name:'Set up authenticator',exact:true})).toBeVisible();
 }finally{const response=page.waitForResponse('**/api/auth/two-factor/enable');release();await response;}
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page.getByLabel('Authenticator setup URI',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Backup codes',{exact:true})).toHaveCount(0);
});

test('a transient session check hides security without clearing an unknown password-write lock',async({page,provider})=>{
 await page.goto('/account');let writes=0;
 await page.route('**/api/auth/change-password',route=>{writes++;return route.abort('failed');});
 const security=page.getByRole('region',{name:'Password and signed-in devices',exact:true});
 await security.getByLabel('Current password',{exact:true}).fill('SyntheticCurrent123');
 await security.getByLabel('New password',{exact:true}).fill('SyntheticNewPassword123');
 await security.getByLabel('Confirm new password',{exact:true}).fill('SyntheticNewPassword123');
 await security.getByRole('button',{name:'Change password',exact:true}).click();
 await expect(security.getByRole('button',{name:'Change password',exact:true})).toBeDisabled();
 provider.overrides['GET /api/auth/get-session']={status:503,body:{message:'Synthetic temporary failure'}};await refreshSession(page);
 await expect(page.locator('.account-card').getByRole('alert')).toContainText('couldn’t verify account access');
 await expect(security).toBeHidden();
 delete provider.overrides['GET /api/auth/get-session'];await page.getByRole('button',{name:'Check account access',exact:true}).click();
 await expect(security).toBeVisible();await expect(security.getByRole('button',{name:'Change password',exact:true})).toBeDisabled();
 await expect(security.getByRole('status')).toContainText('could not confirm whether your password changed');expect(writes).toBe(1);
});

test('late successful A pagination cannot merge private history into B records',async({page,provider})=>{
 provider.session=syntheticSession('account-a');provider.bookingsPages['1']={bookings:[{...pending,status:'TICKETED',reference:'MX-A-NEW'}],hasMore:true};
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requested=false;let finished=false;
 await page.route('**/api/bookings?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('page')!=='2'){await route.fallback();return;}
  requested=true;await held;
  try{await route.fulfill({json:{bookings:[{...pending,id:'74444444-4444-4444-8444-444444444444',status:'TICKETED',reference:'MX-A-LATE-PRIVATE'}],hasMore:false}});}catch{/* Identity teardown aborts this old read. */}finally{finished=true;}
 });
 try{
  await page.goto('/my-trips');await page.getByRole('button',{name:'Load older trips',exact:true}).click();await expect.poll(()=>requested).toBe(true);
  provider.session=syntheticSession('account-b');provider.bookingsPages['1']={bookings:[{...pending,id:'75555555-5555-4555-8555-555555555555',status:'TICKETED',reference:'MX-B-CURRENT'}],hasMore:false};
  await refreshSession(page);await expect(page.getByText('MX-B-CURRENT',{exact:true})).toBeVisible();
 }finally{release();}
 await expect.poll(()=>finished).toBe(true);
 await expect(page.getByRole('article')).toHaveCount(1);
 await expect(page.getByText('MX-A-LATE-PRIVATE',{exact:true})).toHaveCount(0);
 await expect(page.getByText('MX-A-NEW',{exact:true})).toHaveCount(0);
 await expect(page.getByText('MX-B-CURRENT',{exact:true})).toBeVisible();
});

test('lost cancellation preserves its same-request key across a transient session failure',async({page,provider})=>{
 provider.bookingsPages['1']={bookings:[{...pending,status:'CONFIRMED',product:'HOTEL'}],hasMore:false};
 provider.overrides[`GET /api/bookings/${pending.id}/cancellation-offer`]={body:{requests:[]}};
 const writes:Record<string,unknown>[]=[];
 await page.route(`**/api/bookings/${pending.id}/cancellation`,async route=>{
  writes.push(route.request().postDataJSON());
  if(writes.length===1)await route.abort('failed');else await route.fulfill({json:{message:'Synthetic existing request received; travel remains active.'}});
 });
 await page.goto('/my-trips');await page.locator('.trip-management>summary').click();
 await page.getByLabel('Reason for cancellation',{exact:true}).fill('Synthetic changed plans');
 await page.getByRole('button',{name:'Request cancellation terms',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry existing cancellation request',exact:true})).toBeVisible();
 await expect(page.getByLabel('Reason for cancellation',{exact:true})).toBeDisabled();
 provider.overrides['GET /api/auth/get-session']={status:503,body:{message:'Synthetic temporary outage'}};await refreshSession(page);
 await expect(page.getByRole('alert')).toContainText('couldn’t verify account access');
 await expect(page.locator('.trip-cancellation-request')).toBeHidden();
 delete provider.overrides['GET /api/auth/get-session'];await page.getByRole('button',{name:'Check account access',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry existing cancellation request',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry existing cancellation request',exact:true}).click();
 await expect(page.getByText('Synthetic existing request received; travel remains active.',{exact:true})).toBeVisible();
 expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);expect(writes[0].requestKey).toBeTruthy();
});
