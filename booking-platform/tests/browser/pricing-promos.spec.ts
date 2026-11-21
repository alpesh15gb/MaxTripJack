import {test,expect,expectNoHorizontalOverflow,capture,openFlightSearch,quoteId,searchId,reviewedQuote,departure,returning} from './fixtures';
const id='11111111-1111-4111-8111-111111111111';
test('admin edits pricing with percentage service fee and can deactivate the rule',async({page,provider},info)=>{
 provider.overrides['GET /api/admin/pricing']={body:{rows:[{id,product:'HOTEL',company_id:null,markup_minor:'5000',markup_basis_points:1000,margin_basis_points:0,service_fee_minor:'2500',service_fee_basis_points:200,active:true}],total:1,page:1,hasMore:false}};
 provider.overrides['POST /api/admin/pricing']={body:{id:'22222222-2222-4222-8222-222222222222'}};
 provider.overrides['POST /api/admin/pricing/deactivate']={body:{id,message:'Rule deactivated.'}};
 await page.goto('/operations?desk=pricing');
 await page.getByRole('region',{name:'pricing records',exact:true}).getByRole('button',{name:'Open record →',exact:true}).click();
 await page.getByRole('button',{name:'Edit pricing rule →',exact:true}).click();
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Edit pricing rule',exact:true})});
 await expect(dialog.getByLabel('Fixed markup (₹)',{exact:true})).toHaveValue('50');
 await expect(dialog.getByLabel('Service fee (% of supplier price)',{exact:true})).toHaveValue('2');
 await dialog.getByLabel('Service fee (% of supplier price)',{exact:true}).fill('3');
 await expect(dialog).toContainText('11375.00');
 await page.setViewportSize({width:320,height:844});
 await expectNoHorizontalOverflow(page);expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await capture(page,info,'edit-pricing-percentage-fee');
 await dialog.getByRole('button',{name:'Save pricing changes',exact:true}).click();
 expect(provider.requests('/api/admin/pricing').find(call=>call.method==='POST')?.body).toMatchObject({replacesId:id,serviceFeeBasisPoints:300,product:'HOTEL',companyId:null});
 await dialog.getByRole('button',{name:'Close action',exact:true}).click();
 await page.getByRole('region',{name:'pricing records',exact:true}).getByRole('button',{name:'Open record →',exact:true}).click();
 await page.getByRole('button',{name:'Remove pricing rule →',exact:true}).click();
 await page.getByRole('button',{name:'Deactivate rule',exact:true}).click();
 expect(provider.requests('/api/admin/pricing/deactivate')[0].body).toEqual({id});
});
test('admin configures a capped percentage promo with service eligibility',async({page,provider},info)=>{
 provider.overrides['GET /api/admin/promo-codes']={body:{rows:[]}};
 provider.overrides['POST /api/admin/promo-codes']={body:{id,version:1}};
 await page.goto('/operations/promos');await page.getByRole('button',{name:'Create promo code',exact:true}).click();
 await page.getByLabel('Code',{exact:true}).fill('STAY10');
 await page.getByLabel('Service',{exact:true}).selectOption('HOTEL');
 await page.getByLabel('Discount type',{exact:true}).selectOption('PERCENT');
 await page.getByLabel('Discount value',{exact:true}).fill('10');
 await page.getByLabel('Minimum booking value (INR)',{exact:true}).fill('5000');
 await page.getByLabel('Maximum discount (INR, optional)',{exact:true}).fill('1000');
 await page.getByLabel('Expiry (your local time)',{exact:true}).fill('2027-12-31T23:59');
 await expectNoHorizontalOverflow(page);await capture(page,info,'promo-code-configuration');
 await page.getByRole('button',{name:'Save promo code',exact:true}).click();
 expect(provider.requests('/api/admin/promo-codes').find(call=>call.method==='POST')?.body).toMatchObject({code:'STAY10',product:'HOTEL',discountBasisPoints:1000,discountMinor:0,minimumMinor:500000,maximumDiscountMinor:100000,active:true});
 await expect(page.getByRole('status')).toContainText('Promo code saved.');
});

for(const product of ['FLIGHT','HOTEL'] as const)test(`${product} checkout applies and removes a promo in the displayed total`,async({page,provider},info)=>{
 if(product==='FLIGHT'){
  await openFlightSearch(page);await page.locator('.fare-comparison > summary').first().click();
  await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 }else{
  const option={optionId:'promo-room',roomInfo:[{name:'Standard room'}],pricing:{totalPrice:6540,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}};
  provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Promo test hotel',customerEstimateMinor:654000}]}};
  provider.overrides['POST /api/travel/hotel-detail']={body:{options:[option]}};
  provider.quote=reviewedQuote({product:'HOTEL',summary:{checkIn:departure,checkOut:returning,adults:1,rooms:[{adults:1,children:0,childAge:[]}]},review:{option}});
  await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'1',autoSearch:'1'}));
  await page.getByRole('button',{name:'Choose room',exact:true}).first().click();
  await page.getByRole('button',{name:'Continue with room',exact:true}).first().click();
 }
 const form=page.getByRole('form',{name:'Review and travellers'});
 await form.getByLabel('First name',{exact:true}).fill('Aarav');await form.getByLabel('Last name',{exact:true}).fill('Example');
 await form.getByLabel('Email',{exact:true}).fill('traveller@example.test');await form.getByLabel('Indian mobile number',{exact:true}).fill('9876543210');
 await page.route('**/api/travel/promo',route=>{const applied=Boolean(route.request().postDataJSON().code);return route.fulfill({json:{quoteId,totalMinor:applied?644000:654000,originalTotalMinor:654000,discountMinor:applied?10000:0,code:applied?'SAVE100':null}});});
 const promo=page.getByRole('region',{name:'Promo code',exact:true});await promo.getByLabel('Promo code',{exact:true}).fill('SAVE100');await promo.getByLabel('Promo code',{exact:true}).press('Enter');
 await expect(promo).toContainText('You save ₹100');await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toContainText('6,440');
 await expectNoHorizontalOverflow(page);await capture(page,info,`${product.toLowerCase()}-promo-applied`);
 await promo.getByRole('button',{name:'Remove code',exact:true}).click();await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toContainText('6,540');
 await page.unroute('**/api/travel/promo');
 await page.route('**/api/travel/promo',route=>route.fulfill({status:404,json:{error:'Promo code is unavailable.'}}));
 await promo.getByLabel('Promo code',{exact:true}).fill('INVALID');await promo.getByRole('button',{name:'Apply code',exact:true}).click();
 await expect(promo).toContainText('Try another code or continue without this discount.');
 await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toBeEnabled();
 await page.unroute('**/api/travel/promo');
 await page.route('**/api/travel/promo',route=>route.fulfill({status:503,json:{error:'Service unavailable.'}}));
 await promo.getByRole('button',{name:'Apply code',exact:true}).click();
 await expect(promo).toContainText('Payment is paused');
 await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toBeDisabled();
 await capture(page,info,`${product.toLowerCase()}-promo-recovery`);
 // A promo outage pauses payment while traveller fields remain editable.
 await page.locator('#booking-summary').getByRole('button',{name:product==='HOTEL'?'Edit guest details':'Edit traveller details',exact:true}).click();
 await expect(form.getByLabel('First name',{exact:true})).toBeFocused();
 await form.getByLabel('First name',{exact:true}).fill('Aarav Updated');
 await expect(page.locator('#booking-summary').getByRole('status',{name:'Promo total confirmation',exact:true})).toContainText('Payment is paused');
 if(product==='FLIGHT'){
  provider.overrides['GET /api/travel/checkout-extras']={body:{segments:[{id:'extra-segment',tripIndex:0,label:'BOM to DEL',options:[{kind:'MEAL',code:'MEAL1',label:'Vegetarian meal',amountMinor:10000}]}],travellerTypes:['ADULT'],choices:[]}};
  provider.overrides['POST /api/travel/checkout-extras']={body:{totalMinor:664000}};
  await form.locator('.checkout-optional-extras > summary').click();await form.getByRole('button',{name:'Choose flight extras',exact:true}).click();
  await form.getByRole('combobox',{name:'Meal',exact:true}).selectOption('MEAL1');
  await form.getByRole('button',{name:'Apply extras and update total',exact:true}).click();
  await expect(form.getByRole('button',{name:'Extras applied',exact:true})).toBeVisible();
 }
 await expect(promo).toBeVisible();await expect(page.locator('#booking-summary').getByRole('status',{name:'Promo total confirmation',exact:true})).toContainText('Payment is paused');
 await promo.getByLabel('Promo code',{exact:true}).focus();await expect(promo.getByLabel('Promo code',{exact:true})).toBeFocused();
 await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toBeDisabled();
 // Even a direct form submission must not create a payment against an uncertain total.
 await form.evaluate(node=>(node as HTMLFormElement).requestSubmit());
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await expect(page.locator('#booking-summary .final-traveller-summary')).toContainText('Aarav Updated');
 await expect(form.getByLabel('First name',{exact:true})).toHaveValue('Aarav Updated');
 await page.unroute('**/api/travel/promo');
 await page.route('**/api/travel/promo',route=>route.fulfill({json:{quoteId,totalMinor:product==='FLIGHT'?664000:654000,originalTotalMinor:product==='FLIGHT'?664000:654000,discountMinor:0,code:null}}));
 await promo.getByRole('button',{name:'Remove code',exact:true}).click();
 await expect(page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /})).toBeEnabled();
 await expect(page.locator('#booking-summary').getByRole('status',{name:'Promo total confirmation',exact:true})).toHaveCount(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});


test('flight reload restores public selection without persisting traveller details',async({page,provider},info)=>{
 await openFlightSearch(page);await page.locator('.fare-comparison > summary').first().click();
 await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 const form=page.getByRole('form',{name:'Review and travellers'});
 await form.getByLabel('First name',{exact:true}).fill('Privatefirstname');
 await page.reload();
 const recovery=page.getByRole('region',{name:'Saved selection',exact:true});
 await expect(recovery).toBeVisible();await expect(recovery).toContainText('For privacy');
 expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('Privatefirstname');
 await expectNoHorizontalOverflow(page);await capture(page,info,'flight-reload-recovery');
 await recovery.getByRole('button',{name:'Check current price and conditions',exact:true}).click();
 await expect(form.getByLabel('First name',{exact:true})).toHaveValue('');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('hotel rejected room review offers room refresh and return to stays',async({page,provider},info)=>{
 const option={optionId:'rejected-room',roomInfo:[{name:'Standard room'}],pricing:{totalPrice:6540,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}};
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Recovery test hotel',customerEstimateMinor:654000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[option]}};
 provider.overrides['POST /api/travel/review']={status:502,body:{error:'The supplier could not validate this room rate.'}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'1',autoSearch:'1'}));
 await page.getByRole('button',{name:'Choose room',exact:true}).first().click();
 await page.getByRole('button',{name:'Continue with room',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'Refresh room options',exact:true})).toBeVisible();
 await expectNoHorizontalOverflow(page);await capture(page,info,'hotel-review-recovery');
 await page.getByRole('button',{name:'Refresh room options',exact:true}).click();
 await expect(page.getByRole('button',{name:'Continue with room',exact:true}).first()).toBeEnabled();
 await page.getByRole('button',{name:'Continue with room',exact:true}).first().click();
 await page.getByRole('button',{name:'Browse other stays',exact:true}).click();
 await expect(page.getByRole('button',{name:'Choose room',exact:true}).first()).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});


test('duplicate supplier destinations present one city choice',async({page,provider},info)=>{
 provider.overrides['GET /api/travel/destinations']={body:{destinations:[{region_id:'1001',label:'Hyderabad, India'},{region_id:'1002',label:'Hyderabad, India'}]}};
 await page.goto('/book?product=HOTEL');
 await page.getByLabel('Destination',{exact:true}).fill('Hyderabad');
 const choices=page.getByRole('listbox',{name:'Destination suggestions',exact:true});
 await expect(choices.getByRole('option')).toHaveCount(1);
 await expect(choices).not.toContainText(/Hotel collection|Hotel group/);
 await expectNoHorizontalOverflow(page);await capture(page,info,'one-city-destination');
 await choices.getByRole('option',{name:'Hyderabad, India',exact:true}).click();
 expect(provider.requests('/api/travel/destination-hotels')[0].body).toMatchObject({regionId:'1001'});
});
