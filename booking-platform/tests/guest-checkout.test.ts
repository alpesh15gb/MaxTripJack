import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

type Query={sql:string;values:unknown[]};
async function load(){
 const output=await build({entryPoints:['src/lib/guest-checkout.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'mocks',setup(p){
  p.onResolve({filter:/^(server-only|\.\/db)$/},a=>({path:a.path,namespace:'mock'}));
  p.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='server-only'?'':'export async function transaction(fn){return fn(globalThis.__guestTx)}',loader:'js'}));
 }}]});
 const compiled={exports:{} as typeof import('../src/lib/guest-checkout')};
 new Function('module','exports','require',output.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
 return compiled.exports;
}
const secret='s'.repeat(40);

test('contact hash is keyed and case-insensitive',async()=>{
 const {guestContactHash}=await load();
 assert.equal(guestContactHash(' Asha@Example.com ',secret),guestContactHash('asha@example.com',secret));
 assert.notEqual(guestContactHash('asha@example.com',secret),guestContactHash('asha@example.com','t'.repeat(40)));
 assert.match(guestContactHash('a@b.co',secret),/^[0-9a-f]{64}$/);
});

test('verified individual accounts claim guest orders with their quotes and searches',async()=>{
 const {claimGuestBookings,guestContactHash}=await load();
 const queries:Query[]=[];
 (globalThis as {__guestTx?:unknown}).__guestTx={async query(sql:string,values:unknown[]){queries.push({sql,values});return sql.startsWith('UPDATE orders')?{rowCount:1,rows:[{id:'o1',quote_id:'q1'}]}:{rowCount:1,rows:[]};}};
 const before=process.env.BETTER_AUTH_SECRET;process.env.BETTER_AUTH_SECRET=secret;
 try{
  assert.equal(await claimGuestBookings({userId:'user-1',companyId:null},{id:'user-1',email:'Asha@example.com',emailVerified:true}),1);
  assert.match(queries[0].sql,/user_id LIKE 'guest:%' AND company_id IS NULL/);
  assert.deepEqual(queries[0].values,['user-1',guestContactHash('asha@example.com',secret)]);
  assert.ok(queries.some(q=>q.sql.startsWith('UPDATE supplier_quotes')));
  assert.ok(queries.some(q=>q.sql.startsWith('UPDATE supplier_searches')));
  queries.length=0;
  // Unverified email, corporate accounts and guests never claim anything.
  assert.equal(await claimGuestBookings({userId:'user-1',companyId:null},{id:'user-1',email:'asha@example.com',emailVerified:false}),0);
  assert.equal(await claimGuestBookings({userId:'user-1',companyId:'c1'},{id:'user-1',email:'asha@example.com',emailVerified:true}),0);
  assert.equal(await claimGuestBookings({userId:'guest:'+'a'.repeat(64),companyId:null},{id:'x',email:'asha@example.com',emailVerified:true}),0);
  assert.equal(queries.length,0);
 }finally{if(before===undefined)delete process.env.BETTER_AUTH_SECRET;else process.env.BETTER_AUTH_SECRET=before;}
});
