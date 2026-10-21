import {test,expect,capture,expectNoHorizontalOverflow} from './fixtures';
import {samplePackage} from '../package-fixture';
test('published packages support discovery, honest prices and contact-only itinerary journey',async({page,provider},testInfo)=>{
 const photographed={...samplePackage,coverImageUrl:'https://i.travelapi.com/lodging/123/package.jpg',coverImageAlt:'Synthetic package photo'};
 await page.route('https://i.travelapi.com/lodging/123/package.jpg',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#d7e6db"/><text x="40" y="80" font-size="30">Synthetic package fixture</text></svg>'}));
 provider.overrides['GET /api/packages']={body:{packages:[photographed],truncated:false,unavailableCount:0}};
 provider.overrides['GET /api/packages/kerala-at-your-pace']={body:{package:photographed}};
 await page.goto('/packages');await expect(page.getByRole('heading',{name:'Kerala at your pace'})).toBeVisible();
 await expect(page.locator('.package-price')).toContainText('Starting estimate');await expect(page.locator('.package-price')).toContainText('₹15,000');await expect(page.locator('.package-price')).toContainText('per person');await expect(page.locator('.package-price')).toContainText('Check applicable taxes');
 await page.getByRole('searchbox').fill('No such place');await expect(page.getByRole('heading',{name:'No matching plans'})).toBeVisible();await page.getByRole('button',{name:'Clear search'}).click();await expect(page.getByRole('searchbox')).toBeFocused();
 await expectNoHorizontalOverflow(page);await capture(page,testInfo,'packages-discovery');
 await testInfo.attach('packages viewport',{body:await page.screenshot({fullPage:false,animations:'disabled'}),contentType:'image/png'});
 await page.getByRole('link',{name:/View itinerary & details/}).click();await expect(page.getByRole('heading',{name:'Your itinerary'})).toBeVisible();
 await expect(page.locator('.package-itinerary li').first()).toContainText('Day 1');await expect(page.getByRole('link',{name:'Enquire on WhatsApp'})).toHaveAttribute('href',/^https:\/\/wa.me\/917095018018\?text=/);
 await expect(page.getByRole('link',{name:'Draft an email enquiry'})).toHaveAttribute('href',/^mailto:packages%40example.test\?subject=/);
 await page.getByRole('link',{name:'Price & enquiry'}).click();await expect(page.locator('#package-enquiry')).toBeFocused();
 await expect(page.locator('.package-quote')).toContainText('Nothing is submitted here');await expectNoHorizontalOverflow(page);await capture(page,testInfo,'package-detail');
 expect(provider.calls.filter(c=>c.method!=='GET')).toHaveLength(0);
});
test('package errors, empty lists, partial content and withdrawn details remain distinct',async({page,provider})=>{
 provider.overrides['GET /api/packages']={status:503,body:{error:'unavailable'}};await page.goto('/packages');await expect(page.getByRole('heading',{name:'We couldn’t load packages'})).toBeVisible();
 provider.overrides['GET /api/packages']={body:{packages:[],truncated:false,unavailableCount:0}};await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('heading',{name:'New journeys are on the way'})).toBeVisible();
 provider.overrides['GET /api/packages']={body:{packages:[],truncated:false,unavailableCount:2}};await page.reload();await expect(page.getByRole('heading',{name:'Plans are temporarily unavailable'})).toBeVisible();
 provider.overrides['GET /api/packages/kerala-at-your-pace']={status:404,body:{error:'missing'}};await page.goto('/packages/kerala-at-your-pace');await expect(page.getByRole('heading',{name:'Package unavailable'})).toBeVisible();await expect(page.getByRole('link',{name:'Enquire on WhatsApp'})).toHaveCount(0);
});
test('expired package estimates and unavailable travel cannot suggest a booking',async({page,provider})=>{
 provider.overrides['GET /api/packages/kerala-at-your-pace']={body:{package:{...samplePackage,priceValidUntil:'2020-01-01',travelEnd:'2020-01-02'}}};
 await page.goto('/packages/kerala-at-your-pace');await expect(page.locator('.package-price')).toContainText('Price on request');await expect(page.locator('.package-quote')).toContainText('Currently unavailable');await expect(page.getByRole('link',{name:'Enquire on WhatsApp'})).toHaveCount(0);await expect(page.locator('.package-price')).not.toContainText('15,000');
});

test('home discovery uses published summaries and navigation fits narrow viewports',async({page,provider},testInfo)=>{
 provider.overrides['GET /api/packages']={body:{packages:[samplePackage],truncated:false,unavailableCount:0}};await page.goto('/');await expect(page.locator('.home-package-grid')).toContainText(samplePackage.title);
 const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(nav.getByRole('link',{name:'Packages',exact:true})).toBeVisible();
 const bounds=await nav.getByRole('link',{name:'Packages',exact:true}).evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,height:r.height};});expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(bounds.width);expect(bounds.height).toBeGreaterThanOrEqual(44);
 await page.locator('.home-package-plans').scrollIntoViewIfNeeded();await capture(page,testInfo,'home-published-packages');await expectNoHorizontalOverflow(page);
 await nav.getByRole('link',{name:'Packages',exact:true}).click();await expect(page.getByRole('heading',{name:'Travel packages',exact:true})).toBeVisible();
});
