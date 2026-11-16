import {test,expect,capture,departure,flight,searchId,expectNoHorizontalOverflow} from './fixtures';
import type {Flight} from '../../src/lib/booking-presentation';

test('fare comparison preserves distinct offers, orders comparable totals and shows readable price basis',async({page,provider},testInfo)=>{
 const journey:Flight=flight();
 const base=journey.totalPriceList[0];
 journey.totalPriceList=[
  {...base,id:'audit-high',fareIdentifier:'CORPORATE',customerEstimateMinor:779950},
  {...base,id:'audit-low',fareIdentifier:'CORPORATE',customerEstimateMinor:326150,fD:{ADULT:{...base.fD.ADULT,bI:{...base.fD.ADULT.bI,iB:'25 Kg'},rT:1}}},
  {...base,id:'audit-published',fareIdentifier:'PUBLISHED',customerEstimateMinor:324850},
  {...base,id:'audit-unknown',fareIdentifier:'CORPORATE',customerEstimateMinor:null},
 ];
 provider.search={searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const card=page.locator('.flight-shopping-list .live-flight-card');await expect(card).toHaveCount(1);
 await card.locator('.fare-comparison>summary').click();
 const offers=card.locator('.fare-option');await expect(offers).toHaveCount(4);
 await expect(offers.nth(0)).toContainText('Standard fare');await expect(offers.nth(0)).toContainText('₹3,248.50');
 await expect(offers.nth(1)).toContainText('₹3,261.50');await expect(offers.nth(2)).toContainText('₹7,799.50');await expect(offers.nth(3)).toContainText('Price at review');
 await expect(offers.nth(1)).toContainText('+₹13.00 vs lowest shown fare');
 await expect(offers.nth(1).locator('.fare-difference').first()).toContainText('25 Kg');
 await expect(card.locator('.fare-comparison-guidance')).toContainText('Lowest INR estimates first; unpriced offers last.');
 await expect(card.locator('.fare-shared-terms')).toContainText('eligibility at review');
 await expect(card.locator('.fare-details-unavailable')).toHaveCount(1);
 const sharedTerms=await card.locator('.fare-details-unavailable').getAttribute('id');
 expect(sharedTerms).toBeTruthy();for(const offer of await offers.all())await expect(offer).toHaveAttribute('aria-describedby',sharedTerms!);
 for(const qualifier of await card.locator('.fare-comparison>summary small,.fare-option-action small').all()){
  expect(await qualifier.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(14);
 }
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'audit-fare-comparison');
 await offers.first().getByRole('button',{name:'Check fare & continue',exact:true}).click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();
 await page.getByText('Original search details & fare',{exact:true}).click();
 const selectedSummary=page.locator('.selected-itinerary .fare-comparison>summary');
 await expect(selectedSummary).toContainText('Selected fare');
 await expect(selectedSummary).toContainText('Estimated total · all travellers');
 const priceBlock=selectedSummary.locator(':scope > strong');
 const priceGeometry=await priceBlock.evaluate(node=>{const parent=node.parentElement!;const style=getComputedStyle(parent);return {maxWidth:getComputedStyle(node).maxWidth,width:node.getBoundingClientRect().width,available:parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};});
 expect(priceGeometry.maxWidth).toBe('none');
 expect(Math.abs(priceGeometry.width-priceGeometry.available)).toBeLessThan(1);
 expect((await selectedSummary.boundingBox())?.height).toBeLessThan(160);
 for(const qualifier of await selectedSummary.locator('small').all()) expect(await qualifier.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(14);
 await capture(page,testInfo,'audit-selected-fare-receipt');
 expect(provider.requests('/api/travel/review')[0].body).toEqual({searchId,priceIds:['audit-published']});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('mixed-currency fare comparison keeps supplier order and returns focus on Escape', async ({page,provider}) => {
 const journey: Flight = flight();
 const base = journey.totalPriceList[0];
 journey.totalPriceList = [
  {...base,id:'foreign-fare',fareIdentifier:'API_742_X',currency:'USD',customerEstimateMinor:90000},
  {...base,id:'brand-fare',fareIdentifier:'SPICESAVER',customerEstimateMinor:620000},
  {...base,id:'standard-fare',fareIdentifier:'PUBLISHED',customerEstimateMinor:580000},
 ];
 provider.search = {searchId,results:{searchResult:{tripInfos:{ONWARD:[journey]}}}};
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,adults:'1',autoSearch:'1'}));
 const card = page.locator('.flight-shopping-list .live-flight-card');
 const disclosure = card.locator('.fare-comparison > summary');
 await disclosure.press('Enter');
 await expect(card.getByRole('heading',{name:'Compare fares'})).toBeFocused();
 await expect(card.locator('.fare-option h4')).toHaveText(['Fare option','SpiceSaver','Standard fare']);
 await expect(card.locator('.fare-option').first()).toContainText('Price at review');
 await expect(card.locator('.fare-option').first()).not.toContainText('₹900');
 await expect(card.locator('.fare-price-comparison')).toHaveCount(0);
 await expect(card.locator('.fare-comparison-guidance')).toContainText('Price differences are unavailable across currencies.');
 await expectNoHorizontalOverflow(page);
 await page.keyboard.press('Escape');
 await expect(disclosure).toBeFocused();
 await expect(card.locator('.fare-option')).toHaveCount(0);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
