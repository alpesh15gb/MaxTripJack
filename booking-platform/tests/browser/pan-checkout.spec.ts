import {test,expect,capture,departure,returning,reviewedQuote,searchId,expectNoHorizontalOverflow} from './fixtures';

for(const panRequired of [false,true,'false'] as const)test(`hotel PAN ${JSON.stringify(panRequired)} respects the primary guest and keeps other documents optional`,async({page,provider},testInfo)=>{
 const option={optionId:'pan-room',roomInfo:[{name:'Deluxe room'}],mealBasis:'ROOM_ONLY',inclusions:['Wi-Fi'],pricing:{totalPrice:8000,currency:'INR'},compliance:{panRequired},cancellation:{policy:'Cancellation charges apply.'}};
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Synthetic document stay',customerEstimateMinor:800000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[option]}};
 provider.quote=reviewedQuote({product:'HOTEL',hotelName:'Synthetic document stay',totalMinor:800000,summary:{checkIn:departure,checkOut:returning,adults:2,rooms:[{adults:2,children:0,childAge:[]}]},review:{option}});
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'2',autoSearch:'1'}));
 await page.getByRole('button',{name:'Choose room',exact:true}).click();
 await page.getByRole('button',{name:'Continue with room',exact:true}).click();
 const form=page.locator('#booking-review');
 for(let index=0;index<2;index++){
  await form.locator(`[name="first-${index}"]`).fill(index===0?'Primary':'Second');
  await form.locator(`[name="last-${index}"]`).fill('Guest');
 }
 await form.getByLabel('Email',{exact:true}).fill('checkout@example.test');
 await form.getByLabel('Mobile number',{exact:true}).fill('9876543210');
 await expect(form.locator('[name="pan-1"]')).not.toHaveAttribute('required');
 await expect(form.locator('[name="pan-1"]')).not.toBeVisible();
 if(panRequired===true){
  await expect(form.locator('[name="pan-0"]')).toBeVisible();
  await expect(form.locator('[name="pan-0"]')).toHaveAttribute('required');
  await expect(form.locator('#pan-hint-0')).toHaveText('This room rate requires PAN for the primary guest only.');
  await page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /}).click();
  await expect(form.locator('[name="pan-0"]')).toBeFocused();
  await expect(form.locator('[name="pan-0"]')).toHaveAttribute('aria-describedby','pan-hint-0 guest-error-pan-0');
  const panIsUncovered=()=>form.locator('[name="pan-0"]').evaluate(node=>{
   const field=node.getBoundingClientRect();
   const action=document.querySelector('.mobile-booking-action')?.getBoundingClientRect();
   const actionCoversColumn=action && action.height>0 && action.left < field.right && action.right > field.left;
   const bottom=actionCoversColumn && action.bottom>=innerHeight-2 ? action.top : innerHeight;
   return field.top>=0 && field.bottom<=bottom && document.elementFromPoint(field.left+field.width/2,field.top+field.height/2)===node;
  });
  await expect.poll(panIsUncovered).toBe(true);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await form.locator('[name="pan-0"]').fill('ABCDE1234F');
  await expect(form.locator('[name="pan-0"]')).not.toHaveAttribute('aria-invalid');
  await expect(form.locator('#guest-error-pan-0')).toHaveCount(0);
  await expect(form.locator('[name="pan-0"]')).toHaveAttribute('aria-describedby','pan-hint-0');
  await expect.poll(panIsUncovered).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`hotel-pan-corrected-focus-${testInfo.project.name}.png`),animations:'disabled'});
 }else{
  await expect(form.locator('[name="pan-0"]')).not.toHaveAttribute('required');
  await expect(form.locator('[name="pan-0"]')).not.toBeVisible();
 }
 await expectNoHorizontalOverflow(page);
 await capture(page,testInfo,`hotel-pan-${String(panRequired)}-guests`);
 await expect(page.locator('#booking-summary').getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 await expect(form.getByLabel('First name',{exact:true}).first()).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.locator('#booking-summary').getByRole('button',{name:/^Agree & pay /}).click();
 await expect.poll(()=>provider.requests('/api/payments/create').length).toBe(1);
 const payload=provider.requests('/api/payments/create')[0].body as {guests:{travellers:{pan?:string}[]}};
 expect(payload.guests.travellers[0].pan).toBe(panRequired===true?'ABCDE1234F':undefined);
 expect(payload.guests.travellers[1].pan).toBeUndefined();
});
