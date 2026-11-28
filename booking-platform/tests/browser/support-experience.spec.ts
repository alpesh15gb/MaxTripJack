import {test,expect,capture,expectNoHorizontalOverflow,bookingId,departure,returning,syntheticSession} from './fixtures';

test('support starts with four actionable customer tasks and verified contact channels',async({page,provider},testInfo)=>{
 await page.goto('/customer-support');
 const main=page.getByRole('main');
 await expect(main).toHaveCount(1);
 await expect(main.getByRole('heading',{level:1,name:'How can we help you?'})).toBeVisible();
 await expect(main.getByRole('article')).toHaveCount(4);
 for(const [name,href] of [['My bookings','/my-trips'],['Check booking status','/my-trips'],['Sign in or register','/account?returnTo=%2Fmy-trips'],['Raise a request','/customer-support/request']]){
   await expect(main.getByRole('link',{name,exact:true})).toHaveAttribute('href',href);
 }
 const contact=page.getByRole('complementary',{name:'Talk to MaxTravel'});
 await expect(contact.getByRole('link',{name:'Call +91 70950 18018',exact:true})).toHaveAttribute('href','tel:+917095018018');
 await expect(contact.getByRole('link',{name:'Email max@maxtravel.in',exact:true})).toHaveAttribute('href','mailto:max@maxtravel.in');
 await expect(contact).toContainText('Every day, 09:00 - 21:00 (India time)');
 await expect(contact).toContainText('Nothing is sent from this page.');
 await expect(page.locator('a[href*="wa.me"],a[href*="whatsapp.com"]')).toHaveCount(0);
 await expectNoHorizontalOverflow(page);
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
 await capture(page,testInfo,'support-task-first');
});

test('support questions work by keyboard and disclose actual test and emergency limitations',async({page,provider})=>{
 await page.goto('/customer-support');
 const question=page.locator('summary').filter({hasText:'Can I make a live booking through this website?'});
 await question.focus();
 await page.keyboard.press('Enter');
 const details=question.locator('..');
 await expect(details).toHaveAttribute('open');
 await expect(details).toContainText('Test results and online checkout do not create live travel bookings or payments.');
 await page.keyboard.press('Enter');
 await expect(details).not.toHaveAttribute('open');
 const urgent=page.locator('summary').filter({hasText:'My flight is coming up soon.'});
 await urgent.focus();
 await page.keyboard.press('Enter');
 await expect(urgent.locator('..')).toContainText('We do not provide 24-hour emergency support');
 await expectNoHorizontalOverflow(page);
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

test('support booking task explains guest lookup and preserves the account return',async({page,provider})=>{
 provider.session=null;
 provider.overrides['GET /api/bookings']={status:401,body:{error:'Sign in to view your bookings.'}};
 await page.goto('/customer-support');
 await page.getByRole('main').getByRole('link',{name:'My bookings',exact:true}).click();
 await expect(page).toHaveURL('/my-trips');
 await expect(page.getByRole('heading',{name:'Find your trip',exact:true})).toBeVisible();
 await expect(page.getByRole('main')).toContainText('a guest booking on the browser you used');
 await expect(page.getByRole('link',{name:'Sign in to view trips across devices',exact:true})).toHaveAttribute('href','/account?returnTo=%2Fmy-trips');
 await expect(page.getByLabel('Booking reference or airline PNR')).toBeVisible();
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

test('support lookup reuses the booking endpoint and only sends the reference', async ({page, provider}) => {
  provider.overrides['POST /api/bookings/lookup'] = {body: {matches: [{id: bookingId, reference: 'MT-1234ABCD'}], incomplete: false}};
  await page.goto('/customer-support');
  await page.getByLabel('Booking reference or airline PNR').fill('MT-1234ABCD');
  await page.getByRole('button', {name: 'Find my trip'}).click();
  await expect(page.getByRole('link', {name: 'Open booking MT-1234ABCD'})).toHaveAttribute('href', `/my-trips/${bookingId}`);
  expect(provider.requests('/api/bookings/lookup').map(call => call.body)).toEqual([{reference: 'MT-1234ABCD'}]);
});

test('support question search opens matching answers and topic filters', async ({page}) => {
  await page.goto('/customer-support');
  const search = page.getByRole('searchbox', {name:'Search frequently asked questions'});
  await search.fill('refund');
  const matching = page.getByRole('list', {name: 'Matching questions'});
  await matching.getByRole('link', {name:'How can I check a refund or follow up?'}).click();
  await expect(page).toHaveURL(/\/customer-support\/faq\?answer=refund-status#refund-status$/);
  await expect(page.locator('#refund-status')).toHaveAttribute('open');
  await expect(page.locator('#refund-status').getByRole('link',{name:'Link to this answer'})).toHaveAttribute('href','/customer-support/faq?answer=refund-status#refund-status');
  const mobileTopics=page.locator('.help-faq-topics-mobile summary');
  if(await mobileTopics.isVisible())await mobileTopics.click();
  await page.getByRole('navigation', {name:'FAQ topics'}).getByRole('link', {name:'Baggage', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Baggage', exact:true})).toBeVisible();
  await expect(page.getByText('What is my baggage allowance?', {exact:true})).toBeVisible();
  await expect(page.getByText('How can I check a refund or follow up?', {exact:true})).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('guest trip lookup holds the entry open until a verified account can look up its booking', async ({page, provider}) => {
  const email = 'traveller@example.test';
  const verifiedSession = syntheticSession();
  const send = '/api/auth/email-otp/send-verification-otp';
  const verify = '/api/auth/sign-in/email-otp';
  provider.session = null;
  provider.overrides[`POST ${send}`] = {body: {success: true}};
  provider.overrides[`POST ${verify}`] = {body: {token: 'synthetic-only', user: {...verifiedSession.user, email}}};
  provider.overrides['POST /api/bookings/lookup'] = {body: {matches: [{id: bookingId, reference: 'MT-1234ABCD'}], incomplete: false}};

  await page.goto('/my-trips');
  await page.getByLabel('Booking reference or airline PNR').fill('MT-1234ABCD');
  await page.getByRole('textbox', {name:/^Booking email \(optional\)/}).fill(email);
  await page.getByRole('button', {name:'Find my trip', exact:true}).click();
  const verifier = page.getByRole('dialog', {name:'Verify your booking email'});
  await expect(verifier.getByRole('textbox', {name:'Email address'})).toHaveValue(email);
  expect(provider.requests('/api/bookings/lookup')).toHaveLength(0);
  expect(provider.requests(send)).toHaveLength(0);
  await verifier.getByRole('button', {name:'Send verification code'}).click();
  await verifier.getByLabel('Verification code').fill('123456');
  await verifier.getByRole('button', {name:'Verify & continue'}).click();
  await expect(verifier.getByRole('alert')).toContainText('has not been verified');
  expect(provider.requests('/api/bookings/lookup')).toHaveLength(0);

  provider.session = {...verifiedSession, user: {...verifiedSession.user, email}};
  await verifier.getByLabel('Verification code').fill('123456');
  await verifier.getByRole('button', {name:'Verify & continue'}).click();
  await expect(page.getByRole('link', {name:'Open booking MT-1234ABCD'})).toHaveAttribute('href', `/my-trips/${bookingId}`);
  await expect(page.getByRole('button', {name:'View all my trips'})).toBeVisible();
  expect(provider.requests('/api/bookings/lookup').map(request => request.body)).toEqual([{reference:'MT-1234ABCD'}]);
});

test('support and assisted trip requests prepare email drafts without sending', async ({page, provider}) => {
  await page.goto('/customer-support/request');
  await page.getByLabel('Full name').fill('Test Traveller');
  await page.getByLabel('Email address').fill('traveller@example.test');
  await page.getByRole('combobox', {name:'Subject', exact:true}).selectOption('Payment or confirmation');
  await page.getByRole('textbox', {name:'Message', exact:true}).fill('Please check our test booking.');
  await page.getByRole('button', {name:'Prepare support email'}).click();
  const draft = page.getByRole('link', {name:'Open email draft'});
  await expect(draft).toHaveAttribute('href', /^mailto:max@maxtravel\.in\?subject=/);
  const href = decodeURIComponent((await draft.getAttribute('href'))!);
  expect(href).toContain('MaxTravel support: Payment or confirmation');
  expect(href).toContain('Please check our test booking.');
  await expect(page.getByLabel('Full name')).toHaveValue('Test Traveller');
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Please check our test booking.');
  await page.getByText('Review or copy email text',{exact:true}).click();
  await expect(page.getByLabel('Draft message')).toHaveValue(/Please check our test booking\./);
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Please check the revised booking request.');
  await expect(draft).toHaveCount(0);
  await page.getByRole('button',{name:'Prepare support email'}).click();
  expect(decodeURIComponent((await draft.getAttribute('href'))!)).toContain('Please check the revised booking request.');
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
  await page.goto(`/contact?topic=activity&destination=Goa&start=${departure}&end=${returning}&travellers=3`);
  await expect(page.getByRole('textbox', {name:'Message', exact:true})).toHaveValue(`Destination: Goa\nTravel dates: ${departure} to ${returning}\nTravellers: 3`);
  await expectNoHorizontalOverflow(page);
});

test('package planning passes travel dates and group size to the office enquiry', async ({page, provider}) => {
  await page.goto('/packages');
  const plan = page.getByRole('form', {name:'Plan a holiday', exact:true});
  await plan.getByRole('textbox', {name:'Destination', exact:true}).fill('Goa');
  await plan.getByLabel('From', {exact:true}).fill(departure);
  await plan.getByLabel('To', {exact:true}).fill(returning);
  await plan.getByRole('spinbutton', {name:'Travellers', exact:true}).fill('3');
  await expectNoHorizontalOverflow(page);
  await plan.getByRole('button', {name:'Enquire', exact:true}).click();
  await expect(page.getByRole('textbox', {name:'Message', exact:true})).toHaveValue(`Destination: Goa\nTravel dates: ${departure} to ${returning}\nTravellers: 3`);
  await expect(page).toHaveURL(/\/contact\?.*#office-enquiry$/);
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});

test('insurance starts with an owned booking or an office enquiry', async ({page, provider}) => {
  await page.goto('/travel-insurance-guide');
  await expect(page.getByRole('heading', {name:'Did you book your trip with us?', exact:true})).toBeVisible();
  await expect(page.getByRole('link', {name:/Yes, I have a booking/})).toHaveAttribute('href','/my-trips');
  await expect(page.getByRole('heading', {name:'What to check in your policy', exact:true})).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('link', {name:/No, I booked elsewhere/}).click();
  await expect(page.getByRole('region', {name:'Travel insurance enquiry'})).toBeVisible();
  expect(provider.calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});
