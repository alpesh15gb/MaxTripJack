import { test, expect, departure, returning, expectNoHorizontalOverflow, pickHomeDate, setHomeTravellers } from './fixtures';

test('a featured destination opens a stay search with the selected hotel dates and party', async ({page, provider}) => {
  await page.goto('/');
  const planner = page.getByRole('region', {name:'Plan your trip'});
  await planner.getByRole('button', {name:'Hotels', exact:true}).click();
  await pickHomeDate(planner, 'Check-in', departure);
  await pickHomeDate(planner, 'Check-out', returning);
  await setHomeTravellers(planner, {adults:2});
  await page.getByRole('group', {name:'Preview a destination'}).getByRole('button', {name:'Dubai'}).click();
  await page.getByRole('link', {name:'Find stays in Dubai'}).click();
  await page.waitForURL(url => url.pathname === '/book');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({product:'HOTEL',city:'Dubai',date:departure,end:returning,adults:'2'});
  await expect(page.getByRole('combobox', {name:'Destination',exact:true})).toHaveValue('Dubai');
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
});

for (const width of [320, 768]) {
  test(`homepage airport names and codes fit at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/');
    const form = page.locator('.home-search-form');
    await expect(form.getByLabel('From airport', {exact: true})).toHaveValue('Mumbai (BOM)');
    await expect(form.getByLabel('To airport', {exact: true})).toHaveValue('New Delhi (DEL)');
    const clippedAirports = () => form.locator('.home-airports input:not([type="hidden"])').evaluateAll(async fields => {
      await document.fonts.ready;
      const canvas = document.createElement('canvas').getContext('2d')!;
      return fields.filter(field => {
        const input = field as HTMLInputElement;
        const style = getComputedStyle(input);
        canvas.font = style.font;
        const width = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return canvas.measureText(input.value).width > width;
      }).map(field => (field as HTMLInputElement).value);
    });
    expect(await clippedAirports()).toEqual([]);
    await form.getByRole('radio', {name: 'Round trip'}).check();
    expect(await clippedAirports()).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await form.getByRole('button', {name: 'Swap departure and arrival airports'}).click();
    await expect(form.getByLabel('From airport', {exact: true})).toHaveValue('New Delhi (DEL)');
    await expect(form.getByLabel('To airport', {exact: true})).toHaveValue('Mumbai (BOM)');
    expect(await clippedAirports()).toEqual([]);
  });
}

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

test('switching travel products preserves each homepage search draft', async ({page, provider}) => {
  await page.goto('/');
  const planner = page.getByRole('region', {name: 'Plan your trip'});
  const form = planner.locator('form');
  await form.getByLabel('To airport', {exact: true}).fill('Hyderabad (HYD)');
  await form.getByRole('radio', {name: 'Round trip'}).check();
  await pickHomeDate(form, 'Departure', departure);
  await pickHomeDate(form, 'Return', returning);
  await setHomeTravellers(form, {adults: 5, children: 1, cabin: 'Business'});
  const hotels = planner.getByRole('button', {name: 'Hotels', exact: true});
  const flights = planner.getByRole('button', {name: 'Flights', exact: true});
  await hotels.click();
  await expect(form.locator('.travellers-trigger')).toContainText('1 Adult');
  await form.getByLabel('Destination', {exact: true}).fill('Goa');
  await form.getByRole('option', {name: 'Goa, India', exact: true}).click();
  await pickHomeDate(form, 'Check-in', returning);
  await setHomeTravellers(form, {adults: 2});
  const hotelEnd = await form.locator('input[name="end"]').inputValue();
  await flights.click();
  await expect(form.getByLabel('From airport', {exact: true})).toHaveValue('Mumbai (BOM)');
  await expect(form.getByLabel('To airport', {exact: true})).toHaveValue('Hyderabad (HYD)');
  await expect(form.locator('input[name="date"]')).toHaveValue(departure);
  await expect(form.locator('input[name="end"]')).toHaveValue(returning);
  await expect(form.locator('.travellers-trigger')).toContainText('6 Travellers');
  await expect(form.locator('.home-guests')).toContainText('Business');
  await hotels.click();
  await expect(form.getByLabel('Destination', {exact: true})).toHaveValue('Goa, India');
  await expect(form.locator('input[name="date"]')).toHaveValue(returning);
  await expect(form.locator('input[name="end"]')).toHaveValue(hotelEnd);
  await expect(form.locator('.travellers-trigger')).toContainText('2 Adults');
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('homepage hotel validation guides customers to the destination field', async ({page}) => {
  await page.goto('/');
  const planner = page.getByRole('region', {name: 'Plan your trip'});
  await planner.getByRole('button', {name: 'Hotels', exact: true}).click();
  await planner.getByRole('button', {name: 'Search stays', exact: true}).click();
  const destination = planner.getByLabel('Destination', {exact: true});
  await expect(planner.getByRole('alert')).toContainText('Choose a destination');
  await expect(destination).toBeFocused();
  await destination.fill('Goa');
  await expect(planner.getByRole('alert')).toHaveCount(0);
});

for (const entry of [
  { product: 'flight', path: '/', label: 'To airport', value: 'Hyderabad (HYD)' },
  { product: 'hotel', path: '/book?product=HOTEL', label: 'Destination', value: 'Goa' },
]) {
  test(`${entry.product} search input waits for hydration before accepting edits`, async ({page}) => {
    let unblock!: () => void;
    const scriptsReady = new Promise<void>(resolve => { unblock = resolve; });
    await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async route => {
      await scriptsReady;
      await route.continue();
    });
    try {
      await page.goto(entry.path, {waitUntil: 'commit'});
      const field = page.getByLabel(entry.label, {exact: true});
      if (entry.product === 'flight') {
        await expect(field).toBeDisabled();
      } else {
        await expect(page.getByRole('heading', {name: 'Getting your journey ready…'})).toBeVisible();
        await expect(field).toHaveCount(0);
      }
      unblock();
      await expect(field).toBeEnabled();
      await field.fill(entry.value);
      await expect(field).toHaveValue(entry.value);
    } finally {
      unblock();
    }
  });
}
