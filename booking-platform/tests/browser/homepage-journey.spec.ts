import { test, expect, departure, expectNoHorizontalOverflow } from './fixtures';

test('family can choose cabin on homepage without losing search context', async ({page, provider}) => {
  await page.goto('/');
  const form=page.locator('.home-search-form');
  await form.getByLabel('Departure',{exact:true}).fill(departure);
  await form.getByRole('combobox',{name:'Travellers',exact:true}).selectOption('2');
  await form.locator('.home-party-options summary').click();
  await form.getByLabel('Children · age 2–11',{exact:true}).selectOption('1');
  await form.getByLabel('Infants · under 2',{exact:true}).selectOption('1');
  await form.getByLabel('Cabin',{exact:true}).selectOption('BUSINESS');
  await expectNoHorizontalOverflow(page);
  await form.getByRole('button',{name:'Search flights',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/book');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({adults:'2',children:'1',infants:'1',cabin:'BUSINESS',date:departure});
  await expect(page.getByText('IndiGo',{exact:true})).toBeVisible();
  expect(provider.requests('/api/travel/search')[0].body).toMatchObject({adults:2,children:1,infants:1,cabin:'BUSINESS'});
});

test('advanced search retains entered airports dates and party without automatic supplier call',async({page,provider})=>{
  await page.goto('/');
  const form=page.locator('.home-search-form');
  await form.getByLabel('From airport',{exact:true}).fill('HYD');
  await form.getByLabel('To airport',{exact:true}).fill('DXB');
  await form.getByLabel('Departure',{exact:true}).fill(departure);
  await form.getByRole('combobox',{name:'Travellers',exact:true}).selectOption('2');
  await form.getByRole('button',{name:'More search options',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/book');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({from:'HYD',to:'DXB',adults:'2',date:departure});
  expect(new URL(page.url()).searchParams.has('autoSearch')).toBe(false);
  await expect(page.getByLabel('From airport',{exact:true})).toHaveValue('HYD');
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
});
