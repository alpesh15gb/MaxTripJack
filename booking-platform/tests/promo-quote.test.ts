import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
type Row=Record<string,unknown>;
test('quote promo endpoint owns and locks the quote, avoids stacking, restores totals, and rejects started payments',async()=>{
 const quote:Row={id:'22222222-2222-4222-8222-222222222222',product:'HOTEL',expires_at:new Date(Date.now()+60000),supplier_minor:'100000',total_minor:'120000',promo_code_id:null,undiscounted_minor:null,discount_minor:0};
 const rule={id:'11111111-1111-4111-8111-111111111111',code:'SAVE10',product:'ALL',active:true,expires_at:new Date(Date.now()+60000),discount_minor:0,discount_basis_points:1000,minimum_minor:0,maximum_discount_minor:null};
 let owns=true,started=false;const queries:string[]=[];
 const tx={query:async(sql:string,values:unknown[])=>{queries.push(sql);if(sql.startsWith('SELECT * FROM supplier_quotes')){assert.match(sql,/user_id=\$2 AND company_id IS NOT DISTINCT FROM \$3::uuid FOR UPDATE/);return {rows:owns?[quote]:[]};}if(sql.startsWith('SELECT id FROM orders'))return {rowCount:started?1:0,rows:[]};if(sql.startsWith('SELECT * FROM promo_codes'))return {rows:values[0]==='SAVE10'?[rule]:[]};if(sql.startsWith('UPDATE supplier_quotes')){Object.assign(quote,{promo_code_id:values[1],undiscounted_minor:values[2],discount_minor:values[3],total_minor:values[4]});return {rowCount:1};}throw Error(sql);}};
 const output=await build({entryPoints:['src/app/api/travel/promo/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'boundaries',setup(p){p.onResolve({filter:/^@\/lib\/(access|db|supplier-flow|request-limit)$/},a=>({path:a.path,namespace:'mock'}));p.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.endsWith('/access')?'export async function principal(){return {userId:"owner",companyId:null}}':a.path.endsWith('/db')?'export async function transaction(fn){return fn(globalThis.__promoTx)}':a.path.endsWith('/supplier-flow')?'export function assertFresh(date){if(new Date(date)<=new Date())throw Error("expired")}':'export async function requestLimit(){}',loader:'js'}));}}]});
 const globals=globalThis as unknown as {__promoTx?:typeof tx};globals.__promoTx=tx;
 const old=process.env.BETTER_AUTH_URL;process.env.BETTER_AUTH_URL='https://maxtravel.in';
 try{const compiled={exports:{} as {POST:(r:Request)=>Promise<Response>}};new Function('module','exports','require',output.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
 const apply=async(code:string)=>compiled.exports.POST(new Request('https://maxtravel.in/api/travel/promo',{method:'POST',headers:{origin:'https://maxtravel.in','content-type':'application/json'},body:JSON.stringify({quoteId:quote.id,code})}));
 let response=await apply('save10');assert.equal(response.status,200);assert.equal((await response.json()).totalMinor,108000);
 response=await apply('SAVE10');assert.equal(response.status,200);assert.equal((await response.json()).totalMinor,108000,'reapplying must not stack');
 response=await apply('');assert.equal(response.status,200);assert.equal((await response.json()).totalMinor,120000);assert.equal(quote.promo_code_id,null);
 started=true;response=await apply('SAVE10');assert.equal(response.status,409);assert.equal(quote.total_minor,120000);
 started=false;owns=false;response=await apply('SAVE10');assert.equal(response.status,404);
 assert.ok(queries.some(sql=>sql.includes('FOR SHARE')));
 }finally{delete globals.__promoTx;if(old===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=old;}
});
