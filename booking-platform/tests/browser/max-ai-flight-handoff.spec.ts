import {formatBookingDate} from '../../src/lib/travel-date';
import {toggleResultSearch, test,expect,departure,searchId,flight,flightResults,reviewedQuote,expectNoHorizontalOverflow,capture} from './fixtures';

const criteria=()=>({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'2',children:'0',infants:'0',cabin:'ECONOMY'});
const snapshot=()=>({...flightResults(),criteria:criteria(),expiresAt:new Date(Date.now()+600_000).toISOString()});

test('AI non-stop and IndiGo preferences filter the owned results and can be removed without another search',async({page,provider},info)=>{
  const direct=flight('ONWARD','indigo-direct'),other=flight('ONWARD','other-direct'),connecting=flight('ONWARD','indigo-connecting');
  other.sI[0].fD.aI={name:'Other Air',code:'ZZ'};other.sI[0].dt=`${departure}T08:00:00`;other.totalPriceList[0].customerEstimateMinor=500000;
  connecting.sI=[{...connecting.sI[0],aa:{code:'HYD',city:'Hyderabad'}},{...connecting.sI[0],da:{code:'HYD',city:'Hyderabad'},dt:`${departure}T12:00:00`,at:`${departure}T14:00:00`}];connecting.totalPriceList[0].customerEstimateMinor=400000;
  provider.overrides['POST /api/travel/flight-search-snapshot']={body:{...snapshot(),criteria:{...criteria(),adults:'1'},results:{searchResult:{tripInfos:{ONWARD:[connecting,other,direct]}}}}};
  await page.goto(`/book?product=FLIGHT&flightSearch=${searchId}&flightStops=0&flightAirlineQuery=IndiGo&flightSort=departure`);
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
  await expect(page.locator('.results-count')).toContainText('1 flight found');
  await expect(page.locator('#booking-search>summary')).toContainText('1 traveller');
  await expect(page.locator('#booking-search>summary')).not.toContainText('1 travellers');
  const selectedSort=page.getByRole('group',{name:'Sort flights',exact:true}).getByRole('button',{pressed:true});
  const nonstop=page.getByRole('button',{name:'Non-stop',exact:true});
  await expect(selectedSort).toHaveAccessibleName('Earliest departure');
  await expectNoHorizontalOverflow(page);await capture(page,info,'max-ai-flight-preferences-applied');
  await page.reload();
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Remove airline preference IndiGo',exact:true})).toBeVisible();
  await expect(nonstop).toHaveAttribute('aria-pressed','true');
  await expect(selectedSort).toHaveAccessibleName('Earliest departure');
  await page.getByRole('button',{name:'Remove airline preference IndiGo',exact:true}).click();
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(2);
  await expect(page).not.toHaveURL(/flightAirlineQuery=/);
  await nonstop.press('Enter');
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(3);
  await expect(page).not.toHaveURL(/flightStops=/);
  await page.reload();
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(3);
  await expect(page.getByRole('region',{name:'Active flight filters'}).getByRole('button',{name:/^Remove /})).toHaveCount(0);
  await expect(nonstop).toHaveAttribute('aria-pressed','false');
  await expect(page).not.toHaveURL(/flightStops=|flightAirlineQuery=/);
  await expect(selectedSort).toHaveAccessibleName('Earliest departure');
  expect(provider.requests('/api/travel/flight-search-snapshot')).toHaveLength(3);
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('long AI carrier preference wraps within the results and keeps its remove button usable',async({page,provider},info)=>{
  const carrier=`Synthetic${'International'.repeat(5)}`,direct=flight();
  direct.sI[0].fD.aI={name:carrier,code:'ZZ'};
  provider.overrides['POST /api/travel/flight-search-snapshot']={body:{...snapshot(),results:{searchResult:{tripInfos:{ONWARD:[direct]}}}}};
  await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',flightSearch:searchId,flightAirlineQuery:carrier,flightStops:'0'}));
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
  const remove=page.getByRole('button',{name:`Remove airline preference ${carrier}`,exact:true});
  await expect(remove).toBeVisible();
  const bounds=await remove.boundingBox(),container=await page.getByRole('region',{name:'Active flight filters'}).boundingBox();
  expect(bounds).not.toBeNull();expect(container).not.toBeNull();
  expect(bounds!.width).toBeLessThanOrEqual(container!.width+1);expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);await capture(page,info,'max-ai-flight-long-carrier-preference');
  await remove.click();await expect(remove).toHaveCount(0);
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('an AI flight result restores the same owned search and exact criteria before normal fare review',async({page,provider},info)=>{
  provider.overrides['POST /api/travel/flight-search-snapshot']={body:snapshot()};
  provider.quote=reviewedQuote({summary:{from:'BOM',to:'DEL',date:departure,adults:2,children:0,infants:0}});
  // Extra URL fields cannot replace the authoritative saved search criteria.
  await page.goto(`/book?product=FLIGHT&flightSearch=${searchId}&from=DEL&to=BOM&adults=9&autoSearch=1`);
  await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
  const airports = page.locator('#booking-search>summary .booking-airport-field');
  await expect(airports).toHaveText([/^FromBOM/, /^ToDEL/]);
  await expect(page.locator('#booking-search>summary')).toContainText('2 travellers');
  await toggleResultSearch(page);
  await page.locator('.booking-party-picker>summary').click();
  await expect(page.getByRole('combobox',{name:'Adults',exact:true})).toHaveValue('2');
  await expect(page.getByLabel('Departure',{exact:true})).toHaveValue(formatBookingDate(departure));
  await toggleResultSearch(page);
  await expectNoHorizontalOverflow(page);await capture(page,info,'max-ai-owned-flight-handoff');
  await page.locator('.flight-shopping-list .fare-comparison-trigger').click();
  await page.getByRole('button',{name:'Check fare & continue',exact:true}).click();
  await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
  expect(provider.requests('/api/travel/review').at(-1)?.body).toEqual({searchId,priceIds:['onward-standard']});
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/flight-search-snapshot')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

for(const variant of ['expired','foreign'] as const)test(`${variant} AI search offers recovery without silently making another supplier search`,async({page,provider})=>{
  provider.overrides['POST /api/travel/flight-search-snapshot']=variant==='expired'?{body:{...snapshot(),expiresAt:new Date(Date.now()-1000).toISOString()}}:{status:409,body:{error:'This flight search is no longer available in this browser. Search again to continue.'}};
  await page.goto(`/book?product=FLIGHT&flightSearch=${searchId}`);
  await expect(page.getByRole('button',{name:'Start a fresh search',exact:true})).toBeVisible();
  await expect(page.locator('.live-flight-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Start a fresh search',exact:true}).click();
  await expect(page).not.toHaveURL(/flightSearch=/);
  await expect(page.getByRole('heading',{name:'Search again to compare options',exact:true})).toBeVisible();
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
});

test('an invalid new search stops a held AI snapshot and corrected input can search without stale results',async({page,provider})=>{
  let release!:()=>void,settle!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),settled=new Promise<void>(resolve=>{settle=resolve;});
  await page.route('**/api/travel/flight-search-snapshot',async route=>{await held;await route.fulfill({json:snapshot()}).catch(()=>{}).finally(settle);});
  try{
    await page.goto('/book?'+new URLSearchParams({...criteria(),flightSearch:searchId}));
    await expect(page.getByRole('status',{name:'Search and booking activity'}).getByText('Restoring your flight search…',{exact:true})).toBeVisible();
    await expect(page.getByLabel('Departure',{exact:true})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Stays',exact:true})).toBeEnabled();
    await page.locator('.booking-party-picker>summary').click();
    await page.getByRole('combobox',{name:'Children · age 2–11',exact:true}).selectOption('8');
    await page.getByRole('button',{name:'Search flights',exact:true}).click();
    await expect(page.getByText('Adults and children must total nine or fewer. Each infant needs an adult.',{exact:true})).toBeVisible();
    await expect(page.getByRole('status',{name:'Search and booking activity'}).getByText('Restoring your flight search…',{exact:true})).toHaveCount(0);
    release();await settled;
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(page.locator('.live-flight-card')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Search flights',exact:true})).toBeEnabled();
    expect(provider.requests('/api/travel/search')).toHaveLength(0);
    await page.getByRole('combobox',{name:'Children · age 2–11',exact:true}).selectOption('0');
    await page.getByRole('button',{name:'Search flights',exact:true}).click();
    await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
    expect(provider.requests('/api/travel/search')).toHaveLength(1);
    expect(provider.requests('/api/travel/search')[0].body).toMatchObject({adults:2,children:0,date:departure});
    await expect(page).not.toHaveURL(/flightSearch=/);
  }finally{release();}
});

test('switching product supersedes a held AI flight snapshot without restoring stale flights',async({page,provider})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/travel/flight-search-snapshot',async route=>{await held;await route.fulfill({json:snapshot()});});
  try{
    await page.goto(`/book?product=FLIGHT&flightSearch=${searchId}`);
    await expect(page.getByRole('status',{name:'Search and booking activity'}).getByText('Restoring your flight search…',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Stays',exact:true}).click();
    release();
    await expect(page.getByRole('button',{name:'Search stays',exact:true})).toBeVisible();
    await expect(page).not.toHaveURL(/flightSearch=/);
    await expect(page.locator('.live-flight-card')).toHaveCount(0);
    expect(provider.requests('/api/travel/search')).toHaveLength(0);
  }finally{release();}
});
