import {toggleResultSearch, test,expect,departure,returning,searchId,syntheticSession} from './fixtures';
import {travelDateLabel} from '../../src/lib/travel-date';

const legs=[{from:'BOM',to:'DEL',date:departure},{from:'DEL',to:'GOI',date:returning}];
test('submitted multi-city shape survives refresh, but unsubmitted edits do not replace it',async({page,provider})=>{
 await page.goto('/');
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',legs:JSON.stringify(legs),adults:'2',children:'1',infants:'1',cabin:'BUSINESS'}));
 await expect(page.getByRole('combobox',{name:'Journey type'})).toHaveValue('multi-city');
 await expect(page.locator('[name="leg-date-1"]')).toHaveValue(returning);
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect.poll(()=>provider.requests('/api/travel/search').length).toBe(1);
 await expect(page.locator('#booking-results')).toBeVisible();
 const submitted=page.url();
 const searchSummary=page.locator('#booking-search > summary');
 await expect(searchSummary.locator('.booking-criteria-destination strong')).toHaveText('BOM → DEL · DEL → GOI');
 await expect(searchSummary.locator('.booking-criteria-party')).toContainText('4 travellers · Business');
 await toggleResultSearch(page);
 await page.locator('[name="leg-date-1"]').fill(departure);
 expect(page.url()).toBe(submitted);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await page.reload();
 await expect(page.locator('[name="leg-date-1"]')).toHaveValue(returning);
 await expect(page.getByRole('combobox',{name:'Journey type'})).toHaveValue('multi-city');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect.poll(()=>provider.requests('/api/travel/search').length).toBe(2);
 expect(provider.requests('/api/travel/search')[1].body).toMatchObject({legs,adults:2,children:1,infants:1,cabin:'BUSINESS'});
 await page.goBack();
 await expect(page).toHaveURL('/');
});

test('hotel occupancy survives successful submission and reload without an automatic provider call',async({page,provider})=>{
 provider.search={searchId,results:{hotels:[]}};
 const rooms=[{adults:3,childAge:[7]},{adults:1,childAge:[4,11]}];
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',city:'Goa, India',hotelIds:'10001,10002',date:departure,end:returning,rooms:JSON.stringify(rooms)}));
 await expect(page.getByRole('combobox',{name:'Rooms',exact:true})).toHaveValue('2');
 await page.getByRole('button',{name:'Search stays',exact:true}).click();
 await expect.poll(()=>provider.requests('/api/travel/search').length).toBe(1);
 await expect.poll(()=>new URL(page.url()).searchParams.get('adults')).toBe('3');
 await page.reload();
 await expect(page.getByRole('group',{name:'Room 2 · Guests',exact:true}).getByLabel('Child 2 age at check-in',{exact:true})).toHaveValue('11');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await page.getByRole('button',{name:'Search stays',exact:true}).click();
 await expect.poll(()=>provider.requests('/api/travel/search').length).toBe(2);
 expect(provider.requests('/api/travel/search')[1].body).toMatchObject({rooms:rooms.map(room=>({...room,children:room.childAge.length}))});
});

test('legacy sign-in return retains submitted multicity passengers rather than the original URL or draft',async({page,provider})=>{
 provider.session=null;
 provider.overrides['POST /api/travel/review']={status:401,body:{error:'Sign in to continue.'}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',legs:JSON.stringify(legs),date:departure,adults:'2',cabin:'BUSINESS'}));
 await page.locator('.booking-party-picker summary').click();
 await page.getByRole('combobox',{name:'Adults',exact:true}).selectOption('3');
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 await page.locator('.fare-comparison > summary').first().click();
 await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Continue with your email',exact:true})).toBeVisible();
 // Existing return links must retain the submitted search even though new
 // verification now runs inline without leaving the booking workspace.
 const target=new URL(page.url());target.searchParams.set('resumeReview','1');
 const params=target.searchParams;
 expect(params.get('adults')).toBe('3');expect(JSON.parse(params.get('legs')!)).toEqual(legs);expect(params.get('cabin')).toBe('BUSINESS');
 provider.session=syntheticSession();delete provider.overrides['POST /api/travel/review'];
 await page.goto(target.href);
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('expired and malformed deep links explain recovery without calling search',async({page,provider})=>{
 for(const query of ([{legs:'not-json'},{rooms:'[{"adults":99,"childAge":[]}]'},{date:'2020-01-01'}] as Record<string,string>[])){
  await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',autoSearch:'1',...query}));
  await expect(page.getByRole('main').getByRole('alert')).toContainText('search link is invalid or its dates have passed');
 }
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
});

test('round-trip auto-search refresh preserves the return date and searches once per navigation',async({page,provider})=>{
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,returnDate:returning,adults:'2',cabin:'FIRST',autoSearch:'1'}));
 await expect(page.locator('#booking-results')).toBeVisible();
 const searchSummary=page.locator('#booking-search > summary');
 await expect(searchSummary.locator('.booking-criteria-dates')).toContainText(`${travelDateLabel(departure)} – ${travelDateLabel(returning)}`);
 await expect(searchSummary.locator('.booking-criteria-party')).toContainText('2 travellers · First');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await page.reload();
 await expect(page.locator('#booking-results')).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(2);
 expect(provider.requests('/api/travel/search')[1].body).toMatchObject({returnDate:returning,adults:2,cabin:'FIRST'});
 await toggleResultSearch(page);
 await expect(page.getByRole('combobox',{name:'Journey type'})).toHaveValue('round-trip');
 await expect(page.locator('[name="returnDate"]')).toHaveValue(returning);
});
