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
 await expectNoHorizontalOverflow(page);await capture(page,info,'edit-pricing-percentage-fee');
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
 await form.getByRole('button',{name:'Continue to review',exact:true}).click();
 await page.route('**/api/travel/promo',route=>{const applied=Boolean(route.request().postDataJSON().code);return route.fulfill({json:{quoteId,totalMinor:applied?644000:654000,originalTotalMinor:654000,discountMinor:applied?10000:0,code:applied?'SAVE100':null}});});
 const promo=page.getByRole('region',{name:'Promo code',exact:true});await promo.getByLabel('Promo code',{exact:true}).fill('SAVE100');await promo.getByLabel('Promo code',{exact:true}).press('Enter');
 await expect(promo).toContainText('You save ₹100.00');await expect(form.getByRole('button',{name:/^Agree & pay /})).toContainText('6,440');
 await expectNoHorizontalOverflow(page);await capture(page,info,`${product.toLowerCase()}-promo-applied`);
 await promo.getByRole('button',{name:'Remove code',exact:true}).click();await expect(form.getByRole('button',{name:/^Agree & pay /})).toContainText('6,540');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
