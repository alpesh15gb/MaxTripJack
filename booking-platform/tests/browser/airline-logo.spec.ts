import {test,expect,openFlightSearch,capture,expectNoHorizontalOverflow,flightResults} from './fixtures';
test('flight results display a loaded local airline logo on desktop and mobile',async({page},info)=>{
 await openFlightSearch(page);
 const logo=page.locator('.flight-shopping-list .airline-logo img').first();
 await expect(logo).toHaveAttribute('src',/\/airlines\/6E\.png$/);
 await expect.poll(()=>logo.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await expectNoHorizontalOverflow(page);await capture(page,info,'flight-airline-logo');
});
test('failed and unknown airline logos preserve readable carrier identity',async({page,provider})=>{
 await page.route('**/airlines/6E.png',route=>route.abort());await openFlightSearch(page);
 const badge=page.locator('.flight-shopping-list .airline-logo').first();await expect(badge).toHaveText('6E');
 await expect(page.locator('.flight-shopping-list .airline-identity').first()).toContainText('IndiGo');
 const results=flightResults();results.results.searchResult.tripInfos.ONWARD[0].sI[0].fD.aI={code:'ZZ',name:'Synthetic unknown airline'};provider.search=results;
 await page.reload();await expect(badge).toHaveText('ZZ');await expect(badge.locator('img')).toHaveCount(0);await expectNoHorizontalOverflow(page);
});
