import {travelDateLabel} from '../../src/lib/travel-date';
import {chooseFlightFilter,test,expect,capture,departure,returning,flight,searchId,reviewedQuote,expectNoHorizontalOverflow} from './fixtures';
import type {Flight} from '../../src/lib/booking-presentation';
import type {Locator,Page} from '@playwright/test';

async function expectUnclippedSortCards(sorting:Locator, columns:number) {
 const cards=await sorting.locator('.flight-sort-card:visible').evaluateAll(elements=>elements.map(card=>{
  const box=card.getBoundingClientRect();
  const overflowing=[...card.querySelectorAll('.flight-sort-card-label,.flight-sort-card-value')].some(text=>{
   const range=document.createRange();
   range.selectNodeContents(text);
   return [...range.getClientRects()].some(line=>line.left<box.left-1||line.right>box.right+1||line.top<box.top-1||line.bottom>box.bottom+1);
  });
  return {top:box.top,height:box.height,overflowing};
 }));
 expect(cards).toHaveLength(columns===2?4:5);
 expect(cards.every(card=>!card.overflowing)).toBe(true);
 expect(new Set(cards.map(card=>card.top)).size).toBe(columns===2?2:1);
 for(let index=0;index<cards.length;index+=columns){
  expect(cards.slice(index,index+columns)).toEqual(Array(columns).fill(cards[index]));
 }
}

async function filters(page:Page,open:boolean){
 const dialog=page.getByRole('dialog',{name:'Filter flights',exact:true});
 if(!open){if(await dialog.isVisible())await dialog.getByRole('button',{name:'Close filters',exact:true}).click();return;}
 const toggle=page.getByRole('button',{name:/^Filters/});
 if(await toggle.isVisible())await toggle.click();
}
test('320px flight results keep the fare label and arrow inside their tap target',async({page,provider},testInfo)=>{
 await page.setViewportSize({width:320,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 const ordinary=flight('ONWARD','ordinary-mobile-fare'),higher=flight('ONWARD','higher-mobile-fare');
 higher.sI[0]={...higher.sI[0],dt:`${departure}T12:15:00`,at:`${departure}T14:25:00`,fD:{...higher.sI[0].fD,fN:'401'}};
 higher.totalPriceList[0].customerEstimateMinor=12345678;
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[ordinary,higher]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const cards=page.locator('.flight-shopping-list .live-flight-card');
 await expect(cards).toHaveCount(2);
 await page.evaluate(async()=>{await document.fonts.ready;});
 for(let index=0;index<2;index++){
  const label=cards.nth(index).locator('.choose-fare-label');
  await label.scrollIntoViewIfNeeded();
  const bounds=await label.evaluate(node=>{
   const box=node.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);
   const text=range.getBoundingClientRect(),arrow=node.querySelector('[aria-hidden]')!.getBoundingClientRect();
   return {left:box.left,right:box.right,height:box.height,textLeft:text.left,textRight:text.right,arrowLeft:arrow.left,arrowRight:arrow.right};
  });
  await testInfo.attach(`mobile-fare-${index}-bounds`,{body:JSON.stringify(bounds),contentType:'application/json'});
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.left);
  expect(bounds.textRight).toBeLessThanOrEqual(bounds.right);
  expect(bounds.arrowLeft).toBeGreaterThanOrEqual(bounds.left);
  expect(bounds.arrowRight).toBeLessThanOrEqual(bounds.right);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`mobile-fare-${index}`,{body:await page.screenshot({path:testInfo.outputPath(`mobile-fare-${index}.png`),animations:'disabled'}),contentType:'image/png'});
 }
 await cards.first().locator('.fare-comparison-trigger').click();
 await expect(cards.first().getByRole('button',{name:'Check fare & continue',exact:true})).toBeVisible();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('flight shopping preserves local dates, airport identity and party fare contracts while filtering',async({page,provider},testInfo)=>{
 const tomorrow=new Date(departure+'T00:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const night:Flight={sI:[{dt:departure+'T23:25:00',at:tomorrow.toISOString().slice(0,10)+'T01:50:00',duration:145,fD:{aI:{name:'Example International Airways',code:'EX'},fN:'123'},da:{code:'DEL',city:'New Delhi'},aa:{code:'NMI',city:'Navi Mumbai'}}],totalPriceList:[{id:'night-standard',fareIdentifier:'STANDARD',customerEstimateMinor:1200000,fD:{ADULT:{cc:'ECONOMY',rT:0,bI:{cB:'7 Kg',iB:'15 Kg'}},CHILD:{bI:{cB:'5 Kg',iB:'10 Kg'}},INFANT:{bI:{iB:'No allowance'}}}},{id:'night-flex',fareIdentifier:'FLEXIBLE',customerEstimateMinor:1450000,fD:{ADULT:{cc:'ECONOMY',rT:1,bI:{cB:'7 Kg',iB:'25 Kg'}}}}]};
 const unknown:Flight={sI:[{...night.sI[0],dt:departure+'T19:00:00',at:departure+'T21:00:00',duration:undefined,fD:{aI:{name:'Unknown price fixture',code:'UP'},fN:'5'}}],totalPriceList:[{id:'unknown',fareIdentifier:'STANDARD',fD:{}}]};
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[night,flight(),unknown]}}}};
 provider.quote=reviewedQuote({totalMinor:1450000,summary:{from:'DEL',to:'NMI',date:departure,adults:2,children:1,infants:1}});
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'DEL',to:'NMI',date:departure,adults:'2',children:'1',infants:'1',cabin:'ECONOMY',autoSearch:'1'}));
 const cards=page.locator('.flight-shopping-list .live-flight-card');await expect(cards).toHaveCount(3);
 await expect(cards.first()).toContainText('IndiGo');await expect(cards.last()).toContainText('Price at review');
 await expect(page.locator('#booking-search>summary')).toContainText(travelDateLabel(departure));
 await expect(page.locator('#booking-search>summary')).not.toContainText(departure);
 await expect(page.locator('#booking-search>summary')).toContainText('4 travellers');await expect(page.locator('#booking-search>summary')).toContainText('Economy');
 await page.locator('#flight-results-title').evaluate(node=>(node as HTMLElement).focus({preventScroll:true}));
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>{let last=scrollY,stable=0,frames=0;function tick(){stable=Math.abs(scrollY-last)<1?stable+1:0;last=scrollY;if(stable>=8||++frames>=120)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});});
 const geometry=await cards.first().evaluate(node=>{const r=node.getBoundingClientRect();return {scrollY,viewportHeight:innerHeight,cardTop:r.top,cardBottom:r.bottom};});
 await testInfo.attach('flight-viewport-geometry',{body:JSON.stringify(geometry),contentType:'application/json'});
 const headingSelectors=['#flight-results-title','.flight-visible-count'];
 for(const selector of headingSelectors){
  const bounds=await page.locator(selector).evaluate(node=>{const box=node.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();return {left:box.left,right:box.right,textLeft:text.left,textRight:text.right,viewport:innerWidth};});
  expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.left-1);expect(bounds.textRight).toBeLessThanOrEqual(bounds.right+1);
 }
 await expect(page.locator('.flight-visible-count')).toHaveText(/^Showing 1–3 of 3 flights( · lowest ₹[\d,]+)?$/);
 const shot=await page.screenshot({path:testInfo.outputPath(`flight-shopping-viewport-${testInfo.project.name}-synthetic.png`),fullPage:false,animations:'disabled'});await testInfo.attach('flight-shopping viewport',{body:shot,contentType:'image/png'});
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'flight-shopping-loaded');
 await filters(page,true);
 await page.getByRole('spinbutton',{name:'Maximum total for all travellers (₹)',exact:true}).fill('7000');await filters(page,false);await expect(page.getByLabel('Active flight filters')).toContainText('Up to ₹7,000 · all travellers');await expect(page.getByLabel('Active flight filters')).not.toContainText('/ party');await expect(cards).toHaveCount(1);await expect(cards.first()).toContainText('IndiGo');
 await filters(page,true);
 await page.getByRole('button',{name:'Reset flight filters',exact:true}).click();await expect(cards).toHaveCount(3);
 await chooseFlightFilter(page,'Departure time','EVENING');await expect(cards).toHaveCount(2);
 await page.getByRole('spinbutton',{name:'Maximum total for all travellers (₹)',exact:true}).fill('13000');await expect(cards).toHaveCount(1);
 await expect(cards.first()).toContainText('+1 calendar day');await expect(cards.first()).toContainText('NMI');await expect(cards.first()).toContainText('Navi Mumbai');
 const route=cards.first().locator('.flight-route-line');
 await expect(route).toContainText('11:25 PM');
 await expect(route).toContainText('1:50 AM');
 await expect(route.getByText('Direct',{exact:true})).toBeVisible();
 const timeline=await route.locator('.flight-route-track').evaluate(track=>{
  const line=track.querySelector('.flight-track-drawing');
  return line?line.getBoundingClientRect().width/track.getBoundingClientRect().width:0;
 });
 expect(timeline,'route line should span the middle column').toBeGreaterThan(.75);
 const allowances=cards.first().getByRole('list',{name:'Known details for the displayed adult fare'});
 await expect(allowances).toContainText('Cabin bag 7 Kg');
 await expect(allowances).toContainText('15 Kg checked');
 await expect(cards.first().locator('.fare-comparison-trigger')).toContainText('Estimated total · all travellers');
 await chooseFlightFilter(page,'Airline (any segment)','IndiGo');await filters(page,false);await expect(page.getByRole('heading',{name:'No flights match these filters'})).toBeVisible();
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(cards).toHaveCount(3);
 await filters(page,true);await chooseFlightFilter(page,'Airline (any segment)','Example International Airways');
 await filters(page,false);
 await cards.first().locator('.flight-segment-details>summary').click();await expect(cards.first().locator('.flight-segment-details')).toContainText('EX 123');
 const trigger=cards.first().locator('.fare-comparison-trigger');
 const cardHeight=await cards.first().evaluate(card=>card.getBoundingClientRect().height);
 await trigger.click();
 const fareDialog=cards.first().getByRole('dialog',{name:'Flight details and fare options'});
 await expect(fareDialog).toContainText('child: cabin baggage 5 Kg');
 await expect(fareDialog).toContainText('infant: cabin baggage not supplied');
 await expect(fareDialog).toHaveCSS('position','fixed');
 expect(await cards.first().evaluate(card=>card.getBoundingClientRect().height)).toBeCloseTo(cardHeight,0);
 const flexibleFare=fareDialog.getByRole('group',{name:'Flexible fare',exact:true});
 await expect(flexibleFare).toContainText('₹14,500');
 await expect(flexibleFare).toHaveAccessibleDescription(/Check final prices, fees, meals and seat options at review\./);
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'flight-fare-families');
 await flexibleFare.getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/review')).toHaveLength(1);expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['night-flex']});
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/search')[0].body).toMatchObject({date:departure});expect(provider.requests('/api/payments/create')).toHaveLength(0);
});


test('automatic return advance clears group filters but preserves selected outbound fare',async({page,provider})=>{
 const back=flight('RETURN');back.sI[0].dt=returning+'T19:00:00';back.totalPriceList[0].customerEstimateMinor=1000000;
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[flight()],RETURN:[back]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,returnDate:returning,adults:'1',autoSearch:'1'}));
 await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
 await filters(page,true);
 await chooseFlightFilter(page,'Departure time','MORNING');await page.getByRole('spinbutton',{name:'Maximum total for all travellers (₹)',exact:true}).fill('7000');
 await filters(page,false);await page.locator('.fare-comparison-trigger').click();await page.getByRole('button',{name:'Choose this outbound fare',exact:true}).click();
 await expect(page.getByRole('button',{name:'Return',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.flight-shopping-list .live-flight-card')).toContainText('₹10,000');
 await filters(page,true);
 const departureFilter=page.getByRole('combobox',{name:'Departure time',exact:true});
 if(await departureFilter.isVisible())await expect(departureFilter).toHaveValue('ALL');
 else await expect(page.locator('.stitch-time-grid button[aria-pressed=true]')).toHaveCount(0);
 await expect(page.getByRole('spinbutton',{name:'Maximum total for all travellers (₹)',exact:true})).toHaveValue('');
 await filters(page,false);await page.getByRole('button',{name:/^Outbound/}).click();await page.locator('.fare-comparison-trigger').click();await expect(page.getByRole('button',{name:'Selected',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('flight sort cards align and the menu reorders loaded options', async ({page, provider}, testInfo) => {
 if (testInfo.project.name === 'mobile-390') await page.setViewportSize({width:374,height:844});
 const cheapest: Flight = flight('ONWARD', 'cheapest');
 cheapest.sI[0] = {...cheapest.sI[0], dt: `${departure}T10:00:00`, at: `${departure}T13:00:00`, duration: 180, fD: {...cheapest.sI[0].fD, aI: {name: 'Price fixture'}}};
 cheapest.totalPriceList[0].customerEstimateMinor = 300000;
 const shortest: Flight = flight('ONWARD', 'shortest');
 shortest.sI[0] = {...shortest.sI[0], dt: `${departure}T11:00:00`, at: `${departure}T12:00:00`, duration: 60, fD: {...shortest.sI[0].fD, aI: {name: 'Duration fixture'}}};
 shortest.totalPriceList[0].customerEstimateMinor = 600000;
 const earliest: Flight = flight('ONWARD', 'earliest');
 earliest.sI[0] = {...earliest.sI[0], dt: `${departure}T06:00:00`, at: `${departure}T08:00:00`, duration: 120, fD: {...earliest.sI[0].fD, aI: {name: 'Departure fixture'}}};
 earliest.totalPriceList[0].customerEstimateMinor = 900000;
 const unknown: Flight = flight('ONWARD', 'unknown');
 unknown.sI[0] = {...unknown.sI[0], dt: 'unknown', at: 'unknown', duration: undefined, fD: {...unknown.sI[0].fD, aI: {name: 'Unknown fixture'}}};
 unknown.totalPriceList[0].customerEstimateMinor = undefined;
 provider.search = {searchId, results: {searchResult: {tripInfos: {ONWARD: [unknown, earliest, shortest, cheapest]}}}};
 await page.goto('/book?' + new URLSearchParams({product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure, adults: '1', autoSearch: '1'}));
 const names = page.locator('.flight-shopping-list .airline-identity strong');
 await expect(names).toHaveText(['Price fixture', 'Duration fixture', 'Departure fixture', 'Unknown fixture']);
 const sorting = page.getByRole('group', {name: 'Sort flights', exact: true});
 await expect(sorting).toHaveCount(1);
 await expect(sorting.locator('.flight-sort-card-value')).toHaveText([/^₹[\d,]+ INR$/,'₹3,000 INR','1h 0m','Leave first',/^Cheapest\s*$/]);
 await page.evaluate(() => document.fonts.ready);
 if(testInfo.project.name==='mobile-390'){
  for(const width of [320,360,390,430,374]){
   await page.setViewportSize({width,height:844});
   await expectUnclippedSortCards(sorting,2);
   await expectNoHorizontalOverflow(page);
  }
 }else await expectUnclippedSortCards(sorting,5);
 await sorting.screenshot({path:testInfo.outputPath(`sort-cards-${testInfo.project.name}.png`),animations:'disabled'});
 const more = sorting.getByRole('button',{name:'More sorts',exact:true});
 const menu = sorting.getByRole('menu',{name:'Flight sort options'});
 await more.click();
 await expect(menu).toBeVisible();
 await page.screenshot({path:testInfo.outputPath(`sort-menu-${testInfo.project.name}.png`),animations:'disabled'});
 await page.locator('#flight-results-title').click();
 await expect(menu).toBeHidden();
 for (const sort of [
  {label: 'Shortest', order: ['Duration fixture', 'Departure fixture', 'Price fixture', 'Unknown fixture']},
  {label: 'Earliest departure', order: ['Departure fixture', 'Price fixture', 'Duration fixture', 'Unknown fixture']},
  {label: 'Cheapest', order: ['Price fixture', 'Duration fixture', 'Departure fixture', 'Unknown fixture']},
 ]) {
  const tile = sorting.getByRole('button', {name: sort.label, exact: true});
  if (await tile.isVisible()) {
   await tile.click();
   await expect(sorting.getByRole('button', {pressed: true})).toHaveCount(1);
   await expect(sorting.getByRole('button', {pressed: true})).toHaveAccessibleName(sort.label);
  } else {
   // Phones keep Earliest departure in the More sorts menu.
   await more.click();
   await menu.getByRole('menuitemradio', {name: sort.label, exact: true}).click();
   await expect(more).toContainText(sort.label);
  }
  await expect(names).toHaveText(sort.order);
 }
 await more.press('ArrowDown');
 const active = menu.getByRole('menuitemradio',{name:'Cheapest',exact:true});
 await expect(active).toBeFocused();
 await expect(active).toHaveAttribute('aria-checked','true');
 await expect(menu.getByRole('menuitemradio')).toHaveText(['Best','Cheapest','Shortest','Earliest departure','Earliest arrival']);
 await expect(menu).toBeInViewport({ratio:1});
 await page.keyboard.press('Escape');
 await expect(more).toBeFocused();
 await expect(menu).toBeHidden();
 await more.click();
 await page.keyboard.press('End');
 await expect(menu.getByRole('menuitemradio',{name:'Earliest arrival'})).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(more).toHaveAccessibleDescription('Earliest arrival');
 await expect(more).toBeFocused();
 await expect(menu).toBeHidden();
 await expect(names).toHaveText(['Departure fixture', 'Duration fixture', 'Price fixture', 'Unknown fixture']);
 await expectUnclippedSortCards(sorting,testInfo.project.name==='mobile-390'?2:5);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('outbound results link to real destination planning after the sixth option', async ({page,provider}) => {
 const flights=Array.from({length:7},(_,index)=>{
  const result=flight('ONWARD',`destination-planning-${index}`);
  result.sI[0].fD.fN=String(201+index);
  return result;
 });
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:flights}}}};
 await page.goto(`/book?product=FLIGHT&from=BOM&to=DEL&date=${departure}&adults=1&autoSearch=1`);
 const results=page.locator('.flight-shopping-list');
 await expect(results.locator('.live-flight-card')).toHaveCount(7);
 const ideas=results.getByRole('region',{name:'Complete your trip to New Delhi'});
 await expect(ideas).toBeVisible();
 expect(await ideas.evaluate(node=>[...node.parentElement!.children].slice(0,[...node.parentElement!.children].indexOf(node)).filter(sibling=>sibling.matches('.live-flight-card')).length)).toBe(6);
 await expect(ideas.getByRole('link',{name:'Find hotels'})).toHaveAttribute('href','/book?product=HOTEL&city=New+Delhi');
 await expect(ideas.getByRole('link',{name:'Ask about things to do'})).toHaveAttribute('href','/contact?topic=activity&destination=New+Delhi#office-enquiry');
 await expectNoHorizontalOverflow(page);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('the results search bar edits preferences, routes and dates without losing the trip context', async ({page, provider}, testInfo) => {
 const first = flight();
 const other = flight('ONWARD','second-fare');
 other.sI[0].fD.aI = {name:'Air India',code:'AI'};
 provider.search = {searchId,results:{searchResult:{tripInfos:{ONWARD:[first,other]}}}};
 await page.goto(`/book?product=FLIGHT&from=BOM&to=DEL&date=${departure}&adults=1&cabin=ECONOMY&autoSearch=1`);
 const list = page.locator('.flight-shopping-list .live-flight-card');
 const search = page.getByRole('form',{name:'Search availability'});
 await expect(list).toHaveCount(2);
 await expect(page.getByRole('heading',{name:'Flights from Mumbai to New Delhi',exact:true})).toBeVisible();
 await expect(search.getByRole('button',{name:'One way',exact:true})).toHaveAttribute('aria-pressed','true');
 const backdrop = await page.locator('#booking-search').evaluate(node => {
  const painted = getComputedStyle(node,'::before');
  const offset = new DOMMatrix(painted.transform).m41;
  const left = node.getBoundingClientRect().left + parseFloat(painted.left) + offset;
  return {left,width:parseFloat(painted.width),viewport:innerWidth,shadow:painted.boxShadow,clip:painted.clipPath};
 });
 expect(backdrop.left).toBeCloseTo(0,0);
 expect(backdrop.width).toBe(backdrop.viewport);
 expect(backdrop.shadow).toBe('none');
 expect(backdrop.clip).toBe('none');
 if(testInfo.project.name==='desktop-1440'){
  const lines = await search.getByRole('button',{name:'Round trip',exact:true}).evaluate(node=>{
   const range=document.createRange();
   range.selectNodeContents(node);
   return range.getClientRects().length;
  });
  expect(lines).toBe(1);
 }
 await page.evaluate(()=>window.scrollTo(0,0));
 await testInfo.attach('flight comparison viewport',{body:await page.screenshot({path:testInfo.outputPath(`comparison-${testInfo.project.name}.png`),animations:'disabled'}),contentType:'image/png'});
 await list.first().scrollIntoViewIfNeeded();
 await testInfo.attach('flight card viewport',{body:await page.screenshot({path:testInfo.outputPath(`flight-card-${testInfo.project.name}.png`),animations:'disabled'}),contentType:'image/png'});
 await search.getByRole('button',{name:'Preferred airlines',exact:true}).click();
 await search.getByLabel('Preferred airlines',{exact:true}).fill('AI');
 await search.getByRole('button',{name:'Apply',exact:true}).click();
 await expect(list).toHaveCount(1);
 await expect(list.first()).toContainText('Air India');
 await search.getByRole('button',{name:'Clear',exact:true}).click();
 await expect(list).toHaveCount(2);
 await search.getByRole('button',{name:'Next day',exact:true}).click();
 await expect.poll(()=>provider.requests('/api/travel/search').length).toBe(2);
 expect(provider.requests('/api/travel/search').at(-1)?.body).toMatchObject({from:'BOM',to:'DEL',adults:1,cabin:'ECONOMY'});
 await expect(search.getByRole('combobox',{name:'From airport',exact:true})).toHaveValue('BOM');
 await search.getByRole('button',{name:'Swap airports',exact:true}).click();
 await expect(search.getByRole('combobox',{name:'From airport',exact:true})).toHaveValue('DEL');
 await expect(search.getByRole('combobox',{name:'To airport',exact:true})).toHaveValue('BOM');
 await search.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect(list).toHaveCount(2);
 expect(provider.requests('/api/travel/search').at(-1)?.body).toMatchObject({from:'DEL',to:'BOM',adults:1,cabin:'ECONOMY'});
 await expect(search.getByRole('combobox',{name:'From airport',exact:true})).toHaveValue('DEL');
 await expect(search.getByRole('combobox',{name:'To airport',exact:true})).toHaveValue('BOM');
 await expectNoHorizontalOverflow(page);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('320px round-trip search keeps the route, party and adjoining dates usable', async ({page, provider}, testInfo) => {
 if (testInfo.project.name !== 'mobile-390') test.skip();
 await page.setViewportSize({width:320,height:844});
 provider.search = {searchId,results:{searchResult:{tripInfos:{ONWARD:[flight()],RETURN:[flight('RETURN')]}}}};
 await page.goto('/book?' + new URLSearchParams({
  product:'FLIGHT', from:'BOM', to:'DEL', date:departure, returnDate:returning,
  adults:'2', children:'1', infants:'1', cabin:'PREMIUM_ECONOMY', autoSearch:'1',
 }));
 await expect(page.locator('.flight-shopping-list .live-flight-card')).toHaveCount(1);
 const search = page.getByRole('form',{name:'Search availability'});
 const region = await search.boundingBox();
 expect(region).not.toBeNull();
 const targets = [
  search.getByRole('button',{name:'Round trip',exact:true}),
  search.getByRole('button',{name:'One way',exact:true}),
  search.getByRole('button',{name:'Multi-city',exact:true}),
  search.getByRole('combobox',{name:'From airport',exact:true}),
  search.getByRole('combobox',{name:'To airport',exact:true}),
  search.getByRole('button',{name:'Swap airports',exact:true}),
  search.getByRole('button',{name:'Departure calendar',exact:true}),
  search.getByRole('button',{name:'Previous day',exact:true}),
  search.getByRole('textbox',{name:'Departure',exact:true}),
  search.getByRole('button',{name:'Next day',exact:true}),
  search.getByRole('textbox',{name:'Return date',exact:true}),
  search.getByRole('button',{name:'Return date calendar',exact:true}),
  search.getByRole('button',{name:'Search flights',exact:true}),
  search.getByRole('button',{name:'Preferred airlines',exact:true}),
 ];
 for (const target of targets) {
  await expect(target).toBeVisible();
  const bounds = (await target.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(24);
  expect(bounds.height).toBeGreaterThanOrEqual(24);
  expect(bounds.x).toBeGreaterThanOrEqual(region!.x-1);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(region!.x+region!.width+1);
 }
 await expect(targets[0]).toHaveAttribute('aria-pressed','true');
 await expectNoHorizontalOverflow(page);
 const party = search.locator('.booking-party-picker > summary');
 await expect(party).toContainText('4 travellers · Premium economy');
 await party.click();
 await expect(search.getByRole('combobox',{name:'Adults',exact:true})).toHaveValue('2');
 await expect(search.getByRole('combobox',{name:/^Children/})).toHaveValue('1');
 await expect(search.getByRole('combobox',{name:/^Infants/})).toHaveValue('1');
 await expect(search.getByRole('combobox',{name:'Cabin',exact:true})).toHaveValue('PREMIUM_ECONOMY');
 await expectNoHorizontalOverflow(page);
 await party.click();
 const preferences = search.getByRole('button',{name:'Preferred airlines',exact:true});
 await preferences.click();
 const preference = search.getByLabel('Preferred airlines',{exact:true});
 await expect(preference).toBeFocused();
 await preference.press('Escape');
 await expect(preferences).toBeFocused();
 await expect(preference).toBeHidden();
 await page.evaluate(()=>window.scrollTo(0,0));
 await testInfo.attach('320px round-trip search',{body:await page.screenshot({path:testInfo.outputPath('round-trip-320.png'),animations:'disabled'}),contentType:'image/png'});
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('return headlines, ordering and budget use fares compatible with the selected outbound', async ({page, provider}, testInfo) => {
 const mixed: Flight = flight('RETURN', 'compatible-expensive');
 mixed.sI[0].fD.aI.name = 'Mixed return fixture';
 mixed.totalPriceList[0].customerEstimateMinor = 900000;
 mixed.totalPriceList.unshift({...mixed.totalPriceList[0], id: 'incompatible-cheap', fareIdentifier: 'SPECIAL_RETURN', customerEstimateMinor: 100000, msri: ['another-outbound']});
 const compatible: Flight = flight('RETURN', 'compatible-cheaper');
 compatible.sI[0].fD.aI.name = 'Compatible return fixture';
 compatible.totalPriceList[0].customerEstimateMinor = 700000;
 provider.search = {searchId, results: {searchResult: {tripInfos: {ONWARD: [flight()], RETURN: [mixed, compatible]}}}};
 await page.goto('/book?' + new URLSearchParams({product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure, returnDate: returning, adults: '1', autoSearch: '1'}));
 await page.locator('.flight-shopping-list .fare-comparison-trigger').click();
 await page.getByRole('button', {name: 'Choose this outbound fare', exact: true}).click();
 const cards = page.locator('.flight-shopping-list .live-flight-card');
 await expect(cards).toHaveCount(2);
 await expect(cards.first()).toContainText('Compatible return fixture');
 const mixedCard = cards.filter({hasText: 'Mixed return fixture'});
 await expect(mixedCard.locator('.fare-comparison-trigger')).toContainText('From ₹9,000');
 await expect(mixedCard.locator('.fare-comparison-trigger')).not.toContainText('₹1,000');
 await expectNoHorizontalOverflow(page);
 await capture(page, testInfo, 'compatible-return-results');
 await filters(page,true);
 await page.getByRole('spinbutton', {name: 'Maximum total for all travellers (₹)', exact: true}).fill('8000');
 await expect(cards).toHaveCount(1);
 await expect(cards.first()).toContainText('Compatible return fixture');
 await page.getByRole('button', {name: 'Reset flight filters', exact: true}).click();
 await filters(page,false);
 await mixedCard.locator('.fare-comparison-trigger').click();
 const unavailable = mixedCard.locator('.fare-option').filter({has: page.getByRole('heading', {name: 'Special return fare', exact: true})});
 await expect(unavailable.getByRole('button', {name: 'Choose this return fare', exact: true})).toBeDisabled();
 await expect(mixedCard.locator('.fare-option').filter({has: page.getByRole('heading', {name: 'Standard fare', exact: true})}).getByRole('button', {name: 'Choose this return fare', exact: true})).toBeEnabled();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
