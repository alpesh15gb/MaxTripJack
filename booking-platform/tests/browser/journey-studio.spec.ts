import {test,expect,capture,expectNoHorizontalOverflow,openFlightSearch} from './fixtures';

test('the booking planner and destination cards keep searches accessible',async({page,provider},testInfo)=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Find your next escape.');
  const planner=page.getByRole('region',{name:'Plan your trip'});
  await expect(planner).toHaveCSS('background-color','rgb(255, 255, 255)');
  const submit=planner.getByRole('button',{name:'Search flights',exact:true});
  await expect(submit).toHaveCSS('background-color','rgb(0, 23, 54)');
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
 const summary=page.locator('#booking-search>summary');
 const compact=(page.viewportSize()?.width??1440)<=700;
 const edit=compact?page.getByRole('button',{name:'Edit search',exact:true}):summary;
 await expect(edit).toBeVisible();
 if(!compact){await expect(summary).toHaveCSS('background-color','rgb(0, 23, 54)');await expect(summary.locator('.search-edit-label')).toHaveCSS('color','rgb(255, 255, 255)');}
 await edit.focus();await expect(edit).toBeFocused();await edit.click();
 await expect(page.getByRole('form',{name:'Search availability',exact:true})).toBeVisible();
 await summary.click();await expect(edit).toBeVisible();
 await capture(page,testInfo,'studio-flight-results');await expectNoHorizontalOverflow(page);
 await page.locator('.fare-comparison>summary').first().click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 await expect(summary).toBeHidden();
 const receipt=page.getByRole('complementary',{name:'Your journey summary'});await expect(receipt).toContainText('₹6,540');await capture(page,testInfo,'studio-traveller-review');
 const form=page.getByRole('form',{name:'Review and travellers'});await form.getByLabel('First name',{exact:true}).fill('Aarav');await form.getByLabel('Last name',{exact:true}).fill('Example');await form.getByLabel('Email',{exact:true}).fill('traveller@example.test');await form.getByLabel('Mobile number',{exact:true}).fill('9876543210');
 await expect(receipt.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();await expect(receipt.locator('.final-traveller-summary')).toContainText('traveller@example.test');await expect(form.getByLabel('First name',{exact:true})).toBeVisible();await expect(summary).toBeHidden();await capture(page,testInfo,'studio-final-review');await expectNoHorizontalOverflow(page);expect(provider.requests('/api/payments/create')).toHaveLength(0);
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
