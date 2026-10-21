import {randomBytes} from 'node:crypto';
import {test,expect,expectNoHorizontalOverflow} from './fixtures';

test.describe('server-rendered package detail without JavaScript',()=>{
 test.use({javaScriptEnabled:false});
 test('published itinerary and matching metadata are in initial HTML without client API',async({page,provider})=>{
  const response=await page.goto('/packages/kerala-at-your-pace');expect(response?.status()).toBe(200);await expect(page.getByRole('heading',{level:1})).toHaveText('Kerala at your pace');await expect(page.getByRole('heading',{name:'Your itinerary'})).toBeVisible();await expect(page.locator('.package-itinerary')).toContainText('Arrival');await expect(page.locator('.package-price')).toContainText('₹15,000');await expect(page).toHaveTitle(/Kerala at your pace/);await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://maxtravel.in/packages/kerala-at-your-pace');expect(response?.headers()['x-robots-tag']).toContain('noindex');await expect(page.locator('meta[name=robots]')).toHaveAttribute('content',/noindex/);expect(provider.requests('/api/packages/kerala-at-your-pace')).toHaveLength(0);await expectNoHorizontalOverflow(page);
 });
 test('metadata and content share one request snapshot without cross-request staleness',async({page})=>{
  await page.goto('/packages/ssr-consistency-layout-sample');const first=await page.getByRole('heading',{level:1}).innerText();await expect(page).toHaveTitle(new RegExp(first));await page.reload();const second=await page.getByRole('heading',{level:1}).innerText();await expect(page).toHaveTitle(new RegExp(second));expect(second).not.toBe(first);
 });
});
test('unpublished and invalid slugs are HTTP404, not temporary supplier failures',async({page,request})=>{
 for(const slug of ['not-published-layout-sample','INVALID_slug']){const response=await page.goto(`/packages/${slug}`);expect(response?.status()).toBe(404);await expect(page.getByRole('heading',{name:'Package unavailable',exact:true})).toBeVisible();}
 const api=await request.get('/api/packages/unavailable-layout-sample');expect(api.status()).toBe(503);
});
test('temporary detail errors offer accessible retry and never claim withdrawn inventory',async({page})=>{
 const response=await page.goto('/packages/unavailable-layout-sample');expect(response?.status()).toBe(500);await expect(page.getByRole('heading',{name:'Package information is temporarily unavailable'})).toBeVisible();await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();await expect(page.getByText('This does not mean the package has been withdrawn.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Package information is temporarily unavailable'})).toBeVisible();await expectNoHorizontalOverflow(page);
});

test('temporary package retry recovers current publication or a real withdrawn state',async({page})=>{
 for(const outcome of ['success','withdrawn']){
  const slug=`retry-${outcome}-${randomBytes(8).toString('hex')}`;
  await page.goto(`/packages/${slug}`);await expect(page.getByRole('heading',{name:'Package information is temporarily unavailable'})).toBeVisible();await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText(outcome==='success'?'Kerala at your pace':'Package unavailable');await expect(page.getByRole('button',{name:'Try again',exact:true})).toHaveCount(0);
  if(outcome==='success')await expect(page.getByRole('heading',{name:'Your itinerary'})).toBeVisible();else await expect(page.getByRole('link',{name:'Enquire on WhatsApp'})).toHaveCount(0);
 }
});
