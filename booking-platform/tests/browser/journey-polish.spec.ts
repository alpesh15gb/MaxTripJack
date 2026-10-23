import {test,expect,flight,departure,returning,searchId,reviewedQuote,expectNoHorizontalOverflow} from './fixtures';
import type {Page,TestInfo,Locator} from '@playwright/test';
const flightQuery=(auto=true)=>'/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',...(auto?{autoSearch:'1'}:{})});
const hotelQuery=(auto=true)=>'/book?'+new URLSearchParams({product:'HOTEL',city:'Goa',hotelIds:'10001',date:departure,end:returning,adults:'1',...(auto?{autoSearch:'1'}:{})});
async function shot(page:Page,info:TestInfo,name:string,critical:Locator[]=[]){
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>{let previous=scrollY,stable=0;const tick=()=>{stable=Math.abs(scrollY-previous)<1?stable+1:0;previous=scrollY;if(stable>=8)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});});
 await expectNoHorizontalOverflow(page);
 const bounds=await Promise.all(critical.map(item=>item.evaluate(node=>{const r=node.getBoundingClientRect();return {text:node.textContent,top:r.top,bottom:r.bottom,viewport:innerHeight};})));
 await info.attach(name,{body:await page.screenshot({path:info.outputPath(`${name}.png`),fullPage:false,animations:'disabled'}),contentType:'image/png'});
 await info.attach(name+'-geometry',{body:JSON.stringify(bounds),contentType:'application/json'});
 for(const rect of bounds){expect(rect.top).toBeGreaterThanOrEqual(0);expect(rect.bottom).toBeLessThanOrEqual(rect.viewport);}
}
for(const width of [null,320])test.describe(width?'Polish320':'Polish project viewport',()=>{
 test.beforeEach(async({page})=>{if(width)await page.setViewportSize({width,height:844});});
 for(const product of ['FLIGHT','HOTEL'] as const)test(`${product} pending scene is immediate, cancellable and cannot replace retry with a stale response`,async({page,provider},info)=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let calls=0;let settleStale!:()=>void;const staleSettled=new Promise<void>(resolve=>settleStale=resolve);
  const current=product==='FLIGHT'?provider.search:{searchId,results:{hotels:[{tjHotelId:'10001',name:'Current fixture stay',customerEstimateMinor:800000}]}};
  await page.route('**/api/travel/search',async route=>{calls++;if(calls===1){await held;await route.fulfill({json:{searchId:'stale-response',results:{hotels:[]}}}).catch(()=>{});settleStale();}else await route.fulfill({json:current});});
  await page.goto(product==='FLIGHT'?flightQuery(false):hotelQuery(false));
  await page.evaluate(()=>{const evidence={submitted:0,visible:0};Object.assign(window,{__feedbackTiming:evidence});document.addEventListener('submit',()=>{evidence.submitted=performance.now();let frames=0;const tick=()=>{const node=document.querySelector('#booking-pending [role=status]'),rect=node?.getBoundingClientRect();if(rect&&rect.height>0&&rect.top>=0&&rect.bottom<=innerHeight){evidence.visible=performance.now();}else if(++frames<600)requestAnimationFrame(tick);};requestAnimationFrame(tick);},{once:true,capture:true});});
  try{
   await page.getByRole('form',{name:'Search availability'}).getByRole('button',{name:product==='FLIGHT'?'Search flights':'Search stays',exact:true}).click();
   const pending=page.locator('#booking-pending');await expect(pending).toContainText(product==='FLIGHT'?'BOM → DEL':'Goa');await expect(pending).toContainText('Waiting for live supplier availability');
   await expect(pending).not.toContainText(/\d+%|seconds remaining|almost there/i);expect(calls).toBe(1);
   await expect.poll(()=>page.evaluate(()=>((window as unknown as {__feedbackTiming:{visible:number}}).__feedbackTiming.visible))).toBeGreaterThan(0);
   const timing=await page.evaluate(()=>((window as unknown as {__feedbackTiming:{submitted:number;visible:number}}).__feedbackTiming));expect(timing.visible-timing.submitted).toBeGreaterThanOrEqual(0);expect(timing.visible-timing.submitted).toBeLessThan(1000);
   await info.attach('synthetic-submit-to-visible-feedback-ms',{body:JSON.stringify(timing),contentType:'application/json'});
   await shot(page,info,`${product.toLowerCase()}-animated-pending`,[pending.getByRole('heading'),pending.getByRole('button',{name:'Stop search & edit',exact:true})]);
   await pending.getByRole('button',{name:'Stop search & edit',exact:true}).click();await expect(pending).toHaveCount(0);await expect(page.locator('#booking-feedback')).toContainText('Search stopped on this page');
   await expect(page.getByRole('form',{name:'Search availability'}).locator('input:not([type=hidden])').first()).toBeFocused();
   await page.getByRole('form',{name:'Search availability'}).getByRole('button',{name:product==='FLIGHT'?'Search flights':'Search stays',exact:true}).click();
   await expect(page.locator('#booking-results')).toBeVisible();expect(calls).toBe(2);release();await staleSettled;
   await expect(page.locator('#booking-results')).toContainText(product==='FLIGHT'?'IndiGo':'Current fixture stay');
   expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
  }finally{release();}
 });
 test('stop-search focus respects a deliberately chosen destination field',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/travel/search',async route=>{await held;await route.abort().catch(()=>{});});
  try{await page.goto(flightQuery());await expect(page.getByRole('button',{name:'Stop search & edit',exact:true})).toBeVisible();
   await page.evaluate(()=>{requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('input[aria-label="To airport"]')?.focus());(Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Stop search & edit') as HTMLButtonElement).click();});
   await expect(page.locator('input[aria-label="To airport"]')).toBeFocused();
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   await expect(page.locator('input[aria-label="To airport"]')).toBeFocused();
  }finally{release();}
 });
 test('reduced motion and failed search keep honest feedback and a working retry',async({page,provider},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let calls=0;
  await page.route('**/api/travel/search',async route=>{calls++;if(calls===1){await held;await route.fulfill({status:503,json:{error:'Supplier availability could not be checked. Try again.'}});}else await route.fulfill({json:provider.search});});
  try{await page.goto(flightQuery());await expect(page.locator('.journey-search-plane')).toHaveCSS('animation-name','none');await shot(page,info,'reduced-motion-search');}finally{release();}
  await expect(page.locator('#booking-feedback')).toContainText('Supplier availability could not be checked');await expect(page.locator('#booking-pending')).toHaveCount(0);
  await page.getByRole('button',{name:'Search flights',exact:true}).click();await expect(page.locator('#booking-results')).toBeVisible();expect(calls).toBe(2);
 });
 test('compact fares expose both leading prices and preserve original estimates separately from reviewed total',async({page,provider},info)=>{
  const row=flight();row.totalPriceList.push({...row.totalPriceList[0],id:'flex-exact-id',fareIdentifier:'FLEXIBLE',customerEstimateMinor:720050});provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[row]}}}};provider.quote=reviewedQuote({totalMinor:740050});
  await page.goto(flightQuery());await page.locator('.fare-comparison>summary').press('Enter');
  const offers=page.locator('.flight-shopping-list .fare-option');await expect(offers).toHaveCount(2);
  await shot(page,info,'compact-fare-comparison',[offers.first().getByRole('button',{name:'Check fare & continue',exact:true}),offers.nth(1).locator('.fare-option-heading')]);
  await offers.nth(1).getByRole('button',{name:'Check fare & continue',exact:true}).click();await expect(page.locator('#booking-review-title')).toBeFocused();
  await expect(page.locator('.selected-reviewed-total')).toContainText('₹7,400.50');await expect(page.locator('.selected-reviewed-total')).not.toContainText('₹7,200.50');
  const expiryWidth=await page.locator('.booking-expiry').evaluate(node=>{const content=node.firstElementChild!.getBoundingClientRect(),box=node.getBoundingClientRect();return {content:content.width,available:box.width-22};});
  if((page.viewportSize()?.width??1440)<=600)expect(expiryWidth.content).toBeGreaterThanOrEqual(expiryWidth.available-1);
  await shot(page,info,'compact-traveller-entry',[page.locator('.selected-reviewed-total'),page.locator('.booking-expiry'),page.getByRole('textbox',{name:'First name',exact:true})]);
  await page.getByText('Original search details & fare',{exact:true}).click();await expect(page.locator('.selected-source-details')).toContainText('₹7,200.50');await expect(page.locator('.selected-source-details')).toContainText('Estimated total');
  if((page.viewportSize()?.width??1440)<=600){
   const title=page.locator('select[name="title-0"]');await title.selectOption('Master');
   for(const enlarged of [false,true]){
    const fit=await title.evaluate((node,enlarge)=>{const label=node.closest('label')!;if(enlarge){label.style.fontSize='32px';node.style.fontSize='32px';}const style=getComputedStyle(node),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;ctx.font=style.font;const r=node.getBoundingClientRect(),row=node.closest('.traveller-identity')!.getBoundingClientRect();return {width:r.width,needed:ctx.measureText((node as HTMLSelectElement).selectedOptions[0].text).width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+24,left:r.left,right:r.right,rowLeft:row.left,rowRight:row.right};},enlarged);
    expect(fit.width).toBeGreaterThanOrEqual(fit.needed);expect(fit.left).toBeGreaterThanOrEqual(fit.rowLeft);expect(fit.right).toBeLessThanOrEqual(fit.rowRight+1);
   }
   await expectNoHorizontalOverflow(page);
  }
  expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['flex-exact-id']});expect(provider.requests('/api/payments/create')).toHaveLength(0);
 });
 test('hotel reviewed receipt never inherits a stale zero-charge window from room search',async({page,provider})=>{
  provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Policy fixture stay',customerEstimateMinor:800000}]}};
  provider.overrides['POST /api/travel/hotel-detail']={body:{options:[{optionId:'room-exact-id',roomInfo:[{name:'Twin room'}],pricing:{totalPrice:8000},cancellation:{isRefundable:true,penalties:[{from:'2020-01-01T00:00:00',to:'2099-01-01T00:00:00',amount:0}]}}]}};
  provider.quote=reviewedQuote({product:'HOTEL',summary:{city:'Goa',date:departure,end:returning,adults:1},review:{conditions:{},option:{optionId:'room-exact-id'}}});
  await page.goto(hotelQuery());await page.getByRole('button',{name:'Choose room',exact:true}).click();await page.getByRole('button',{name:'Review stay',exact:true}).click();
  await expect(page.locator('.selected-journey-recap')).toContainText('Cancellation terms require review');await expect(page.locator('.selected-journey-recap')).not.toContainText('free-cancellation');
  await expect(page.getByText('Cancellation terms unavailable. Do not assume this fare is refundable. Contact support for the terms before paying.',{exact:true})).toBeVisible();expect(provider.requests('/api/payments/create')).toHaveLength(0);
 });
});
