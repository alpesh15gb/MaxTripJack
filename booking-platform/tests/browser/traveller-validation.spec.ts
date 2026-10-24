import type { Page } from '@playwright/test';
import { test, expect, departure, returning, openFlightSearch, reviewedQuote, searchId, hotelOption, expectNoHorizontalOverflow, capture } from './fixtures';

function birthForAge(age:number){const date=new Date(`${departure}T00:00:00Z`);date.setUTCFullYear(date.getUTCFullYear()-age);return date.toISOString().slice(0,10);}
function after(date:string,days:number){return new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);}
async function selectFare(page:Page){await page.locator('.flight-shopping-list .fare-comparison').first().locator(':scope > summary').click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();}
async function openPartyFlightSearch(page:Page,children:number,infants:number){await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',children:String(children),infants:String(infants),autoSearch:'1'}));}
async function fillParty(page:Page,count:number){const form=page.getByRole('form',{name:'Review and travellers'});for(let i=0;i<count;i++){await form.locator(`[name="first-${i}"]`).fill(`Traveller ${i+1}`);await form.locator(`[name="last-${i}"]`).fill('Example');}await form.locator('[name="email"]').fill('traveller@example.test');await form.locator('[name="phone"]').fill('9876543210');}
async function review(page:Page){await page.getByRole('button',{name:'Review booking',exact:true}).click();}
async function noPrivateStorage(page:Page){expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('traveller@example.test');expect(await page.evaluate(()=>sessionStorage.getItem('maxtravel.pending-checkout.v1'))).toBeNull();}

test('child and infant age errors focus each field, retain corrections and never start payment on review',async({page,provider},testInfo)=>{
 provider.quote=reviewedQuote({summary:{from:'BOM',to:'DEL',date:departure,adults:1,children:1,infants:1}});
 await openPartyFlightSearch(page,1,1);await selectFare(page);await fillParty(page,3);
 await page.locator('[name="dob-1"]').fill(birthForAge(13));await page.locator('[name="dob-2"]').fill(birthForAge(3));
 await review(page);
 const summary=page.locator('#traveller-errors');
 await expect(summary).toContainText('Child 2 · Date of birth: Children must be age 2–11');
 await expect(summary).toContainText('Infant 3 · Date of birth: Infants must be under 2');
 await expect(page.locator('[name="dob-1"]')).toBeFocused();
 await expect(page.locator('[name="dob-1"]')).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('[name="dob-1"]')).toHaveAccessibleDescription(/Children must be age 2–11/);
 await summary.getByRole('button',{name:/Infant 3 · Date of birth/}).click();await expect(page.locator('[name="dob-2"]')).toBeFocused();
 await review(page);expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.locator('[name="dob-1"]').fill(birthForAge(5));await page.locator('[name="dob-2"]').fill(birthForAge(1));
 await review(page);await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 await expect(summary).toHaveCount(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
 // noValidate must not remove the explicit reviewed-total consent gate.
 await page.getByRole('button',{name:/^Pay .* securely$/}).click();expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await expect(page.locator('[name="consent"]')).toBeFocused();
 // Revalidate the exact payload at payment too, even if a browser autofill or
 // extension changes an offscreen field after the first review.
 await page.locator('[name="consent"]').check();
 await page.locator('[name="dob-1"]').evaluate((element,value)=>{(element as HTMLInputElement).value=value;},birthForAge(13));
 await page.getByRole('button',{name:/^Pay .* securely$/}).click();
 await expect(page.locator('[name="dob-1"]')).toBeFocused();expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.locator('[name="dob-1"]').fill(birthForAge(5));await review(page);
 await expect(page.locator('[name="consent"]')).not.toBeChecked();
 await page.getByRole('button',{name:'Back to travellers',exact:true}).click();
 await expect(page.locator('[name="dob-1"]')).toHaveValue(birthForAge(5));await expect(page.locator('[name="first-0"]')).toHaveValue('Traveller 1');
 await noPrivateStorage(page);await expectNoHorizontalOverflow(page);await capture(page,testInfo,'traveller-correction-no-payment');
});

test('passport validation uses final travel in saved quote, not an edited unsubmitted search',async({page,provider})=>{
 provider.quote=reviewedQuote({summary:{from:'BOM',to:'DEL',date:departure,returnDate:returning,adults:1}});
 await openFlightSearch(page);
 await page.locator('#booking-search > summary').click();
 const search=page.getByRole('form',{name:'Search availability'});
 await search.locator('[name="date"]').fill(after(returning,90));
 await search.locator('[name="returnDate"]').fill(after(returning,100));
 await page.locator('#booking-search > summary').click();await selectFare(page);await fillParty(page,1);
 const documents=page.locator('.traveller-card details').filter({hasText:'Travel documents'});
 await documents.locator('summary').click();await page.locator('[name="expiry-0"]').fill(returning);await documents.locator('summary').click();
 await review(page);await expect(documents).toHaveAttribute('open','');await expect(page.locator('[name="expiry-0"]')).toBeFocused();
 await expect(page.locator('#guest-error-expiry-0')).toContainText(`final travel date (${returning})`);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await page.locator('[name="expiry-0"]').fill(after(returning,1));await review(page);
 await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('optional DOB and document sections open for field-level adult age and PAN errors',async({page,provider})=>{
 await openFlightSearch(page);await selectFare(page);await fillParty(page,1);
 const dobSection=page.locator('.traveller-card details').filter({hasText:'Add date of birth'});
 const documents=page.locator('.traveller-card details').filter({hasText:'Travel documents'});
 await dobSection.locator('summary').click();await page.locator('[name="dob-0"]').fill(birthForAge(10));await dobSection.locator('summary').click();
 await review(page);await expect(dobSection).toHaveAttribute('open','');await expect(page.locator('[name="dob-0"]')).toBeFocused();
 await page.locator('[name="dob-0"]').fill('1990-01-01');
 await documents.locator('summary').click();await page.locator('[name="pan-0"]').fill('123');await documents.locator('summary').click();
 const gst=page.locator('#booking-review details').filter({has:page.locator('[name="gstNumber"]')});
 await gst.locator('summary').click();await page.locator('[name="gstNumber"]').fill('short');await gst.locator('summary').click();
 await review(page);
 await expect(page.locator('[name="pan-0"]')).toBeFocused();await expect(documents).toHaveAttribute('open','');await expect(gst).toHaveAttribute('open','');
 await expect(page.locator('[name="gstNumber"]')).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('#traveller-errors')).toContainText('Registered business name');
 await page.locator('[name="pan-0"]').fill('abcde1234f');await page.locator('[name="gstNumber"]').fill('123456789012345');await page.locator('[name="gstName"]').fill('Synthetic Business');
 await review(page);await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);await noPrivateStorage(page);await expectNoHorizontalOverflow(page);
});

test('hotel child ages are checked in their own reviewed room and can be corrected without losing guests',async({page,provider})=>{
 const rooms=[{adults:1,children:1,childAge:[5]},{adults:1,children:1,childAge:[9]}];
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Synthetic traveller validation stay',customerEstimateMinor:1840000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[hotelOption]}};
 provider.quote=reviewedQuote({product:'HOTEL',hotelName:'Synthetic traveller validation stay',summary:{checkIn:departure,checkOut:returning,adults:1,childrenAges:[5],rooms},review:{option:hotelOption}});
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Delhi',hotelIds:'10001',date:departure,end:returning,adults:'1',rooms:JSON.stringify(rooms),autoSearch:'1'}));
 await page.getByRole('button',{name:'Choose room',exact:true}).click();await page.getByRole('button',{name:'Review stay',exact:true}).click();await fillParty(page,4);
 await page.locator('[name="dob-1"]').fill(birthForAge(5));await page.locator('[name="dob-3"]').fill(birthForAge(8));
 await review(page);await expect(page.locator('[name="dob-3"]')).toBeFocused();
 await expect(page.locator('#traveller-errors')).toContainText('Room 2 · Child 4 · Date of birth');await expect(page.locator('#guest-error-dob-3')).toContainText('room 2 (9)');
 await expect(page.locator('[name="dob-1"]')).not.toHaveAttribute('aria-invalid','true');
 await page.locator('[name="dob-3"]').fill(birthForAge(9));await review(page);await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);await expectNoHorizontalOverflow(page);
});

test('authoritative server field errors survive API decoding and return focus to optional fields',async({page,provider})=>{
 provider.overrides['POST /api/payments/create']={status:400,body:{error:'Invalid request fields.',fields:[{path:'guests.travellers.0.dob',message:'Supplier requires a corrected date of birth.'}]}};
 await openFlightSearch(page);await selectFare(page);await fillParty(page,1);await review(page);
 await page.locator('[name="consent"]').check();await page.getByRole('button',{name:/^Pay .* securely$/}).click();
 await expect(page.locator('[name="dob-0"]')).toBeFocused();await expect(page.locator('[name="dob-0"]')).toBeVisible();
 await expect(page.locator('[name="dob-0"]')).toHaveAccessibleDescription('Supplier requires a corrected date of birth.');
 await expect(page.locator('#traveller-errors')).toContainText('Adult 1 · Date of birth');
 await expect(page.locator('[name="first-0"]')).toHaveValue('Traveller 1');await noPrivateStorage(page);
 expect(provider.requests('/api/payments/create')).toHaveLength(1);expect(await page.evaluate('window.__syntheticGateway?.opens.length ?? 0')).toBe(0);
 await page.locator('[name="dob-0"]').fill('1990-01-01');await review(page);await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 await expect(page.locator('[name="consent"]')).not.toBeChecked();expect(provider.requests('/api/payments/create')).toHaveLength(1);
});

test('required supplier documents collect all missing fields before any payment attempt',async({page,provider})=>{
 provider.quote=reviewedQuote({review:{conditions:{pcs:{pm:true},dob:{adobr:true},ipa:true,gst:{igm:true},iecr:true}}});
 await openFlightSearch(page);await selectFare(page);await fillParty(page,1);await review(page);
 const summary=page.locator('#traveller-errors');
 for(const label of ['Passport number','Passport nationality','Passport expiry','Date of birth','PAN','GST number','Emergency contact name'])await expect(summary).toContainText(label);
 await expect(page.locator('[name="passport-0"]')).toBeFocused();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);await expectNoHorizontalOverflow(page);
});

for(const product of ['FLIGHT','HOTEL'] as const){
 test(`${product}: existing India-day DOB max blocks a future baby, accepts today, and is rechecked before payment`,async({page,provider})=>{
  if(product==='FLIGHT'){
   provider.quote=reviewedQuote({summary:{from:'BOM',to:'DEL',date:departure,adults:1,children:0,infants:1}});
   await openPartyFlightSearch(page,0,1);await selectFare(page);
  }else{
   const rooms=[{adults:1,children:1,childAge:[0]}];
   provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Synthetic infant stay',customerEstimateMinor:1840000}]}};
   provider.overrides['POST /api/travel/hotel-detail']={body:{options:[hotelOption]}};
   provider.quote=reviewedQuote({product:'HOTEL',summary:{checkIn:departure,checkOut:returning,adults:1,childrenAges:[0],rooms},review:{option:hotelOption}});
   await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Delhi',hotelIds:'10001',date:departure,end:returning,adults:'1',rooms:JSON.stringify(rooms),autoSearch:'1'}));
   await page.getByRole('button',{name:'Choose room',exact:true}).click();await page.getByRole('button',{name:'Review stay',exact:true}).click();
  }
  await fillParty(page,2);
  const dob=page.locator('[name="dob-1"]'),today=(await dob.getAttribute('max'))!;
  const future=after(today,1);await dob.fill(future);
  expect(await dob.evaluate(element=>(element as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await review(page);await expect(dob).toBeFocused();await expect(dob).toHaveAccessibleDescription(`Date of birth cannot be after today (${today}).`);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);await expectNoHorizontalOverflow(page);
  await dob.fill(today);expect(await dob.evaluate(element=>(element as HTMLInputElement).validity.valid)).toBe(true);
  await review(page);await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
  await page.locator('[name="consent"]').check();await dob.evaluate((element,value)=>{(element as HTMLInputElement).value=value;},future);
  await page.getByRole('button',{name:/^Pay .* securely$/}).click();await expect(dob).toBeFocused();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);await noPrivateStorage(page);
 });
}

test('optional emergency-only entries still obey native type and length constraints without a contact name',async({page,provider})=>{
 await openFlightSearch(page);await selectFare(page);await fillParty(page,1);
 const section=page.locator('#booking-review details').filter({has:page.locator('[name="emergencyEmail"]')});
 await section.locator('summary').click();await page.locator('[name="emergencyEmail"]').fill('not-an-email');await page.locator('[name="emergencyPhone"]').fill('123');
 await expect(page.locator('[name="emergencyName"]')).toBeEmpty();await section.locator('summary').click();
 await review(page);await expect(section).toHaveAttribute('open','');await expect(page.locator('[name="emergencyEmail"]')).toBeFocused();
 await expect(page.locator('[name="emergencyEmail"]')).toHaveAttribute('aria-invalid','true');await expect(page.locator('[name="emergencyPhone"]')).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('#traveller-errors')).toContainText('Emergency contact email');await expect(page.locator('#traveller-errors')).toContainText('Emergency contact phone');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.locator('[name="emergencyEmail"]').fill('contact@example.test');await page.locator('[name="emergencyPhone"]').fill('9876543210');
 await review(page);await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('a native custom-validity failure keeps its indexed field focus and cannot start payment',async({page,provider})=>{
 await openFlightSearch(page);await selectFare(page);await fillParty(page,1);
 await page.locator('[name="first-0"]').evaluate(element=>(element as HTMLInputElement).setCustomValidity('Check the traveller spelling.'));
 await review(page);await expect(page.locator('[name="first-0"]')).toBeFocused();await expect(page.locator('[name="first-0"]')).toHaveAccessibleDescription('Check the traveller spelling.');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 await page.locator('[name="first-0"]').evaluate(element=>(element as HTMLInputElement).setCustomValidity(''));
 await review(page);await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
