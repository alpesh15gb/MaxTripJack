import {test,expect,flight,departure,searchId,expectNoHorizontalOverflow} from './fixtures';
import type {Page} from '@playwright/test';
import type {Flight} from '../../src/lib/booking-presentation';

async function setFiltersOpen(page:Page,open:boolean) {
  const dialog=page.getByRole('dialog',{name:'Filter flights',exact:true});
  if(!open){if(await dialog.isVisible())await dialog.getByRole('button',{name:'Close filters',exact:true}).click();return;}
  const trigger=page.getByRole('button',{name:/^Filters/});if(await trigger.isVisible())await trigger.click();
}
function option(id:string,hour:string,amount:number,carrier='IndiGo',duration=130):Flight {
  const item:Flight=flight('ONWARD',id);
  item.sI[0]={...item.sI[0],dt:`${departure}T${hour}:15:00`,at:`${departure}T${Number(hour)+2}:25:00`,duration,fD:{aI:{name:carrier},fN:id}};
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
  await sorts.getByRole('button',{name:'Fastest',exact:true}).click();
  await setFiltersOpen(page,true);
  await page.getByRole('combobox',{name:'Stops',exact:true}).selectOption('0');
  await page.getByRole('combobox',{name:'Airline (any segment)',exact:true}).selectOption('IndiGo');
  await page.getByRole('combobox',{name:'Departure time',exact:true}).selectOption('MORNING');
  await page.getByRole('spinbutton',{name:'Maximum total for all travellers (₹)',exact:true}).fill('7000');
  await setFiltersOpen(page,false);await expect(cards).toHaveCount(1);
  const chips=page.getByRole('region',{name:'Active flight filters'});
  const nonstop=page.getByRole('button',{name:'Non-stop',exact:true});
  await expect(nonstop).toHaveAttribute('aria-pressed','true');
  await expect(chips.getByRole('button',{name:'Remove stops preference',exact:true})).toHaveCount(0);
  await expect(chips).toContainText('Up to ₹7,000 · all travellers');
  await expect(chips).toContainText('Morning · 06:00–11:59');
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
    await expect(selectedSort).toHaveAccessibleName('Fastest');
    await expect(change.nextFocus).toBeFocused();
  }
  await nonstop.click();
  await expect(nonstop).toHaveAttribute('aria-pressed','false');
  await expect(cards).toHaveCount(5);
  await expect(chips.getByRole('button',{name:/^Remove /})).toHaveCount(0);
  await setFiltersOpen(page,true);
  await page.getByRole('combobox',{name:'Airline (any segment)',exact:true}).selectOption('IndiGo');
  await page.getByRole('combobox',{name:'Departure time',exact:true}).selectOption('EVENING');
  await setFiltersOpen(page,false);await expect(cards).toHaveCount(1);
  await nonstop.click();
  await expect(nonstop).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Clear all filters',exact:true}).press('Enter');
  await expect(cards).toHaveCount(5);
  await expect(nonstop).toHaveAttribute('aria-pressed','false');
  await expect(chips.getByRole('button',{name:/^Remove /})).toHaveCount(0);
  await expect(restoreFocus).toBeFocused();
  await expect(selectedSort).toHaveCount(1);
  await expect(selectedSort).toHaveAccessibleName('Fastest');
  expect(provider.requests('/api/travel/search')).toHaveLength(1);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
