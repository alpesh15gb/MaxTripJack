import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {basename} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';

test('offer acceptance keeps one consent record and preserves accepted terms until expiry', async () => {
  const db = new PGlite();
  const orderId = '30cf55a8-7c40-42e2-a7b9-0499667a556a';
  const requestId = 'a0cf55a8-7c40-42e2-a7b9-0499667a556b';
  const oldVersion = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const fixture = {db, actor:{userId:'synthetic-owner',companyId:null}};
  const globals = globalThis as unknown as Record<string,unknown>;
  globals.__cancellationOfferTest = fixture;
  try {
    await db.exec(`
      CREATE TABLE orders (id uuid PRIMARY KEY,user_id text,company_id uuid,total_minor bigint);
      CREATE TABLE cancellation_requests (id uuid PRIMARY KEY,order_id uuid,offer_version uuid,status text,
       offer_expires_at timestamptz,accepted_at timestamptz,refund_offer_minor bigint,penalty_minor bigint,review_note text,reviewed_by text);
      CREATE TABLE audit_events (id uuid PRIMARY KEY,actor_id text,action text,entity_id uuid,detail jsonb);
    `);
    await db.query('INSERT INTO orders VALUES ($1,$2,NULL,10000)', [orderId, fixture.actor.userId]);
    await db.query("INSERT INTO cancellation_requests (id,order_id,offer_version,status,offer_expires_at) VALUES ($1,$2,$3,'AWAITING_ACCEPTANCE',clock_timestamp()-interval '1 second')", [requestId,orderId,oldVersion]);
    const mocks: Record<string,string> = {
      '@/lib/access': 'export const principal=async()=>globalThis.__cancellationOfferTest.actor; export const administrator=async()=>({userId:"synthetic-staff"});',
      '@/lib/db': 'export const database=()=>globalThis.__cancellationOfferTest.db;export const transaction=work=>database().transaction(work);',
      '@/lib/http': `export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
        export const json=(data,status=200)=>Response.json(data,{status});export const failure=e=>json({error:e.message},e.status||500);
        export const body=async(request,schema)=>schema.parse(await request.json());export function sameOrigin(){}`,
      '@/lib/supplier-flow': `import {HttpError} from '@/lib/http';export async function owned(table,id,actor){
        const {rows}=await globalThis.__cancellationOfferTest.db.query('SELECT id FROM orders WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid',[id,actor.userId,actor.companyId]);
        if(!rows[0])throw new HttpError(404,'Record not found.');return rows[0];
      }`,
    };
    const output = await build({entryPoints:{
      accept:'src/app/api/bookings/[id]/cancellation-offer/route.ts', offer:'src/app/api/admin/cancellations/[id]/offer/route.ts',
    },outdir:'out',bundle:true,packages:'external',platform:'node',format:'cjs',write:false,plugins:[{name:'isolated-consent',setup(plugin){
      plugin.onResolve({filter:/.*/},({path})=>Object.hasOwn(mocks,path)?{path,namespace:'fixture'}:undefined);
      plugin.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path],loader:'js'}));
    }}]});
    type Route = {POST:(request:Request, context:{params:Promise<{id:string}>})=>Promise<Response>};
    const routes = Object.fromEntries(output.outputFiles.map(file => {
      const compiled = {exports: {} as Route};
      new Function('module','exports','require',file.text)(compiled,compiled.exports,createRequire(import.meta.url));
      return [basename(file.path,'.js'),compiled.exports.POST];
    }));
    const call = (kind:'accept'|'offer', body:unknown) => routes[kind](new Request('http://127.0.0.1/api/cancellation',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:kind==='accept'?orderId:requestId})});
    const row = async () => (await db.query<{accepted:string|null;offer_version:string}>('SELECT accepted_at::text AS accepted,offer_version FROM cancellation_requests WHERE id=$1',[requestId])).rows[0];

    assert.equal((await call('accept',{offerVersion:oldVersion})).status,409);
    assert.equal((await row()).accepted,null);
    const terms = {refundMinor:7000,penaltyMinor:3000,note:'Synthetic reviewed cancellation charges'};
    const fresh = await call('offer',terms);
    assert.equal(fresh.status,200);
    const {offerVersion} = await fresh.json();
    assert.notEqual(offerVersion,oldVersion);
    fixture.actor.userId = 'other-owner';
    assert.equal((await call('accept',{offerVersion})).status,404);
    fixture.actor.userId = 'synthetic-owner';
    assert.equal((await call('accept',{offerVersion})).status,200);
    const accepted = (await row()).accepted;
    assert.ok(accepted);
    assert.equal((await call('accept',{offerVersion})).status,200);
    assert.equal((await row()).accepted,accepted);
    assert.equal((await db.query<{count:number}>("SELECT count(*)::int FROM audit_events WHERE action='CANCELLATION_OFFER_ACCEPTED'")).rows[0].count,1);
    assert.equal((await call('offer',terms)).status,409);
    assert.deepEqual(await row(),{accepted,offer_version:offerVersion});
    await db.query("UPDATE cancellation_requests SET offer_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[requestId]);
    assert.equal((await call('offer',terms)).status,200);
    assert.equal((await row()).accepted,null);
    assert.equal((await call('accept',{offerVersion})).status,409);
  } finally {
    delete globals.__cancellationOfferTest;
    await db.close();
  }
});
