/** Explicit test-server preload, not production code or an environment/header bypass.
 * Browser interception cannot mock a server-component fetch. Only immutable named
 * package fixtures are permitted; unknown CRM requests cannot reach the network. */
import {packageSsrFixture} from './package-ssr-fixtures';
import {samplePackage} from './package-fixture';
const realFetch=globalThis.fetch;let consistencySequence=0;const retryAttempts=new Map<string,number>();
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.hostname!=='crm.maxtravel.in')return realFetch(input,init);
 if(url.origin!=='https://crm.maxtravel.in'||url.search||url.hash||(init?.method??'GET')!=='GET')throw new Error('Unexpected CRM request in SSR test server');
 if(url.pathname==='/api/public/travel-packages')return Response.json({packages:[samplePackage],truncated:false,unavailableCount:0});
 const match=url.pathname.match(/^\/api\/public\/travel-packages\/([a-z0-9-]+)$/);
 if(!match)throw new Error('Unmocked CRM endpoint in SSR test server');
 const slug=match[1];
 const retry=slug.match(/^retry-(success|withdrawn)-[a-f0-9]{16}$/);
 if(retry){const count=retryAttempts.get(slug)||0;if(retryAttempts.size>64)throw new Error('Fixture retry bound');retryAttempts.set(slug,count+1);if(!count)return Response.json({error:'Synthetic temporary failure'},{status:503});return retry[1]==='success'?Response.json({package:{...samplePackage,slug}}):Response.json({error:'Not published'},{status:404});}
 if(slug==='unavailable-layout-sample')return Response.json({error:'Synthetic upstream unavailable'},{status:503});
 const item=packageSsrFixture(slug,slug==='ssr-consistency-layout-sample'?++consistencySequence:1);
 return item?Response.json({package:item}):Response.json({error:'Not published'},{status:404});
};
