import {test,expect,syntheticSession,capture,expectNoHorizontalOverflow} from './fixtures';
// Never retain enrollment material, even synthetic values, in failure screenshots,
// videos or traces. Final-state captures below happen only after secrets disappear.
test.use({screenshot:'off',video:'off',trace:'off'});
// The URI keeps the real schema with the PUBLIC RFC 4226 test secret.
// No production or generated secret is used; automatic contexts may show this fixture.
const uri='otpauth://totp/MaxTravel:fixture%40example.test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=MaxTravel&algorithm=SHA1&digits=6&period=30';
const setupPassword='SyntheticPasswordOnly123';

test('MFA enrollment verifies protection then backup-code sign-in preserves the requested destination',async({page,provider},info)=>{
 const session=syntheticSession();provider.session={...session,user:{...session.user,twoFactorEnabled:false}};
 provider.overrides['POST /api/auth/two-factor/enable']={body:{totpURI:uri,backupCodes:['00000-00000']}};
 await page.route('**/api/auth/two-factor/verify-totp',async route=>{provider.session={...session,user:{...session.user,twoFactorEnabled:true}};await route.fulfill({json:{user:{...session.user,twoFactorEnabled:true},token:'synthetic-session-not-a-credential'}});});
 await page.goto('/account');
 await page.locator('.account-card').getByLabel('Current password',{exact:true}).first().fill(setupPassword);
 await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Authenticator setup URI',exact:true})).toHaveValue(uri);
 await expect(page.getByRole('textbox',{name:'Backup codes',exact:true})).toHaveValue('00000-00000');
 await page.getByLabel('Authenticator code',{exact:true}).fill('123456');
 await page.getByRole('button',{name:'Verify and enable',exact:true}).click();
 await expect(page.getByText('Authenticator protection enabled.')).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Authenticator setup URI',exact:true})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Backup codes',exact:true})).toHaveCount(0);
 await page.route('**/api/auth/sign-out',async route=>{provider.session=null;await route.fulfill({json:{success:true}});});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 await page.goto('/account?returnTo=%2Ftravellers');
 provider.overrides['POST /api/auth/sign-in/email']={body:{twoFactorRedirect:true}};
 await page.getByLabel('Email',{exact:true}).fill('signed-in@example.test');await page.getByLabel('Password',{exact:true}).fill(setupPassword);
 await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
 await page.getByLabel('Use a saved recovery code').check();await page.getByLabel('One-time backup code').fill('00000-00000');
 let consumed=false;
 await page.route('**/api/auth/two-factor/verify-backup-code',async route=>{if(consumed){await route.fulfill({status:400,json:{message:'Backup code is invalid or has already been used.'}});return;}consumed=true;provider.session={...session,user:{...session.user,twoFactorEnabled:true}};await route.fulfill({json:{user:session.user,token:'synthetic-session-not-a-credential'}});});
 await page.getByRole('button',{name:'Verify code',exact:true}).click();await expect(page).toHaveURL('/travellers');
 await expectNoHorizontalOverflow(page);await capture(page,info,'mfa-complete-safe-destination');
 // A consumed-code rejection is a fixture contract, not proof of real server consumption.
 provider.session=null;await page.goto('/account?returnTo=%2Ftravellers');
 await page.getByLabel('Email',{exact:true}).fill('signed-in@example.test');await page.getByLabel('Password',{exact:true}).fill(setupPassword);await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
 await page.getByLabel('Use a saved recovery code').check();await page.getByLabel('One-time backup code').fill('00000-00000');await page.getByRole('button',{name:'Verify code',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Backup code is invalid or has already been used.');await expect(page).toHaveURL(/\/account\?/);
});

test('lost MFA enable locks duplicate writes across reload and offers owned-status recovery',async({page,provider})=>{
 provider.overrides['POST /api/auth/two-factor/enable']={status:503,body:{message:'Unknown enrollment outcome'}};
 await page.goto('/account');await page.locator('.account-card').getByLabel('Current password',{exact:true}).first().fill(setupPassword);
 await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();
 const recovery=page.getByRole('region',{name:'Authenticator recovery'});await expect(recovery).toBeVisible();
 await expect(page.getByRole('button',{name:'Set up authenticator',exact:true})).toBeDisabled();
 await page.locator('form').filter({has:page.getByRole('button',{name:'Set up authenticator',exact:true})}).evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(provider.requests('/api/auth/two-factor/enable')).toHaveLength(1);
 await page.reload();await expect(recovery).toBeVisible();await expect(page.getByRole('button',{name:'Set up authenticator',exact:true})).toBeDisabled();
 await recovery.getByRole('button',{name:'Check authenticator status'}).click();await expect(recovery).toBeVisible();
 expect(provider.requests('/api/auth/two-factor/enable')).toHaveLength(1);
 const session=syntheticSession();provider.session={...session,user:{...session.user,twoFactorEnabled:true}};
 await recovery.getByRole('button',{name:'Check authenticator status'}).click();await expect(page.getByText('Authenticator protection enabled.')).toBeVisible();
 await expect(recovery).toHaveCount(0);
});

test('held MFA enrollment blocks same-turn duplicate submit and ignores a late result after navigation',async({page,provider})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let writes=0;
 await page.route('**/api/auth/two-factor/enable',async route=>{writes++;await held;try{await route.fulfill({json:{totpURI:uri,backupCodes:['00000-00000']}});}catch{/* Navigation may cancel this response. */}});
 await page.goto('/account');await page.locator('.account-card').getByLabel('Current password',{exact:true}).first().fill(setupPassword);
 const form=page.locator('form').filter({has:page.getByRole('button',{name:'Set up authenticator',exact:true})});
 await form.evaluate(node=>{node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 await expect.poll(()=>writes).toBe(1);
 await page.goto('/customer-support');release();await expect(page).toHaveURL('/customer-support');
 await expect(page.getByRole('textbox',{name:'Authenticator setup URI',exact:true})).toHaveCount(0);expect(writes).toBe(1);
 expect(provider.requests('/api/auth/two-factor/verify-totp')).toHaveLength(0);
});
