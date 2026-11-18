import { test, expect, departure, expectNoHorizontalOverflow, pickHomeDate, setHomeTravellers } from './fixtures';

test('family can choose cabin on homepage without losing search context', async ({page, provider}) => {
  await page.goto('/');
  const form=page.locator('.home-search-form');
  await pickHomeDate(form,'Departure',departure);
  // Children, infants and cabin are inside the Travellers & class field, after the dates.
  await setHomeTravellers(form,{adults:2,children:1,infants:1,cabin:'Business'});
  await expect(form.locator('.travellers-trigger')).toContainText('4 Travellers');
  await expectNoHorizontalOverflow(page);
  await form.getByRole('button',{name:'Search flights',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/book');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({adults:'2',children:'1',infants:'1',cabin:'BUSINESS',date:departure});
  await expect(page.locator('.airline-identity').getByText('IndiGo',{exact:true})).toBeVisible();
  expect(provider.requests('/api/travel/search')[0].body).toMatchObject({adults:2,children:1,infants:1,cabin:'BUSINESS'});
});

test('advanced search retains entered airports dates and party without automatic supplier call',async({page,provider})=>{
  await page.goto('/');
  const form=page.locator('.home-search-form');
  await form.getByLabel('From airport',{exact:true}).fill('HYD');
  await form.getByLabel('To airport',{exact:true}).fill('DXB');
  await pickHomeDate(form,'Departure',departure);
  await setHomeTravellers(form,{adults:2});
  await form.getByRole('button',{name:'More search options',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/book');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({from:'HYD',to:'DXB',adults:'2',date:departure});
  expect(new URL(page.url()).searchParams.has('autoSearch')).toBe(false);
  await expect(page.getByLabel('From airport',{exact:true})).toHaveValue('HYD');
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
});
