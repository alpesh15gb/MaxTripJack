import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPackage,currentPackageSummary,packageEmailHref,packagePrice,safePackagePhoto} from '../src/lib/travel-packages';
import {fetchPackageCatalogue,PackageCatalogueError} from '../src/lib/package-catalogue';
import {samplePackage} from './package-fixture';
const reply = (value:unknown,status=200) => (async () => Response.json(value,{status})) as typeof fetch;
const list = (packages:unknown[]) => ({packages,truncated:false,unavailableCount:0});
test('published contract strips private fields and keeps major-unit prices',()=>{
 const item=currentPackage({...samplePackage,internalNotes:'private'},new Date('2026-10-21T23:00:00Z'));
 assert.equal(packagePrice(item),'₹15,000');assert.equal('internalNotes' in item,false);
});
test('price and travel expire consistently at UTC midnight, not India midnight',()=>{
 const item={...samplePackage,priceValidUntil:'2026-10-21',travelEnd:'2026-10-21'};
 assert.equal(currentPackage(item,new Date('2026-10-21T23:59:59Z')).priceAmount,15000);
 const expired=currentPackage(item,new Date('2026-10-22T00:00:00Z'));
 assert.equal(expired.priceAmount,null);assert.equal(expired.priceBasis,'ON_REQUEST');assert.equal(expired.availability,'UNAVAILABLE');
 assert.throws(()=>currentPackage({...item,travelEnd:'2026-99-99'}));
});
test('package media only existing CSP hosts with bounded safe queries',()=>{
 for(const url of ['https://images.unsplash.com/photo-123?auto=format&w=800&q=80','https://i.travelapi.com/lodging/123/a.jpg','https://pix8.agoda.net/hotelImages/1/a.jpg'])assert.equal(safePackagePhoto(url),true,url);
 for(const url of ['https://images.unsplash.com:443/photo-123','https://images.unsplash.com/photo-123?w=800&w=900','https://images.unsplash.com/photo-123?url=https://evil.test','https://images.unsplash.com/photo-123?w=999999','https://images.unsplash.com/photo-123#x','https://images.unsplash.com/photo-%2e%2e','https://evil.test/photo-123','http://images.unsplash.com/photo-123','https://i.travelapi.com/lodging/../secret','https://i.travelapi.com/lodging/a.jpg?x=1'])assert.equal(safePackagePhoto(url),false,url);
});
test('catalogue distinguishes empty, partial, missing and malformed',async()=>{
 assert.deepEqual(await fetchPackageCatalogue(undefined,reply(list([]))),list([]));
 const partial=await fetchPackageCatalogue(undefined,reply({...list([]),unavailableCount:2,truncated:true}));assert.equal(partial.unavailableCount,2);assert.equal(partial.truncated,true);
 await assert.rejects(fetchPackageCatalogue('missing',reply({},404)),(e:unknown)=>e instanceof PackageCatalogueError&&e.status===404);
 for(const bad of [{},list([{}]),list(Array(251).fill(samplePackage)),list([samplePackage,samplePackage]),{...list([]),unavailableCount:-1}])await assert.rejects(fetchPackageCatalogue(undefined,reply(bad)),(e:unknown)=>e instanceof PackageCatalogueError&&e.status===503);
 await assert.rejects(fetchPackageCatalogue('different-slug',reply({package:samplePackage})),(e:unknown)=>e instanceof PackageCatalogueError&&e.status===503);
});
test('fixed origin no redirects credentials or arbitrary slug and size limits',async()=>{
 let called=false;const spy=(async (url,init)=>{called=true;assert.equal(url,'https://crm.maxtravel.in/api/public/travel-packages');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.equal(init?.credentials,undefined);return Response.json(list([]));}) as typeof fetch;
 await fetchPackageCatalogue(undefined,spy);assert.equal(called,true);called=false;
 await assert.rejects(fetchPackageCatalogue('../admin',spy));assert.equal(called,false);
 await assert.rejects(fetchPackageCatalogue(undefined,(async()=>new Response('x',{headers:{'content-length':String(9*1024*1024)}})) as typeof fetch));
 await assert.rejects(fetchPackageCatalogue(undefined,(async()=>{throw new DOMException('aborted','AbortError');}) as typeof fetch));
});

test('summary response omits long details and contacts within bounded 250 entries',async()=>{
 const summary=currentPackageSummary(samplePackage);assert.equal('itinerary' in summary,false);assert.equal('contactEmail' in summary,false);assert.equal('description' in summary,false);
 const packages=Array.from({length:250},(_,i)=>({...summary,id:`id-${i}`,slug:`package-${i}`}));
 const result=await fetchPackageCatalogue(undefined,reply(list(packages)));assert.equal(result.packages.length,250);
});
test('transport aborts hung upstream and maps timeout to unavailable',async()=>{
 const began=Date.now();const hung=((_url,init)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))) as typeof fetch;
 await assert.rejects(fetchPackageCatalogue(undefined,hung),(error:unknown)=>error instanceof PackageCatalogueError&&error.status===503);assert.ok(Date.now()-began<6500);
});

test('email drafts encode valid percent local-parts and all message fields',()=>{
 const href=packageEmailHref('person%0a@example.test','A&B?subject=other','Hello&bcc=other@example.test');
 assert.ok(href.startsWith('mailto:person%250a%40example.test?subject='));
 const query=new URLSearchParams(href.split('?')[1]);assert.equal(query.size,2);assert.equal(query.get('subject'),'Package enquiry: A&B?subject=other');assert.equal(query.get('body'),'Hello&bcc=other@example.test');
});
