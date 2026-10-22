import {test,expect,departure,returning,searchId} from './fixtures';

test('correcting airport clears only stale local validation and preserves return date blocking',async({page,provider})=>{
 await page.goto(`/book?product=FLIGHT&from=BOM&to=BOM&date=${departure}`);
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect(page.locator('#booking-feedback')).toContainText('different departure and arrival airports');
 await page.getByLabel('To airport',{exact:true}).fill('DEL');
 await expect(page.locator('#booking-feedback')).not.toContainText('different departure and arrival airports');
 await page.getByLabel('Return date, optional',{exact:true}).fill('2020-01-01');
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 await page.getByLabel('Return date, optional',{exact:true}).fill('');
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect(page.locator('#booking-results')).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('hotel children require explicit ages; deliberate zero survives request and refresh',async({page,provider})=>{
 provider.search={searchId,results:{hotels:[]}};
 await page.goto(`/book?product=HOTEL&city=Goa&hotelIds=10001&date=${departure}&end=${returning}&nationality=106`);
 const room=page.getByRole('group',{name:'Room 1 · Guests',exact:true});
 await room.getByRole('combobox',{name:'Children',exact:true}).selectOption('1');
 const age=room.getByLabel('Child 1 age at check-in',{exact:true});
 await expect(age).toHaveValue('');
 await page.getByRole('button',{name:'Search stays',exact:true}).click();
 expect(provider.requests('/api/travel/search')).toHaveLength(0);
 await age.fill('0');await age.fill('');await expect(age).toHaveValue('');
 await page.getByRole('button',{name:'Search stays',exact:true}).click();expect(provider.requests('/api/travel/search')).toHaveLength(0);
 await age.fill('0');await page.getByRole('button',{name:'Search stays',exact:true}).click();
 await expect(page.locator('#booking-results')).toBeVisible();
 expect(provider.requests('/api/travel/search')[0].body).toMatchObject({rooms:[{adults:1,children:1,childAge:[0]}]});
 await page.reload();await expect(page.getByLabel('Child 1 age at check-in',{exact:true})).toHaveValue('0');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('editing search criteria does not erase an outstanding supplier failure',async({page,provider})=>{
 provider.overrides['POST /api/travel/search']={status:503,body:{error:'Supplier search is temporarily unavailable. Try again.'}};
 await page.goto(`/book?product=FLIGHT&from=BOM&to=DEL&date=${departure}`);
 await page.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect(page.locator('#booking-feedback')).toContainText('Supplier search is temporarily unavailable');
 await page.getByLabel('To airport',{exact:true}).fill('GOI');
 await expect(page.locator('#booking-feedback')).toContainText('Supplier search is temporarily unavailable');
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
});

test('homepage clears corrected airport feedback before native return-date validation',async({page,provider})=>{
 await page.goto('/');const form=page.locator('.home-search-form');
 await form.getByLabel('To airport',{exact:true}).fill('BOM');await form.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('different departure and arrival');
 await expect(form.getByLabel('To airport',{exact:true})).toBeFocused();
 await form.getByLabel('Travellers',{exact:true}).selectOption('2');await expect(form.getByRole('alert')).toContainText('different departure and arrival');
 await form.getByLabel('To airport',{exact:true}).fill('DEL');await expect(form.getByRole('alert')).toHaveCount(0);
 await form.getByLabel('Round trip',{exact:true}).check();await form.getByLabel('Return',{exact:true}).fill('2020-01-01');
 await form.getByRole('button',{name:'Search flights',exact:true}).click();
 await expect(page).toHaveURL('/');await expect(form.getByRole('alert')).toHaveCount(0);expect(provider.requests('/api/travel/search')).toHaveLength(0);
});

test('new review failure is not misclassified as previous local search validation',async({page,provider})=>{
 await page.goto(`/book?product=FLIGHT&from=BOM&to=DEL&date=${departure}&autoSearch=1`);
 await expect(page.locator('#booking-results')).toBeVisible();
 await page.locator('#booking-search>summary').click();await page.getByLabel('To airport',{exact:true}).fill('BOM');
 await page.getByRole('button',{name:'Search flights',exact:true}).click();await expect(page.locator('#booking-feedback')).toContainText('different departure and arrival');
 provider.overrides['POST /api/travel/review']={status:503,body:{error:'Supplier review is temporarily unavailable.'}};
 await page.locator('.live-flight-card').first().locator('.fare-comparison>summary').click();
 await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 await expect(page.locator('#booking-feedback')).toContainText('Supplier review is temporarily unavailable');
 await page.getByLabel('To airport',{exact:true}).fill('DEL');await expect(page.locator('#booking-feedback')).toContainText('Supplier review is temporarily unavailable');
});
