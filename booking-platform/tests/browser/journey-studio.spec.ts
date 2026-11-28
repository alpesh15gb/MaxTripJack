import {test,expect,capture,expectNoHorizontalOverflow,openFlightSearch,continueToTravellerDetails} from './fixtures';

test('the booking planner and destination cards keep searches accessible',async({page,provider},testInfo)=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Travel Made Simple');
  const planner=page.getByRole('region',{name:'Plan your trip'});
  await expect(planner.getByRole('button',{name:'Stays',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(planner).toHaveCSS('background-color','rgb(255, 255, 255)');
  await planner.getByRole('button',{name:'Flights',exact:true}).click();
  const submit=planner.getByRole('button',{name:'Search flights',exact:true});
  await expect(submit).toHaveCSS('background-color','rgb(169, 73, 36)');
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if((page.viewportSize()?.width??1440)<=700)await page.getByText('Travel planning guides and directories',{exact:true}).click();
  const hubs=page.getByRole('group',{name:'Preview a destination'});
  await hubs.getByRole('button',{name:'Dubai'}).click();
  await expect(hubs.getByRole('link',{name:'Find stays in Dubai'})).toHaveAttribute('href',/product=HOTEL&city=Dubai/);
  await expect(page.getByRole('link',{name:'Explore stays in Dubai'})).toHaveAttribute('href',/product=HOTEL&city=Dubai/);
  await expect(page.locator('.studio-concierge-band')).toContainText('09:00 - 21:00');
  await page.locator('#trip-search').scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page);
  await capture(page,testInfo,'stitch-home');
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('journey studio results and reviewed receipt share contrast and clear totals',async({page,provider},testInfo)=>{
 await openFlightSearch(page);
 const search=page.getByRole('form',{name:'Search availability',exact:true});
 await expect(page.getByRole('heading',{name:'Flights from Mumbai to New Delhi',exact:true})).toBeVisible();
 await expect(search).toBeVisible();
 await capture(page,testInfo,'studio-flight-results');await expectNoHorizontalOverflow(page);
 await page.locator('.fare-comparison-trigger').first().click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 await expect(search).toBeHidden();
 const receipt=page.getByRole('complementary',{name:'Your journey summary'});await expect(receipt).toContainText('₹6,540');await capture(page,testInfo,'studio-traveller-review');
 await continueToTravellerDetails(page);
 const form=page.getByRole('form',{name:'Review and travellers'});await form.getByLabel('First name',{exact:true}).fill('Aarav');await form.getByLabel('Last name',{exact:true}).fill('Example');await form.getByLabel('Email',{exact:true}).fill('traveller@example.test');await form.getByLabel('Mobile number',{exact:true}).fill('9876543210');
 await expect(receipt.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();await expect(receipt.locator('.final-traveller-summary')).toContainText('traveller@example.test');await expect(form.getByLabel('First name',{exact:true})).toBeVisible();await expect(search).toBeHidden();await capture(page,testInfo,'studio-final-review');await expectNoHorizontalOverflow(page);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('destination photos and labels stay legible at desktop and phone widths',async({page},testInfo)=>{
  await page.goto('/');
  for(const width of testInfo.project.name==='mobile-390'?[390,320]:[1440]){
    await page.setViewportSize({width,height:width<700?844:1000});
    const card=page.getByRole('link',{name:'Explore stays in Goa'}),photo=card.locator('.stitch-getaway-photo');
    await expect(photo).toHaveCSS('background-image',new RegExp(width<=700?'mobile-goa':'desktop-goa'));
    await expect(card.getByRole('heading',{name:'Goa'})).toHaveCSS('color','rgb(255, 255, 255)');
    const fits=await card.evaluate(node=>{
      const parent=node.getBoundingClientRect();
      return [...node.querySelectorAll('h3,p,.stitch-getaway-tag')].every(item=>{
        const r=item.getBoundingClientRect();return r.left>=parent.left&&r.right<=parent.right&&r.top>=parent.top&&r.bottom<=parent.bottom;
      });
    });
    expect(fits).toBe(true);
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`Destination card ${width}`,{body:await card.screenshot({animations:'disabled'}),contentType:'image/png'});
  }
});

test('destination themes and recent searches keep their normal navigation', async ({page, provider}) => {
  await page.goto('/');
  const themes = page.getByRole('group', {name: 'Filter hotel destinations'});
  await themes.getByRole('button', {name: 'City breaks'}).click();
  await expect(page.getByRole('link', {name: 'Explore stays in Goa'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Explore stays in Paris'})).toBeVisible();
  await themes.getByRole('button', {name: 'All', exact: true}).click();
  await expect(page.getByRole('link', {name: 'Explore stays in Goa'})).toBeVisible();
  const planner = page.getByRole('region', {name: 'Plan your trip'});
  await planner.getByRole('button', {name: 'Flights', exact: true}).click();
  await planner.getByRole('button', {name: 'Search flights', exact: true}).click();
  await expect(page).toHaveURL(/\/book\?.*(?:from=BOM|to=DEL)/);
  await page.goto('/');
  const recent = page.getByRole('region', {name: 'Your recent searches'});
  await expect(recent.getByRole('link', {name: 'BOM → DEL'})).toHaveAttribute('href', /autoSearch=1/);
  await recent.getByRole('button', {name: 'Clear recent searches'}).click();
  await expect(recent).toHaveCount(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
