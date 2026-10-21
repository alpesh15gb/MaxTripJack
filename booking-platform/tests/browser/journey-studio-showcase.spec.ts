import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {test,expect,capture,expectNoHorizontalOverflow} from './fixtures';
import {samplePackage} from '../package-fixture';

// Visual-only fixtures. These are not published inventory, prices or offers.
// Existing local Unsplash-source editorial assets are intercepted, never fetched remotely.
const samples=[
 {slug:'goa-layout-sample',name:'Goa',destination:'Goa, India',asset:'goa.jpg'},
 {slug:'dubai-layout-sample',name:'Dubai',destination:'Dubai, UAE',asset:'dubai.jpg'},
 {slug:'bali-layout-sample',name:'Bali',destination:'Bali, Indonesia',asset:'bali.jpg'},
].map((sample,index)=>({...samplePackage,id:`visual-sample-${index}`,slug:sample.slug,title:`${sample.name} — layout sample`,destination:sample.destination,summary:'Layout sample — not published inventory. Destination imagery for design review only.',description:'Layout sample — not published inventory. This page demonstrates the visual presentation of an itinerary; it is not a travel offer.',priceAmount:null,priceBasis:'ON_REQUEST',availability:'UNAVAILABLE',availabilityNotes:'Not bookable. Layout sample for design review only.',priceNotes:'No price is offered for this visual sample.',coverImageUrl:`https://i.travelapi.com/lodging/layout-sample-${sample.slug}.jpg`,coverImageAlt:`${sample.name} destination photograph — layout sample, not published inventory`,gallery:[],itinerary:[{day:1,title:'Day one — layout sample',description:'Placeholder itinerary text for design review, not an included service.'},{day:2,title:'Day two — layout sample',description:'Placeholder itinerary text for design review, not an included service.'}],inclusions:['Layout sample only — no services offered'],exclusions:['Not published inventory'],terms:'Visual sample only. No booking is offered.',cancellationPolicy:'Not applicable to this non-bookable layout sample.',asset:sample.asset}));

test('Journey Studio photo showcase is clearly labelled and never presented as bookable stock',async({page,provider},testInfo)=>{
 for(const sample of samples){const body=await readFile(resolve(process.cwd(),'public/travel',sample.asset));await page.route(sample.coverImageUrl,route=>route.fulfill({status:200,contentType:'image/jpeg',body}));}
 provider.overrides['GET /api/packages']={body:{packages:samples,truncated:false,unavailableCount:0}};
 for(const sample of samples)provider.overrides[`GET /api/packages/${sample.slug}`]={body:{package:sample}};
 await page.goto('/');await expect(page.locator('.home-package-grid')).toContainText('Layout sample — not published inventory');
 await page.locator('.home-package-plans').scrollIntoViewIfNeeded();const homePhotos=page.locator('.home-package-photo img');await expect(homePhotos).toHaveCount(3);
 for(const image of await homePhotos.all()){await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}
 await page.locator('.home-package-plans').scrollIntoViewIfNeeded();await capture(page,testInfo,'studio-home-real-photo-layout-samples');await testInfo.attach('published-layout-samples viewport',{body:await page.screenshot({fullPage:false,animations:'disabled'}),contentType:'image/png'});await expectNoHorizontalOverflow(page);
 await page.goto('/packages');await expect(page.locator('.package-card')).toHaveCount(3);await expect(page.locator('.package-card').first()).toContainText('Currently unavailable');await expect(page.locator('.package-price').first()).toContainText('Price on request');
 for(const image of await page.locator('.package-card-photo img').all()){await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}
 await page.evaluate(()=>scrollTo(0,0));await capture(page,testInfo,'studio-package-real-photo-layout-samples');await expectNoHorizontalOverflow(page);
 await page.goto('/packages/goa-layout-sample');await expect(page.getByRole('heading',{level:1})).toHaveText('Goa — layout sample');await expect(page.locator('.package-cover img')).toBeVisible();await expect.poll(()=>page.locator('.package-cover img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);await expect(page.getByRole('link',{name:'Enquire on WhatsApp'})).toHaveCount(0);await capture(page,testInfo,'studio-package-detail-real-photo-layout-sample');await expectNoHorizontalOverflow(page);
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});
