import {capture,departure,expect,expectNoHorizontalOverflow,openFlightSearch,reviewedQuote,syntheticSession,test} from './fixtures';

const alertsPath='/api/travel/price-alerts';
const sendPath='/api/auth/email-otp/send-verification-otp';
const verifyPath='/api/auth/sign-in/email-otp';
const email='alert-traveller@example.test';
const watch={from:'BOM',to:'DEL',date:departure,cabin:'ECONOMY'};
const pendingAlert={...watch,id:'b0e9d956-bc07-4bf4-bf3a-568e3828ea33',status:'waiting',baselineMinor:null,notifiedMinor:null};

test('price alerts require email verification and separate opt-in for the exact flight search',async({page,provider},info)=>{
  provider.session=null;
  provider.overrides[`GET ${alertsPath}`]={body:{available:true,alerts:[]}};
  provider.overrides[`POST ${sendPath}`]={body:{success:true}};
  const account=syntheticSession();
  account.user.email=email;
  provider.overrides[`POST ${verifyPath}`]={body:{user:account.user,token:'synthetic-only'}};
  provider.overrides[`POST ${alertsPath}`]={body:{alert:pendingAlert}};

  await openFlightSearch(page);
  await expect(page.locator('.live-flight-card')).toHaveCount(1);
  expect(provider.requests(alertsPath)).toHaveLength(0);
  const launch=page.getByRole('button',{name:'Get price alerts',exact:true});
  await launch.click();
  const dialog=page.getByRole('dialog',{name:'Track the cheapest fare for your dates',exact:true});
  const preview=dialog.getByRole('complementary',{name:'Search being tracked'});
  await expect(preview).toContainText('Mumbai to New Delhi');
  await expect(preview).toContainText('₹6,540');
  const input=dialog.getByLabel('Email address',{exact:true});
  await expect(input).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page,info,'price-alert-verification');
  await input.fill(email);
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  expect(provider.requests(sendPath)[0].body).toEqual({email,type:'sign-in'});
  await dialog.getByLabel('Verification code',{exact:true}).fill('123456');
  provider.session=account;
  await dialog.getByRole('button',{name:'Verify & continue',exact:true}).click();
  await expect(dialog.getByText(email,{exact:true})).toBeVisible();
  expect(provider.requests(alertsPath).filter(call=>call.method==='POST')).toHaveLength(0);
  await dialog.getByRole('button',{name:'Set price alert',exact:true}).click();
  await expect(dialog.getByText('Waiting for first fare check',{exact:true})).toBeVisible();
  const watches=provider.requests(alertsPath).filter(call=>call.method==='POST');
  expect(watches.map(call=>call.body)).toEqual([watch]);
  provider.overrides[`GET ${alertsPath}`]={body:{available:true,alerts:[pendingAlert]}};
  await dialog.getByRole('button',{name:'Close price alert',exact:true}).click();
  await expect(launch).toBeFocused();
  await launch.click();
  await expect(dialog.getByText('Waiting for first fare check',{exact:true})).toBeVisible();
  await dialog.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('manage price alerts opens the account section and removes a saved alert after confirmation',async({page,provider})=>{
  const saved={...pendingAlert,status:'watching',baselineMinor:654000};
  provider.overrides[`GET ${alertsPath}`]={body:{available:true,alerts:[saved]}};
  provider.overrides[`DELETE ${alertsPath}/${saved.id}`]={body:{deleted:true}};
  await openFlightSearch(page);
  await page.getByRole('button',{name:'Get price alerts',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Track the cheapest fare for your dates',exact:true});
  await expect(dialog.getByText('Tracking fares below ₹6,540.',{exact:true})).toBeVisible();
  await dialog.getByRole('link',{name:'Manage price alerts',exact:true}).click();
  await expect(page).toHaveURL(/\/account#flight-price-alerts$/);
  const accountAlerts=page.locator('#flight-price-alerts');
  await expect(accountAlerts.getByText('Watching for a lower fare',{exact:false})).toBeVisible();
  provider.overrides[`GET ${alertsPath}`]={body:{available:false,alerts:[saved]}};
  const toggle = accountAlerts.locator('summary');
  await toggle.click();
  await toggle.click();
  await expect(accountAlerts.getByText('Fare monitoring is temporarily unavailable. You can still remove saved alerts.',{exact:true})).toBeVisible();
  await accountAlerts.getByRole('button',{name:/Stop price alert for BOM to DEL/}).click();
  await expect(accountAlerts.getByText('You have no saved price alerts.',{exact:true})).toBeVisible();
  await expect(toggle).toBeFocused();
  await expectNoHorizontalOverflow(page);
  expect(provider.requests(`${alertsPath}/${saved.id}`).map(call=>call.method)).toEqual(['DELETE']);
});

test('price alerts show service unavailability without collecting email',async({page,provider})=>{
  provider.session=null;
  provider.overrides[`GET ${alertsPath}`]={body:{available:false,alerts:[]}};
  await openFlightSearch(page);
  await page.getByRole('button',{name:'Get price alerts',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Track the cheapest fare for your dates',exact:true});
  await expect(dialog.getByText('Price alerts are currently unavailable.',{exact:true})).toBeVisible();
  await expect(dialog.getByLabel('Email address',{exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('link',{name:'Manage saved alerts',exact:true})).toHaveAttribute('href','/account?returnTo=%2Faccount%23flight-price-alerts#flight-price-alerts');
  expect(provider.requests(alertsPath).map(call=>call.method)).toEqual(['GET']);
});

test('flight review opens the matching price watch independently of checkout',async({page,provider},info)=>{
  const mobile=info.project.name.includes('mobile');
  if(mobile)await page.setViewportSize({width:320,height:700});
  provider.quote=reviewedQuote({totalMinor:701000});
  provider.overrides[`GET ${alertsPath}`]={body:{available:true,alerts:[]}};
  await openFlightSearch(page);
  await page.locator('.fare-comparison-trigger').first().click();
  await page.getByRole('button',{name:'Check fare & continue',exact:true}).click();

  const review=page.getByRole('form',{name:'Review and travellers'});
  const launch=review.getByRole('button',{name:'Set a price alert',exact:true});
  await expect(launch).toBeVisible();
  if(mobile)await expect(launch).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  expect(provider.requests(alertsPath)).toHaveLength(0);
  await launch.click();
  const dialog=page.getByRole('dialog',{name:'Track the cheapest fare for your dates'});
  const preview=dialog.getByRole('complementary',{name:'Search being tracked'});
  await expect(preview).toContainText('Mumbai to New Delhi');
  await expect(preview).toContainText('Current search estimate ₹6,540');
  await expect(review.locator('.booking-total')).toContainText('₹7,010');
  await dialog.getByRole('button',{name:'Close price alert',exact:true}).click();
  await expect(launch).toBeFocused();

  const emailField=review.getByRole('textbox',{name:'Email',exact:true});
  if(mobile)await emailField.fill(email);
  await review.getByRole('button',{name:'Continue to travellers',exact:true}).click();
  await expect(review.locator('#booking-traveller-details')).toBeVisible();
  await expect(launch).toHaveCount(0);
  expect(provider.requests(alertsPath).map(call=>call.method)).toEqual(['GET']);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('flight review price alert stays closed after browser Back and Forward',async({page,provider})=>{
  provider.overrides[`GET ${alertsPath}`]={body:{available:true,alerts:[]}};
  await openFlightSearch(page);
  await page.locator('.fare-comparison-trigger').first().click();
  await page.getByRole('button',{name:'Check fare & continue',exact:true}).click();
  const review=page.getByRole('form',{name:'Review and travellers'});
  await review.getByRole('button',{name:'Set a price alert',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Track the cheapest fare for your dates'});
  await expect(dialog.getByRole('button',{name:'Set price alert',exact:true})).toBeVisible();
  await page.goBack();
  await expect(review).toHaveCount(0);
  await page.goForward();
  await expect(review).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(provider.requests(alertsPath).map(call=>call.method)).toEqual(['GET']);
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
