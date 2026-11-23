import {test,expect,capture,departure,returning,pickHomeDate,expectNoHorizontalOverflow} from './fixtures';

test('search pickers use mobile sheets and the desktop calendar blocks the background', async ({page}, info) => {
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 const mobile = info.project.name === 'mobile-390';
 for (const field of ['.fare-date-trigger', '.travellers-trigger']) {
  const trigger = page.locator(field).first();
  await trigger.click();
  const panel = page.locator('dialog.search-picker-dialog[open]');
  await expect(panel).toBeVisible();
  const modal = mobile || field === '.fare-date-trigger';
  expect(await panel.evaluate(node => node.matches(':modal'))).toBe(modal);
  if (mobile) {
   const bounds = await panel.boundingBox();
   expect(bounds!.x).toBe(0);
   expect(bounds!.y + bounds!.height).toBeCloseTo(page.viewportSize()!.height,0);
   await expect(panel).toHaveCSS('animation-name','none');
  }
  if (modal) {
   await page.locator('.home-search-submit').evaluate(node => (node as HTMLElement).focus());
   expect(await panel.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await panel.getByRole('button',{name:/^Close /}).click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectNoHorizontalOverflow(page);
 }
});

test('date picker Escape closes from month navigation and restores the field',async({page,provider},testInfo)=>{
 await page.goto('/');
 const field=page.getByRole('button',{name:/^Departure /});await field.click();
 const calendar=page.getByRole('dialog',{name:'Choose departure',exact:true});await expect(calendar).toBeVisible();
 await calendar.getByRole('button',{name:'Next month',exact:true}).focus();
 await capture(page,testInfo,'departure-calendar');await expectNoHorizontalOverflow(page);
 await page.keyboard.press('Escape');await expect(calendar).toBeHidden();await expect(field).toBeFocused();
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('flight travellers, cabin class and Done are in view immediately after opening', async ({page}, info) => {
  if (info.project.name === 'desktop-1440') await page.setViewportSize({width:1440, height:768});
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const trigger = page.getByRole('button', {name:/^Travellers & class/});
  await trigger.click();
  const panel = page.getByRole('dialog', {name:'Travellers and cabin class'});
  await expect(panel).toBeVisible();
  await panel.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  // Locator.click() would scroll clipped controls into view and mask the regression.
  for (const control of [
    panel.getByRole('button', {name:'More adults'}),
    panel.getByText('Business', {exact:true}),
    panel.getByRole('button', {name:'Done'}),
  ]) await expect(control).toBeInViewport({ratio:0.99});
  await panel.getByRole('button', {name:'More adults'}).click();
  await panel.getByRole('button', {name:'Done'}).click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText('2 Travellers');
});

test('Done on hotel guests brings the labelled search row and submit button back into view', async ({page}, info) => {
  if (info.project.name === 'desktop-1440') await page.setViewportSize({width:1440, height:900});
  if (info.project.name === 'mobile-390') await page.setViewportSize({width:390, height:600});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const planner = page.getByRole('region', {name:'Plan your trip'});
  await planner.getByRole('button', {name:'Hotels', exact:true}).click();
  await planner.getByLabel('Destination', {exact:true}).fill('Goa');
  await planner.getByRole('option', {name:'Goa, India', exact:true}).click();
  await pickHomeDate(planner, 'Check-in', departure);
  await pickHomeDate(planner, 'Check-out', returning);
  const guests = planner.getByRole('button', {name:/^Guests /});
  const search = planner.getByRole('button', {name:'Search stays'});
  if (info.project.name === 'mobile-390') {
    // A traveller can open Guests while its trigger is just above the fold and Search is below it.
    await guests.evaluate(field => window.scrollBy({top:field.getBoundingClientRect().bottom - innerHeight + 8, behavior:'instant'}));
    await expect(guests).toBeInViewport({ratio:0.99});
    await expect(search).not.toBeInViewport({ratio:0.99});
  }
  await guests.click();
  const panel = planner.getByRole('dialog', {name:'Guests', exact:true});
  await expect(panel).toBeInViewport({ratio:0.99});
  await panel.getByRole('button', {name:'More adults'}).click();
  await panel.getByRole('button', {name:'Done'}).click();
  await expect(panel).toHaveCount(0);
  await expect(guests).toBeFocused();
  await expect(guests).toContainText('2 Adults');
  await expect(planner.locator('.home-search-fields')).toBeInViewport({ratio:0.99});
  await expect(search).toBeInViewport({ratio:0.99});
  await expect.poll(() => search.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })).toBe(true);

  if (info.project.name === 'desktop-1440') {
    // At tablet width Guests wraps onto the left of a second row.
    await page.setViewportSize({width:1024, height:800});
    await guests.click();
    await expect(panel).toBeInViewport({ratio:0.99});
    await panel.getByRole('button', {name:'Done'}).click();
    await expect(guests).toBeFocused();
  }
});

test('date picker month navigation retains a keyboard-selectable day',async({page,provider})=>{
 await page.goto('/');
 await page.getByRole('button',{name:/^Departure /}).click();
 const calendar=page.getByRole('dialog',{name:'Choose departure',exact:true});
 await calendar.getByRole('button',{name:'Next month',exact:true}).click();
 await calendar.getByRole('button',{name:'Next month',exact:true}).click();
 const day=calendar.locator('[role="gridcell"][tabindex="0"]');await expect(day).toHaveCount(1);
 await expect(day).toBeFocused();const selectedDate=await day.getAttribute('data-date');
 await page.keyboard.press('Enter');await expect(calendar).toBeHidden();
 await expect(page.locator('input[type="hidden"][name="date"]')).toHaveValue(selectedDate!);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
