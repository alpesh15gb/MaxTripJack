import {test,expect,expectNoHorizontalOverflow} from './fixtures';
import {samplePackage} from '../package-fixture';
const id='12345678-1234-4123-8123-123456789abc';
const path=`/api/public/package-media/${id}`;
const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');
test('first-party package photo uses bounded public bridge and preserves privacy attributes',async({page,provider})=>{
 provider.overrides['GET /api/packages']={body:{packages:[{...samplePackage,coverImageUrl:path,coverImageAlt:'Configured package photo'}],truncated:false,unavailableCount:0}};
 let calls=0;await page.route(`**/api/package-media/${id}`,route=>{calls++;return route.fulfill({contentType:'image/webp',body:webp,headers:{'cache-control':'no-store'}});});
 await page.goto('/packages');const image=page.getByRole('img',{name:'Configured package photo'});await expect(image).toHaveAttribute('src',`/api/package-media/${id}`);await expect(image).toHaveAttribute('loading','lazy');await expect(image).toHaveAttribute('referrerpolicy','no-referrer');await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);expect(calls).toBe(1);await expectNoHorizontalOverflow(page);
});
test('withdrawn package media falls back rather than exposing a private attachment',async({page,provider})=>{
 provider.overrides['GET /api/packages']={body:{packages:[{...samplePackage,coverImageUrl:path,coverImageAlt:'Withdrawn photo'}],truncated:false,unavailableCount:0}};
 await page.route(`**/api/package-media/${id}`,route=>route.fulfill({status:404,body:'',headers:{'cache-control':'no-store'}}));
 await page.goto('/packages');await page.locator('.package-card-photo').scrollIntoViewIfNeeded();await expect(page.getByText('Package photos not available',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'Withdrawn photo'})).toHaveCount(0);
});
