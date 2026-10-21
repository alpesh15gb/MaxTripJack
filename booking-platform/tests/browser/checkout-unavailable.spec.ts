import {test,expect,openFlightSearch} from './fixtures';
test('hard-gated PayGlocal is disclosed before traveller collection while comparison stays available',async({page,provider})=>{
 await openFlightSearch(page);
 await expect(page.getByRole('region',{name:'Online payment availability'})).toContainText('Online payment is not available yet');
 await page.locator('.fare-comparison > summary').first().click();
 await page.getByRole('button',{name:'Select fare',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 await expect(page.getByLabel('First name',{exact:true})).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Online payment unavailable',exact:true})).toBeDisabled();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
 expect(await page.locator('script[src*="checkout.razorpay.com"]').count()).toBe(0);
});
