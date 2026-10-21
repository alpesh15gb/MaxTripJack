import { test, expect, capture, expectNoHorizontalOverflow } from './fixtures';

test('account sign-in and registration share an accessible responsive workspace', async ({ page, provider }, testInfo) => {
  provider.session = null;
  await page.goto('/account');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create account', exact: true }).first().click();
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('minlength', '12');
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'account-registration');
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});

test('saved travellers show a useful empty state and confirm before removal', async ({ page, provider }, testInfo) => {
  await page.goto('/travellers');
  await expect(page.getByRole('heading', { name: 'A familiar face, a faster checkout.' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'travellers-empty');
  provider.overrides['GET /api/travellers'] = { body: { travellers: [{ id: 'fixture-traveller', name: 'Alex Example', profile: { pt: 'ADULT', ti: 'Mr', fN: 'Alex', lN: 'Example' } }] } };
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Alex Example' })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Remove saved profile' }).click();
  expect(provider.calls.filter(call => call.method === 'DELETE')).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Alex');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('traveller access failure is not mistaken for an empty saved list', async ({ page, provider }) => {
  provider.overrides['GET /api/travellers'] = { status: 401, body: { error: 'Sign in to view saved travellers.' } };
  await page.goto('/travellers');
  await expect(page.getByRole('heading', { name: 'Sign in to manage your travellers.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A familiar face, a faster checkout.' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('password reset keeps invalid links local and exposes clear recovery feedback', async ({ page, provider }, testInfo) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Reset link is missing or invalid.');
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to account recovery' })).toBeVisible();
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'password-reset-invalid-link');
});

test('operations tables and desk navigation stay responsive without executing actions', async ({ page, provider }, testInfo) => {
  provider.overrides['GET /api/admin/bookings'] = { body: { rows: [{ id: 'synthetic-booking', reference: 'TEST-ONLY', status: 'PAYMENT_PENDING', customer: 'Synthetic account', supplier_response: { confirmation: 'Pending; not a ticket' } }], hasMore: false } };
  provider.overrides['GET /api/admin/companies'] = { body: { rows: [], hasMore: false } };
  await page.goto('/operations');
  await expect(page.getByRole('region', { name: 'bookings records', exact: true })).toContainText('TEST-ONLY');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'operations-bookings');
  await page.getByRole('navigation', { name: 'Operations desks' }).getByRole('button', { name: 'companies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approve a company account', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No records to show.', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});

test('operations access failure is shown as unavailable rather than no records', async ({ page, provider }) => {
  provider.overrides['GET /api/admin/bookings'] = { status: 403, body: { error: 'Verified staff access is required.' } };
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Records are unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No records to show.', exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});


test('verification recovery is explicit, generic and cooldown protected', async ({ page, provider }) => {
  provider.session = null;
  provider.overrides['POST /api/auth/sign-up/email'] = { body: { user: { id: 'synthetic', email: 'person@example.test', emailVerified: false }, token: null } };
  provider.overrides['POST /api/auth/send-verification-email'] = { body: { status: true } };
  await page.goto('/account?returnTo=%2Fbook%3Ffrom%3DBOM%26to%3DDEL');
  await page.getByRole('button', { name: 'Create account', exact: true }).first().click();
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic Person');
  await page.getByLabel('Email', { exact: true }).fill('person@example.test');
  await page.getByLabel('Password', { exact: true }).fill('SyntheticPasswordOnly123');
  await page.getByRole('button', { name: 'Create account', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend available in/ })).toBeDisabled();
  const signup = provider.requests('/api/auth/sign-up/email')[0].body as {callbackURL:string};
  expect(signup.callbackURL).toBe('/account?returnTo=%2Fbook%3Ffrom%3DBOM%26to%3DDEL');
  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  expect(provider.requests('/api/auth/send-verification-email')).toHaveLength(0);
});

test('sign-in returns to the requested customer workspace and rejects external returns', async ({ page, provider }) => {
  provider.session = null;
  provider.overrides['POST /api/auth/sign-in/email'] = { body: { user: { id: 'synthetic' }, token: null } };
  await page.goto('/account?returnTo=https%3A%2F%2Fevil.example');
  await page.getByLabel('Email', { exact: true }).fill('person@example.test');
  await page.getByLabel('Password', { exact: true }).fill('SyntheticPasswordOnly123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page).toHaveURL('/my-trips');
});

test('valid reset completion preserves the safe destination without keeping the password form', async ({ page, provider }) => {
  provider.session = null;
  provider.overrides['POST /api/auth/reset-password'] = { body: { status: true } };
  await page.goto('/reset-password?token=synthetic-reset-token&returnTo=%2Ftravellers');
  await page.getByLabel('New password', { exact: true }).fill('SyntheticPasswordOnly123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('SyntheticPasswordOnly123');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in and continue' })).toHaveAttribute('href', '/account?returnTo=%2Ftravellers');
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
});

test('verification resend uses the supported endpoint and prevents immediate repeats', async ({ page, provider }) => {
  provider.session = null;
  provider.overrides['POST /api/auth/send-verification-email'] = { body: { status: true } };
  await page.goto('/account?returnTo=%2Ftravellers');
  await page.getByRole('button', { name: 'Need a verification email?' }).click();
  await page.getByLabel('Email for verification').fill('person@example.test');
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If this email has an unverified account');
  await expect(page.getByRole('button', { name: /Resend available in/ })).toBeDisabled();
  const calls = provider.requests('/api/auth/send-verification-email');
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toMatchObject({ email: 'person@example.test', callbackURL: '/account?returnTo=%2Ftravellers' });
});

test('two-factor sign-in keeps the safe return destination until verification succeeds', async ({ page, provider }) => {
  provider.session = null;
  provider.overrides['POST /api/auth/sign-in/email'] = { body: { twoFactorRedirect: true } };
  provider.overrides['POST /api/auth/two-factor/verify-totp'] = { body: { user: { id: 'synthetic' }, token: null } };
  await page.goto('/account?returnTo=%2Ftravellers');
  await page.getByLabel('Email', { exact: true }).fill('person@example.test');
  await page.getByLabel('Password', { exact: true }).fill('SyntheticPasswordOnly123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByLabel('Authenticator code', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/account\?/);
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page).toHaveURL('/travellers');
});

test('traveller writes stay disabled after access failure and recover only after a successful reload', async ({ page, provider }, testInfo) => {
  provider.overrides['GET /api/travellers']={status:401,body:{error:'Sign in to view saved travellers.'}};
  await page.goto('/travellers');
  await expect(page.getByRole('heading',{name:'Sign in to manage your travellers.'})).toBeVisible();
  await expect(page.getByLabel('First name',{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Save traveller',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Passport number',{exact:true})).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page,testInfo,'travellers-private-access');
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toHaveAttribute('href','/account?returnTo=%2Ftravellers');
  provider.overrides['GET /api/travellers']={body:{travellers:[]}};
  await page.reload();
  await expect(page.getByRole('button',{name:'Save traveller',exact:true})).toBeEnabled();
  expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

test('traveller edits require confirmation before discard and save failures preserve typed details', async ({ page, provider }) => {
  provider.overrides['GET /api/travellers']={body:{travellers:[{id:'fixture-traveller',name:'Alex Example',profile:{pt:'ADULT',ti:'Mr',fN:'Alex',lN:'Example'}}]}};
  provider.overrides['PUT /api/travellers']={status:422,body:{error:'Please review these traveller details; your input is preserved.'}};
  await page.goto('/travellers');
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  await page.getByLabel('First name',{exact:true}).fill('Edited Alex');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Cancel edit',exact:true}).click();
  await expect(page.getByLabel('First name',{exact:true})).toHaveValue('Edited Alex');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByText('Please review these traveller details; your input is preserved.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('First name',{exact:true})).toHaveValue('Edited Alex');
  expect(provider.requests('/api/travellers').filter(call=>call.method==='PUT')).toHaveLength(1);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Cancel edit',exact:true}).click();
  await expect(page.getByLabel('First name',{exact:true})).toHaveValue('');
  await expect(page.getByRole('heading',{name:'Add a traveller',exact:true})).toBeVisible();
});

test('removing the edited traveller clears stale editing state and announces the outcome', async ({ page, provider }) => {
  provider.overrides['GET /api/travellers']={body:{travellers:[{id:'fixture-traveller',name:'Alex Example',profile:{pt:'ADULT',ti:'Mr',fN:'Alex',lN:'Example'}}]}};
  provider.overrides['DELETE /api/travellers']={body:{ok:true}};
  await page.goto('/travellers');
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  provider.overrides['GET /api/travellers']={body:{travellers:[]}};
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Remove saved profile',exact:true}).click();
  await expect(page.getByText('Traveller removed. Existing bookings are unchanged.',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Add a traveller',exact:true})).toBeVisible();
  await expect(page.getByLabel('First name',{exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:'Save traveller',exact:true})).toBeEnabled();
  expect(provider.calls.filter(call=>call.method==='PUT')).toHaveLength(0);
});

test('signed-in devices offer readable names, retry and an honest empty result', async ({page,provider})=>{
 provider.overrides['GET /api/auth/list-sessions']={status:503,body:{message:'Devices temporarily unavailable'}};
 await page.goto('/account');
 const security=page.getByRole('region',{name:'Password and signed-in devices',exact:true});
 await security.getByRole('button',{name:'View signed-in devices'}).click();
 await expect(security.getByRole('button',{name:'Retry signed-in devices'})).toBeVisible();
 provider.overrides['GET /api/auth/list-sessions']={body:[]};
 await security.getByRole('button',{name:'Retry signed-in devices'}).click();
 await expect(security.getByText('No active sessions were returned. Refresh or sign in again to confirm your access.')).toBeVisible();
 expect(provider.calls.filter(call=>call.method==='POST')).toHaveLength(0);
});

test('current-device revocation requires confirmation and returns to sign-in', async ({page,provider},testInfo)=>{
 provider.overrides['GET /api/auth/list-sessions']={body:[{token:'synthetic-session-not-a-credential',userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/140 Safari/537',createdAt:'2026-10-21T12:00:00Z'}]};
 provider.overrides['POST /api/auth/revoke-session']={body:{status:true}};
 await page.goto('/account');
 const security=page.getByRole('region',{name:'Password and signed-in devices',exact:true});
 await security.getByRole('button',{name:'View signed-in devices'}).click();
 await expect(security.getByRole('heading',{name:'Chrome on Windows · This device'})).toBeVisible();
 await expectNoHorizontalOverflow(page);
 await capture(page,testInfo,'account-current-device-before-revocation');
 page.once('dialog',dialog=>dialog.dismiss());
 await security.getByRole('button',{name:'Sign out this device'}).click();
 expect(provider.requests('/api/auth/revoke-session')).toHaveLength(0);
 provider.session=null;
 page.once('dialog',dialog=>dialog.accept());
 await security.getByRole('button',{name:'Sign out this device'}).click();
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 expect(provider.requests('/api/auth/revoke-session')).toHaveLength(1);
 await expect(security).toHaveCount(0);
});

test('lost password-change response preserves inputs and prevents blind mutation retries',async({page})=>{
 await page.goto('/account');
 let attempts=0;
 await page.route('**/api/auth/change-password',route=>{attempts++;return route.abort('failed');});
 const security=page.getByRole('region',{name:'Password and signed-in devices',exact:true});
 await security.getByLabel('Current password',{exact:true}).fill('SyntheticCurrent123');
 await security.getByLabel('New password',{exact:true}).fill('SyntheticNewPassword123');
 await security.getByLabel('Confirm new password',{exact:true}).fill('SyntheticNewPassword123');
 await security.getByRole('button',{name:'Change password',exact:true}).click();
 await expect(security.getByRole('status')).toContainText('We could not confirm whether your password changed.');
 await expect(security.getByLabel('New password',{exact:true})).toHaveValue('SyntheticNewPassword123');
 await expect(security.getByRole('button',{name:'Change password',exact:true})).toBeDisabled();
 expect(attempts).toBe(1);
});

test('lost session-revocation response requires a fresh device read before another action',async({page,provider})=>{
 provider.overrides['GET /api/auth/list-sessions']={body:[{token:'synthetic-other-session',userAgent:'Chrome/140',createdAt:'2026-10-21T12:00:00Z'}]};
 await page.goto('/account');
 let attempts=0;
 await page.route('**/api/auth/revoke-session',route=>{attempts++;return route.abort('failed');});
 const security=page.getByRole('region',{name:'Password and signed-in devices',exact:true});
 await security.getByRole('button',{name:'View signed-in devices'}).click();
 page.once('dialog',dialog=>dialog.accept());
 await security.getByRole('button',{name:'Sign out this session'}).click();
 await expect(security.getByRole('status')).toContainText('We could not confirm whether the session was signed out.');
 await expect(security.getByRole('button',{name:'Sign out this session'})).toBeDisabled();
 expect(attempts).toBe(1);
 provider.overrides['GET /api/auth/list-sessions']={body:[]};
 await security.getByRole('button',{name:'Refresh signed-in devices'}).click();
 await expect(security.getByRole('button',{name:'Sign out this session'})).toHaveCount(0);
 await expect(security.getByText('No active sessions were returned. Refresh or sign in again to confirm your access.')).toBeVisible();
});

test('uncertain traveller create keeps input and requires list reconciliation before retry',async({page,provider},testInfo)=>{
 await page.goto('/travellers');
 await expect(page.getByRole('button',{name:'Save traveller',exact:true})).toBeEnabled();
 let attempts=0;
 await page.route('**/api/travellers',async route=>{if(route.request().method()==='POST'){attempts++;await route.abort('failed');}else await route.fallback();});
 await page.getByLabel('First name',{exact:true}).fill('Synthetic');
 await page.getByLabel('Last name',{exact:true}).fill('Person');
 await page.getByRole('button',{name:'Save traveller',exact:true}).click();
 await expect(page.getByText(/We could not confirm whether this traveller was saved/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Save traveller',exact:true})).toBeDisabled();
 await expectNoHorizontalOverflow(page);
 await capture(page,testInfo,'traveller-save-outcome-uncertain');
 await expect(page.getByLabel('First name',{exact:true})).toHaveValue('Synthetic');
 provider.overrides['GET /api/travellers']={body:{travellers:[{id:'synthetic-saved-after-loss',name:'Synthetic Person',profile:{pt:'ADULT',ti:'Mr',fN:'Synthetic',lN:'Person'}}]}};
 await page.getByRole('button',{name:'Reload saved profiles',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Synthetic Person',exact:true})).toBeVisible();
 await expect(page.getByLabel('First name',{exact:true})).toHaveValue('Synthetic');
 await expect(page.getByText(/Profiles reloaded. Check whether your previous change is already saved/)).toBeVisible();
 expect(attempts).toBe(1);
});
