import {test,expect,openFlightSearch,capture,expectNoHorizontalOverflow} from './fixtures';
test('hard-gated PayGlocal is disclosed before traveller collection while comparison stays available',async({page,provider},testInfo)=>{
 await openFlightSearch(page);
 await expect(page.getByRole('region',{name:'Online payment availability'})).toContainText('Online payment is currently unavailable.');
 await expectNoHorizontalOverflow(page);
 await capture(page,testInfo,'payment-disabled-compact-results');
 await page.locator('.fare-comparison > summary').first().click();
 await page.getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 await expect(page.getByLabel('First name',{exact:true})).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Online payment unavailable',exact:true})).toBeDisabled();
 await expect(page.getByRole('region',{name:'Payment unavailable'})).toContainText('no booking has been made');
 await page.getByRole('button',{name:'Back to results',exact:true}).click();
 await expect(page.locator('#booking-results')).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 expect(await page.locator('script[src*="checkout.razorpay.com"]').count()).toBe(0);
});
