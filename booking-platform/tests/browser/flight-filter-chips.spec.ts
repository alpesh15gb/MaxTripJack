import {chooseFlightFilter,test,expect,flight,departure,searchId,expectNoHorizontalOverflow} from './fixtures';
import type {Page} from '@playwright/test';
import type {Flight} from '../../src/lib/booking-presentation';

async function setFiltersOpen(page:Page,open:boolean) {
  const dialog=page.getByRole('dialog',{name:'Filter flights',exact:true});
  if(!open){if(await dialog.isVisible())await dialog.getByRole('button',{name:'Close filters',exact:true}).click();return;}
  const trigger=page.getByRole('button',{name:/^Filters/});if(await trigger.isVisible())await trigger.click();
}
function option(id:string,hour:string,amount:number,carrier='IndiGo',duration=130):Flight {
  const item:Flight=flight('ONWARD',id);
  item.sI[0]={...item.sI[0],dt:`${departure}T${hour}:15:00`,at:`${departure}T${String(Number(hour)+2).padStart(2,'0')}:25:00`,duration,fD:{aI:{name:carrier},fN:id}};
  item.totalPriceList[0].customerEstimateMinor=amount;
  return item;
}

test('visible chips undo each filter and clear all without resetting sort or repeating the supplier search',async({page,provider},testInfo)=>{
  const cheap=option('cheap','09',600000),expensive=option('expensive','10',1000000,'IndiGo',90);
  const evening=option('evening','19',700000),other=option('other','09',650000,'Air India');
  const connecting=option('connection','09',500000);
  connecting.sI=[{...connecting.sI[0],aa:{code:'AMD',city:'Ahmedabad'}},{...connecting.sI[0],da:{code:'AMD',city:'Ahmedabad'},dt:`${departure}T12:15:00`,at:`${departure}T14:25:00`}];
  provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[cheap,expensive,evening,other,connecting]}}}};
  await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
  const cards=page.locator('.flight-shopping-list .live-flight-card');await expect(cards).toHaveCount(5);
  const sorts=page.getByRole('group',{name:'Sort flights',exact:true});
  const selectedSort=sorts.getByRole('button',{pressed:true});
  await sorts.getByRole('button',{name:'Shortest',exact:true}).click();
  await setFiltersOpen(page,true);
  await chooseFlightFilter(page,'Stops','0');
  await chooseFlightFilter(page,'Airline (any segment)','IndiGo');
  await chooseFlightFilter(page,'Departure time','MORNING');
  await page.getByRole('spinbutton',{name:'Maximum total for all travellers (₹)',exact:true}).fill('7000');
  await setFiltersOpen(page,false);await expect(cards).toHaveCount(1);
  const chips=page.getByRole('region',{name:'Active flight filters'});
  const nonstop=page.getByRole('button',{name:'Non-stop',exact:true});
  await expect(nonstop).toHaveAttribute('aria-pressed','true');
  await expect(chips.getByRole('button',{name:'Remove stops preference',exact:true})).toHaveCount(0);
  await expect(chips).toContainText('Up to ₹7,000 · all travellers');
  await expect(chips).toContainText('Morning · 05:00–11:59');
  await expect(chips.getByRole('button',{name:/^Remove /})).toHaveCount(3);
  await chips.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
  for(const button of await chips.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await testInfo.attach('active-flight-filters',{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
  const mobileFilters=page.getByRole('button',{name:/^Filters/});
  const restoreFocus=(await mobileFilters.isVisible())?mobileFilters:nonstop;
  const departureChip=chips.getByRole('button',{name:'Remove departure time filter',exact:true});
  for(const change of [
    {name:'Remove budget filter',count:2,nextFocus:departureChip},
    {name:'Remove airline filter IndiGo',count:3,nextFocus:departureChip},
    {name:'Remove departure time filter',count:4,nextFocus:restoreFocus},
  ]) {
    await chips.getByRole('button',{name:change.name,exact:true}).press('Enter');
    await expect(page.getByRole('button',{name:change.name,exact:true})).toHaveCount(0);
    await expect(cards).toHaveCount(change.count);
    await expect(selectedSort).toHaveAccessibleName('Shortest');
    await expect(change.nextFocus).toBeFocused();
  }
  await nonstop.press('Enter');
  await expect(nonstop).toHaveAttribute('aria-pressed','false');
  await expect(cards).toHaveCount(5);
  await expect(chips.getByRole('button',{name:/^Remove /})).toHaveCount(0);
  await setFiltersOpen(page,true);
  await chooseFlightFilter(page,'Airline (any segment)','IndiGo');
  await chooseFlightFilter(page,'Departure time','EVENING');
  await setFiltersOpen(page,false);await expect(cards).toHaveCount(1);
  await nonstop.press('Enter');
  await expect(nonstop).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Clear all filters',exact:true}).press('Enter');
  await expect(cards).toHaveCount(5);
  await expect(nonstop).toHaveAttribute('aria-pressed','false');
  await expect(chips.getByRole('button',{name:/^Remove /})).toHaveCount(0);
  await expect(restoreFocus).toBeFocused();
  await expect(selectedSort).toHaveCount(1);
  await expect(selectedSort).toHaveAccessibleName('Shortest');
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('departure windows and connection airports combine within each facet and narrow results together',async({page,provider})=>{
  function connection(id:string,hour:string,airport:{code:string;city:string}):Flight {
    const item=option(id,hour,500000);
    const first=item.sI[0];
    item.sI=[{...first,aa:airport},{...first,da:airport,dt:`${departure}T${Number(hour)+3}:15:00`,at:`${departure}T${Number(hour)+4}:25:00`}];
    return item;
  }
  provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[
    option('direct','09',600000),
    connection('amd-morning','07',{code:'AMD',city:'Ahmedabad'}),
    connection('amd-afternoon','13',{code:'AMD',city:'Ahmedabad'}),
    connection('hyd-evening','18',{code:'HYD',city:'Hyderabad'}),
  ]}}}};
  await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
  const cards=page.locator('.flight-shopping-list .live-flight-card');await expect(cards).toHaveCount(4);
  await setFiltersOpen(page,true);
  await chooseFlightFilter(page,'Departure time','MORNING');
  await chooseFlightFilter(page,'Departure time','EVENING');
  await expect(cards).toHaveCount(3);
  await page.getByRole('button',{name:'Connect via Ahmedabad (AMD)',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button',{name:'Connect via Hyderabad (HYD)',exact:true}).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button',{name:'Only Ahmedabad (AMD)',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button',{name:'Connect via Hyderabad (HYD)',exact:true}).click();
  await setFiltersOpen(page,false);
  await expect(cards).toHaveCount(2);
  const chips=page.getByRole('region',{name:'Active flight filters'});
  await chips.getByRole('button',{name:'Remove departure time filter: Evening',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await chips.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await expect(cards).toHaveCount(4);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('airline facets count itineraries, combine carriers and limit the results with Only',async({page,provider},info)=>{
  const mobile=info.project.name.includes('mobile');
  if(mobile)await page.setViewportSize({width:374,height:844});
  const direct=option('indigo-direct','05',600000);
  const connecting=option('indigo-connecting','08',750000);
  const stop={code:'AMD',city:'Ahmedabad'};
  const first=connecting.sI[0];
  connecting.sI=[{...first,aa:stop},{...first,da:stop,dt:`${departure}T11:15:00`,at:`${departure}T13:25:00`}];
  const airIndia=option('air-india','09',650000,'Air India');
  const spiceJet=option('spicejet','11',800000,'SpiceJet');
  spiceJet.totalPriceList[0].customerEstimateMinor=undefined;
  provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[direct,connecting,airIndia,spiceJet]}}}};
  await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
  const cards=page.locator('.flight-shopping-list .live-flight-card');
  await expect(cards).toHaveCount(4);
  const summary=page.locator('.flight-filter-action-row');
  await expect(summary.getByRole('status')).toHaveText('Showing 1–4 of 4 flights');
  await expect(page.locator('.flight-dock-sort')).toHaveCount(0);
  if(mobile){
    const trigger=summary.getByRole('button',{name:'Filters',exact:true});
    await expect(trigger).toBeVisible();
    const offset=await trigger.evaluate(node=>{
      const row=node.closest('.flight-filter-action-row');
      const count=row?.querySelector('[role=status]')?.getBoundingClientRect();
      const button=node.getBoundingClientRect();
      return count?Math.abs(count.top+count.height/2-button.top-button.height/2):Infinity;
    });
    expect(offset).toBeLessThan(3);
  }
  await expectNoHorizontalOverflow(page);
  const capture=(name:string)=>page.screenshot({path:info.outputPath(`${name}-${mobile?'374':'1440'}.png`),animations:'disabled'});
  await capture('filter-results');
  await setFiltersOpen(page,true);
  const indigo=page.getByRole('button',{name:'Filter by IndiGo',exact:true});
  await expect(indigo).toHaveAccessibleDescription('2 flights Estimated minimum ₹6,000');
  await expect(page.getByRole('button',{name:'Filter by SpiceJet',exact:true})).toHaveAccessibleDescription('1 flight');
  await indigo.click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button',{name:'Filter by Air India',exact:true}).click();
  await expect(cards).toHaveCount(3);
  await capture('carrier-filters-checked');
  await page.getByRole('button',{name:'Only Air India',exact:true}).click();
  await expect(indigo).toHaveAttribute('aria-pressed','false');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('.airline-identity')).toContainText('Air India');
  await capture('carrier-filters-only');
  await setFiltersOpen(page,false);
  await page.getByRole('button',{name:'Remove airline filter Air India',exact:true}).click();
  await expect(cards).toHaveCount(4);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('alliance filters combine verified alliance itineraries and support Only, remove and reset',async({page,provider})=>{
  function marketed(id:string,carrier:string,code:string,hour:string):Flight {
    const item=option(id,hour,600000,carrier);
    item.sI[0].fD.aI.code=code;
    return item;
  }
  function connecting(id:string,second:Flight['sI'][number]['fD']['aI']):Flight {
    const item=marketed(id,'Air India','AI','08');
    const first=item.sI[0];
    const stop={code:'AMD',city:'Ahmedabad'};
    item.sI=[{...first,aa:stop},{...first,da:stop,dt:`${departure}T11:15:00`,at:`${departure}T13:25:00`,fD:{aI:second,fN:'202'}}];
    return item;
  }
  provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[
    marketed('star-direct','Air India','AI','06'),
    connecting('star-connection',{name:'Lufthansa',code:'LH'}),
    marketed('world-direct','Qatar Airways','QR','09'),
    marketed('sky-direct','Air France','AF','11'),
    connecting('mixed-connection',{name:'Air France',code:'AF'}),
    option('unknown','13',600000,'Lufthansa'),
  ]}}}};
  await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
  const cards=page.locator('.flight-shopping-list .live-flight-card');
  const chips=page.getByRole('region',{name:'Active flight filters'});
  await expect(cards).toHaveCount(6);
  await setFiltersOpen(page,true);
  const star=page.getByRole('button',{name:'Filter by Star Alliance',exact:true});
  const world=page.getByRole('button',{name:'Filter by oneworld',exact:true});
  const sky=page.getByRole('button',{name:'Filter by SkyTeam',exact:true});
  await expect(star).toHaveAccessibleDescription('2 flights');
  await expect(world).toHaveAccessibleDescription('1 flight');
  await expect(sky).toHaveAccessibleDescription('1 flight');
  await star.click();
  await expect(cards).toHaveCount(2);
  await world.click();
  await expect(cards).toHaveCount(3);
  await setFiltersOpen(page,false);
  await chips.getByRole('button',{name:'Remove alliance filter Star Alliance',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('.airline-identity')).toContainText('Qatar Airways');
  await setFiltersOpen(page,true);
  await page.getByRole('button',{name:'Only SkyTeam',exact:true}).click();
  await expect(world).toHaveAttribute('aria-pressed','false');
  await expect(sky).toHaveAttribute('aria-pressed','true');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('.airline-identity')).toContainText('Air France');
  await page.getByRole('button',{name:'Reset flight filters',exact:true}).click();
  await setFiltersOpen(page,false);
  await expect(cards).toHaveCount(6);
  await expect(chips).toHaveCount(0);
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
});
