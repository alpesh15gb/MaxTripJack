import test from 'node:test';
import assert from 'node:assert/strict';
import {packageMediaId,packageMediaPath} from '../src/lib/package-media';
import {fetchPackageMedia,PackageMediaError} from '../src/lib/package-media-transport';
import {currentPackage,safePackagePhoto} from '../src/lib/travel-packages';
import {samplePackage} from './package-fixture';
const id='12345678-1234-4123-8123-123456789abc';
const path=`/api/public/package-media/${id}`;
const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');
const response=(body:BodyInit=webp,headers:Record<string,string>={'content-type':'image/webp'},status=200)=>(async()=>new Response(body,{headers,status})) as typeof fetch;
test('only exact lower-case public UUID-v4 references map to same-origin media',()=>{
 assert.equal(packageMediaId(path),id);assert.equal(packageMediaPath(path),`/api/package-media/${id}`);assert.equal(safePackagePhoto(path),true);assert.equal(currentPackage({...samplePackage,coverImageUrl:path}).coverImageUrl,path);
 for(const value of [path+'?x=1',path+'#x',path+'/',path.toUpperCase(),'/api/documents/'+id,'https://crm.maxtravel.in'+path,'//crm.maxtravel.in'+path,'/api/public/package-media/../private',path.replace('-4123-','-1123-'),path.replace('-8123-','-7123-'),path.replace('12345678','%31%32%33%34%35%36%37%38')])assert.equal(packageMediaPath(value),null,value);
});
test('bridge reads only fixed public CRM source without redirects or credentials',async()=>{
 const fetcher=(async(url,init)=>{assert.equal(url,`https://crm.maxtravel.in/api/public/package-media/${id}`);assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.deepEqual(init?.headers,{Accept:'image/webp'});assert.equal(init?.credentials,undefined);return new Response(webp,{headers:{'content-type':'image/webp','content-length':String(webp.length)}});}) as typeof fetch;
 assert.deepEqual(await fetchPackageMedia(id,fetcher),new Uint8Array(webp));
 let called=false;await assert.rejects(fetchPackageMedia('../private',(async()=>{called=true;return new Response(webp);}) as typeof fetch));assert.equal(called,false);
});
test('unpublished404 distinct from upstream failures and no HTML/SVG masquerading as media',async()=>{
 await assert.rejects(fetchPackageMedia(id,response('',{},404)),(e:unknown)=>e instanceof PackageMediaError&&e.status===404);
 for(const fetcher of [response('<svg/>',{'content-type':'image/svg+xml'}),response('<html/>',{'content-type':'image/webp'}),response(webp,{'content-type':'image/webp','content-length':'1000'}),response(webp,{'content-type':'image/webp; charset=utf-8'}),response(webp,{'content-type':'image/webp'},500)])await assert.rejects(fetchPackageMedia(id,fetcher),(e:unknown)=>e instanceof PackageMediaError&&e.status===503);
 const invalid=Buffer.from(webp);invalid.writeUInt32LE(999,4);await assert.rejects(fetchPackageMedia(id,response(invalid)));
});
test('bridge bounds streamed and declared image bytes',async()=>{
 await assert.rejects(fetchPackageMedia(id,response(webp,{'content-type':'image/webp','content-length':String(3*1024*1024+1)})));
 await assert.rejects(fetchPackageMedia(id,response(new Uint8Array(3*1024*1024+1))));
});
test('bridge times out without retries or raw upstream error leakage',async()=>{
 let calls=0;const fetcher=((_url,init)=>{calls++;return new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('private upstream detail'))));}) as typeof fetch;
 await assert.rejects(fetchPackageMedia(id,fetcher),(e:unknown)=>e instanceof PackageMediaError&&e.status===503&&!e.message.includes('private'));assert.equal(calls,1);
});

test('rejected headers cancel unread upstream streams before returning',async()=>{
 for(const headers of ([{'content-type':'image/svg+xml'},{'content-type':'image/webp','content-length':String(3*1024*1024+1)}] as Record<string,string>[])){let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(webp);},cancel(){cancelled=true;}});await assert.rejects(fetchPackageMedia(id,response(stream,headers)));assert.equal(cancelled,true);assert.equal(stream.locked,false);}
});
