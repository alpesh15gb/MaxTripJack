import type {Page} from '@playwright/test';
import {test,expect,departure,returning,searchId,openFlightSearch,reviewedQuote,type ProviderFixture} from './fixtures';

function hotelFixture(provider:ProviderFixture){
 const option={optionId:'history-breakfast',roomInfo:[{id:'history-double',name:'History Double'}],mealBasis:'BREAKFAST',pricing:{totalPrice:6540,currency:'INR'}};
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'History Garden Stay',customerEstimateMinor:654000}]}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{options:[option]}};
 provider.quote=reviewedQuote({product:'HOTEL',hotelName:'History Garden Stay',summary:{checkIn:departure,checkOut:returning,adults:1,rooms:[{adults:1,children:0,childAge:[]}]},review:{option}});
 return '/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',city:'Goa',date:departure,end:returning,adults:'1',autoSearch:'1'});
}

async function openFilters(page:Page,name:string){
 await expect(page.locator('#booking-results')).toBeVisible();
 if(name==='Filter flights'){
  const back=page.locator('.fare-comparison-options').getByRole('button',{name:'Back to flights',exact:true});
  if(await back.isVisible())await back.click();
 }
 await page.getByRole('button',{name:/^Filters/}).click();
 await expect(page.getByRole('dialog',{name,exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
}

async function expectUnlocked(page:Page){
 await expect(page.locator('dialog[open]')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
}

test('Forward into hotel details dismisses the results drawer and keeps the selected property usable',async({page,provider})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(hotelFixture(provider));
 await page.getByRole('article',{name:'History Garden Stay',exact:true}).getByRole('button',{name:'Choose room',exact:true}).click();
 await expect(page.locator('#hotel-detail-title')).toHaveText('History Garden Stay');
 await page.goBack();
 await openFilters(page,'Filter stays');
 await page.getByRole('dialog',{name:'Filter stays',exact:true}).getByLabel('Property name',{exact:true}).fill('History');
 await page.goForward();
 await expect(page.locator('#hotel-detail-title')).toHaveText('History Garden Stay');
 await expectUnlocked(page);
 const rate=page.locator('[data-room-option-id="history-breakfast"]');
 await rate.getByRole('button',{name:'Continue with room',exact:true}).focus();
 await expect(rate.getByRole('button',{name:'Continue with room',exact:true})).toBeFocused();
 await page.goBack();await expect(page.locator('#booking-results')).toBeVisible();
 await expect(page.getByRole('button',{name:/^Filters/})).toHaveAttribute('aria-expanded','false');
 await openFilters(page,'Filter stays');
 await expect(page.getByRole('dialog',{name:'Filter stays',exact:true}).getByLabel('Property name',{exact:true})).toHaveValue('History');
 await page.keyboard.press('Escape');await expectUnlocked(page);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const product of ['FLIGHT','HOTEL'] as const)test(`${product} Forward into cached checkout closes the results drawer without another review`,async({page,provider})=>{
 await page.setViewportSize({width:390,height:844});
 if(product==='FLIGHT'){
  await openFlightSearch(page);await page.locator('.fare-comparison-trigger').first().click();
  await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 }else{
  await page.goto(hotelFixture(provider));
  await page.getByRole('article',{name:'History Garden Stay',exact:true}).getByRole('button',{name:'Choose room',exact:true}).click();
  await page.getByRole('button',{name:'Continue with room',exact:true}).click();
 }
 const form=page.getByRole('form',{name:'Review and travellers',exact:true});
 await expect(form).toBeVisible();
 await form.getByLabel('First name',{exact:true}).fill('HistoryDraft');
 await form.getByLabel('Email',{exact:true}).fill('history-draft@example.test');
 await page.goBack();
 if(product==='HOTEL'){await expect(page.locator('#booking-rooms')).toBeVisible();await page.goBack();}
 await openFilters(page,product==='FLIGHT'?'Filter flights':'Filter stays');
 if(product==='FLIGHT')await page.goForward();
 else{
  // The browser history menu can jump straight over the property entry to checkout.
  await page.evaluate(()=>window.history.go(2));
 }
 await expect(form).toBeVisible();await expectUnlocked(page);
 await expect(form.getByLabel('First name',{exact:true})).toHaveValue('HistoryDraft');
 await expect(form.getByLabel('Email',{exact:true})).toHaveValue('history-draft@example.test');
 await form.getByLabel('First name',{exact:true}).focus();await expect(form.getByLabel('First name',{exact:true})).toBeFocused();
 const stored=await page.evaluate(()=>JSON.stringify({history:history.state,session:{...sessionStorage}}));
 expect(stored).not.toContain('history-draft@example.test');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(1);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
