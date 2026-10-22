import {test,expect,capture,expectNoHorizontalOverflow,openFlightSearch} from './fixtures';

test('journey studio home keeps a usable search dock beside editorial inspiration',async({page,provider},testInfo)=>{
 await page.goto('/');await expect(page.getByRole('heading',{level:1})).toHaveText('A great trip starts with a clear plan.');
 await expect(page.locator('.studio-hero-photo img')).toBeVisible();await expect(page.getByRole('region',{name:'Plan your trip'})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 const geometry=await page.locator('#trip-search').evaluate(node=>{const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom,viewport:innerHeight,width:innerWidth};});
 expect(geometry.top).toBeLessThan(600);
 const search=page.getByRole('button',{name:'Search flights',exact:true});const target=await search.boundingBox();expect(target?.height).toBeGreaterThanOrEqual(44);expect((target?.y||0)+(target?.height||0)).toBeLessThanOrEqual(geometry.viewport*(geometry.width<700?1.3:1));
 for(const label of ['Flights','Hotels','Packages','My trips']){const item=page.getByRole('navigation',{name:'Main navigation'}).getByRole(label==='Flights'||label==='Hotels'?'button':'link',{name:label,exact:true});await expect(item).toBeVisible();const bounds=await item.boundingBox();expect(bounds?.x).toBeGreaterThanOrEqual(0);expect((bounds?.x||0)+(bounds?.width||0)).toBeLessThanOrEqual(geometry.width);}
 await testInfo.attach('studio-home-viewport-geometry',{body:JSON.stringify(geometry),contentType:'application/json'});
 await testInfo.attach('studio home viewport',{body:await page.screenshot({fullPage:false,animations:'disabled'}),contentType:'image/png'});await capture(page,testInfo,'studio-home-full');await expectNoHorizontalOverflow(page);
 await expect(page.locator('.studio-concierge-band')).toHaveCount(1);await expect(page.locator('.studio-concierge-band')).toContainText('9:00 am–9:00 pm');
 await page.locator('.travel-footer').scrollIntoViewIfNeeded();for(const heading of await page.locator('.travel-footer h2').all())await expect(heading).toHaveCSS('color','rgb(255, 255, 255)');
 await capture(page,testInfo,'studio-footer');
 if(testInfo.project.name==='mobile-390'){await page.setViewportSize({width:320,height:844});await page.evaluate(()=>scrollTo(0,0));await expectNoHorizontalOverflow(page);const dateBox=await page.getByLabel('Departure',{exact:true}).boundingBox();expect(dateBox?.width).toBeGreaterThanOrEqual(220);for(const code of ['BOM','DEL']){const badge=page.locator('.airport-code-badge').filter({hasText:code});await expect(badge).toBeVisible();const box=await badge.boundingBox();expect(box?.x).toBeGreaterThanOrEqual(0);expect((box?.x||0)+(box?.width||0)).toBeLessThanOrEqual(320);}await testInfo.attach('studio narrow320 viewport',{body:await page.screenshot({fullPage:false,animations:'disabled'}),contentType:'image/png'});}
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
});

test('journey studio results and reviewed receipt share contrast and clear totals',async({page,provider},testInfo)=>{
 await openFlightSearch(page);const summary=page.locator('#booking-search>summary');await expect(summary).toHaveCSS('color','rgb(255, 255, 255)');await expect(summary).toHaveCSS('background-color','rgb(20, 45, 64)');await expect(summary.locator('.search-edit-label')).toHaveCSS('color','rgb(219, 230, 249)');
 await summary.focus();await expect(summary).toHaveCSS('background-color','rgb(20, 45, 64)');await summary.hover();await expect(summary).toHaveCSS('background-color','rgb(20, 45, 64)');await summary.click();await expect(page.locator('#booking-search')).toHaveAttribute('open','');await expect(summary).not.toHaveCSS('color','rgb(255, 255, 255)');await summary.click();await expect(summary).toHaveCSS('background-color','rgb(20, 45, 64)');await capture(page,testInfo,'studio-flight-results');await expectNoHorizontalOverflow(page);
 await page.locator('.fare-comparison>summary').first().click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 await expect(summary).toHaveCSS('background-color','rgb(20, 45, 64)');await expect(summary).toHaveCSS('color','rgb(255, 255, 255)');
 const receipt=page.getByRole('complementary',{name:'Your journey summary'});await expect(receipt).toContainText('₹6,540');await capture(page,testInfo,'studio-traveller-review');
 const form=page.getByRole('form',{name:'Review and travellers'});await form.getByLabel('First name',{exact:true}).fill('Aarav');await form.getByLabel('Last name',{exact:true}).fill('Example');await form.getByLabel('Email',{exact:true}).fill('traveller@example.test');await form.getByLabel('Indian mobile number',{exact:true}).fill('9876543210');await page.getByRole('button',{name:'Review booking',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();await expect(summary).toHaveCSS('background-color','rgb(20, 45, 64)');await expect(summary.locator('.search-edit-label')).toHaveCSS('color','rgb(219, 230, 249)');await capture(page,testInfo,'studio-final-review');await expectNoHorizontalOverflow(page);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('hero captions retain contrast over bright imagery at every supported width',async({page},testInfo)=>{
 await page.goto('/');await page.evaluate(()=>document.fonts.ready);
 const widths=testInfo.project.name==='mobile-390'?[390,320]:[1440];
 for(const width of widths){
  await page.setViewportSize({width,height:width<700?844:1000});
  const photo=page.locator('.studio-hero-photo');await expect(photo.locator('img')).toBeVisible();
  await expect.poll(()=>photo.locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const measurements=await photo.evaluate(node=>{
   const rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number);
   const luminance=(values:number[])=>values.slice(0,3).map(v=>{const n=v/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
   const bounds=node.getBoundingClientRect();return [...node.querySelectorAll(':scope>span,.studio-photo-note')].filter(item=>getComputedStyle(item).display!=='none').map(item=>{
    const style=getComputedStyle(item),foreground=rgb(style.color),background=rgb(style.backgroundColor),alpha=background[3]??1;
    // White is the brightest possible photograph backing; no pixel colour is assumed.
    const composite=background.slice(0,3).map(value=>alpha*value+(1-alpha)*255),fg=luminance(foreground),bg=luminance(composite),r=item.getBoundingClientRect();
    return {text:item.textContent,foreground,background,opacity:style.opacity,fontSize:parseFloat(style.fontSize),contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),inside:r.left>=bounds.left&&r.right<=bounds.right&&r.top>=bounds.top&&r.bottom<=bounds.bottom};
   });
  });
  expect(measurements.length).toBe(width<700?1:2);
  for(const item of measurements){expect(item.foreground).toEqual([255,255,255]);expect(item.opacity).toBe('1');expect(item.contrast).toBeGreaterThanOrEqual(4.5);expect(item.fontSize).toBeGreaterThanOrEqual(12);expect(item.inside).toBe(true);}
  await testInfo.attach(`hero contrast measurements ${width}`,{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
  await testInfo.attach(`hero local caption contrast ${width}`,{body:await photo.screenshot({animations:'disabled'}),contentType:'image/png'});
 }
});
