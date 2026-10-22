import {test,expect,capture,departure,flight,searchId,expectNoHorizontalOverflow} from './fixtures';
import type {Flight} from '../../src/lib/booking-presentation';

test('fare comparison preserves distinct offers, orders comparable totals and shows readable price basis',async({page,provider},testInfo)=>{
 const journey:Flight=flight();
 const base=journey.totalPriceList[0];
 journey.totalPriceList=[
  {...base,id:'audit-high',fareIdentifier:'CORPORATE',customerEstimateMinor:779950},
  {...base,id:'audit-low',fareIdentifier:'CORPORATE',customerEstimateMinor:326150},
  {...base,id:'audit-published',fareIdentifier:'PUBLISHED',customerEstimateMinor:324850},
  {...base,id:'audit-unknown',fareIdentifier:'CORPORATE',customerEstimateMinor:null},
 ];
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const card=page.locator('.flight-shopping-list .live-flight-card');await expect(card).toHaveCount(1);
 await card.locator('.fare-comparison>summary').click();
 const offers=card.locator('.fare-option');await expect(offers).toHaveCount(4);
 await expect(offers.nth(0)).toContainText('PUBLISHED');await expect(offers.nth(0)).toContainText('₹3,248.50');
 await expect(offers.nth(1)).toContainText('₹3,261.50');await expect(offers.nth(2)).toContainText('₹7,799.50');await expect(offers.nth(3)).toContainText('Price at review');
 await expect(card.locator('.fare-comparison-guidance')).toContainText('Lowest INR estimates first; unpriced offers last.');
 await expect(card.locator('.fare-comparison-guidance')).toContainText('do not assume eligibility');
 await expect(card.locator('.fare-details-unavailable')).toHaveCount(4);
 for(const qualifier of await card.locator('.fare-comparison>summary small,.fare-option-action small').all()){
  expect(await qualifier.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(14);
 }
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'audit-fare-comparison');
 await offers.first().getByRole('button',{name:'Select fare',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['audit-published']});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
