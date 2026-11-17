import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {claimSafarEnquirySql,recordSafarEnquirySql,deferSafarEnquirySql,frozenSafarEnquiry,type SafarEnquiryJob} from '../src/lib/enquiry-crm-queue';
import type {EnquirySubmission} from '../src/lib/travel-enquiry-contract';

const require=createRequire(import.meta.url);
async function saveLibrary(){
  const output=await build({entryPoints:['src/lib/travel-enquiries.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'isolated-boundary',setup(plugin){
    plugin.onResolve({filter:/^server-only$|^\.\/db$|^next\/navigation$/},args=>({path:args.path,namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='server-only'?'':args.path==='next/navigation'?'export function unstable_rethrow(){}':'export function database(){throw Error("No network DB allowed")};export function transaction(){throw Error("Inject isolated PostgreSQL")};'}));
  }}]});
  const loaded={exports:{} as typeof import('../src/lib/travel-enquiries')};new Function('module','exports','require',output.outputFiles[0].text)(loaded,loaded.exports,require);return loaded.exports;
}

test('actual PostgreSQL migration and dedicated queue isolate booking events, modes and expired/replaced leases',async context=>{
  const db=new PGlite(),oldMode=process.env.SAFAR_ENQUIRY_MODE;
  context.after(async()=>{if(oldMode===undefined)delete process.env.SAFAR_ENQUIRY_MODE;else process.env.SAFAR_ENQUIRY_MODE=oldMode;await db.close();});
  await db.waitReady;
  const migrations=(await readdir('db')).filter(file=>/^\d{3}-.+\.sql$/.test(file)).sort();
  const beforeDestination=migrations.filter(file=>file<'025-');
  for(const file of beforeDestination)await db.exec(await readFile('db/'+file,'utf8'));
  const orderId=randomUUID(),paymentId=randomUUID();
  await db.query("INSERT INTO orders(id,reference,user_id,product,total_minor,supplier_minor) VALUES($1,'MT-SYNTHETIC','synthetic-customer','FLIGHT',50000,45000)",[orderId]);
  await db.query("INSERT INTO payments(id,order_id,gateway_order_id,amount_minor,status) VALUES($1,$2,'synthetic-test-payment',50000,'CAPTURED')",[paymentId,orderId]);
  const ordinaryIds:string[]=[];
  for(let i=0;i<16;i++){
    const id=randomUUID();ordinaryIds.push(id);
    await db.query('INSERT INTO outbox_events(id,aggregate_id,event_type,payload,delivery_payload,attempts) VALUES($1,$2,$3,$4::jsonb,$5,$6)',[id,orderId,['booking.confirmed','booking.cancelled','payment.captured','refund.completed'][i%4],JSON.stringify({synthetic:true,index:i}),JSON.stringify({doNotSend:true,index:i}),i%3]);
  }
  const oldIds:string[]=[];
  for(const delivered of [false,true]){
    const id=randomUUID(),event=randomUUID();oldIds.push(event);
    await db.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload,delivery_payload,delivered_at) VALUES($1,$2,'enquiry.created','{}',$3,CASE WHEN $4 THEN now() ELSE NULL END)",[event,id,JSON.stringify({schemaVersion:1,oldDestination:true}),delivered]);
    await db.query("INSERT INTO travel_enquiries(id,reference,user_id,request_key,body_hash,service,draft,contact,crm_event_id,crm_reference) VALUES($1,$2,'synthetic-legacy',$3,$4,'VISA','{}','{}',$5,$6)",[id,'ME-'+id.replaceAll('-','').slice(0,12).toUpperCase(),randomUUID(),'a'.repeat(64),event,delivered?'OLD-CASE-1':null]);
  }
  const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const heldEvents=async()=>digest((await db.query('SELECT to_jsonb(o) AS row FROM outbox_events o WHERE id=ANY($1::uuid[]) ORDER BY id',[[...ordinaryIds,...oldIds]])).rows);
  const legacyRows=async()=>digest((await db.query("SELECT to_jsonb(e)-'crm_receiver'-'crm_environment' AS row FROM travel_enquiries e WHERE user_id='synthetic-legacy' ORDER BY id")).rows);
  const business=async()=>digest({orders:(await db.query('SELECT to_jsonb(o) AS row FROM orders o ORDER BY id')).rows,payments:(await db.query('SELECT to_jsonb(p) AS row FROM payments p ORDER BY id')).rows,refunds:(await db.query('SELECT * FROM refunds')).rows,notifications:(await db.query('SELECT * FROM customer_notifications')).rows});
  const original={events:await heldEvents(),legacy:await legacyRows(),business:await business()};
  await db.exec(await readFile('db/025-safar-enquiry-destination.sql','utf8'));
  assert.equal(await heldEvents(),original.events);assert.equal(await legacyRows(),original.legacy);assert.equal(await business(),original.business);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM travel_enquiries WHERE crm_receiver IS NULL AND crm_environment IS NULL')).rows[0].n,2);
  assert.equal((await db.query(claimSafarEnquirySql,[randomUUID()])).rows.length,0,'Sixteen ordinary events and old enquiries cannot enter the Safar queue');

  const {saveEnquiry}=await saveLibrary();
  const transaction=((run:Parameters<NonNullable<Parameters<typeof saveEnquiry>[2]>>[0])=>db.transaction(async tx=>run({query:async(sql:string,values:unknown[])=>{const result=await tx.query(sql,values);return {rows:result.rows,rowCount:result.affectedRows??result.rows.length};}} as never))) as Parameters<typeof saveEnquiry>[2];
  const input:EnquirySubmission={requestId:randomUUID(),consent:true,draft:{service:'VISA',destination:'Synthetic destination',travelWindow:'December 2030',adults:1,childAges:[],nationality:'Indian',purpose:'Tourism'},contact:{name:'Synthetic customer',email:'synthetic@example.test',preferredChannel:'EMAIL'}};
  const actor={userId:'synthetic-owner',companyId:null};
  process.env.SAFAR_ENQUIRY_MODE='test';const testReceipt=await saveEnquiry(actor,input,transaction);
  process.env.SAFAR_ENQUIRY_MODE='live';const liveReceipt=await saveEnquiry(actor,{...input,requestId:randomUUID()},transaction);
  assert.deepEqual(await saveEnquiry(actor,input,transaction),testReceipt,'Replaying a test enquiry after live configuration preserves test mode');
  assert.equal(testReceipt.crmEnvironment,'test');assert.equal(liveReceipt.crmEnvironment,'live');
  const newEvents=(await db.query<{schema_version:number;delivery_payload:string;crm_environment:string}>('SELECT o.schema_version,o.delivery_payload,e.crm_environment FROM outbox_events o JOIN travel_enquiries e ON e.crm_event_id=o.id WHERE e.crm_receiver=$1',['safar'])).rows;
  for(const event of newEvents){assert.equal(event.schema_version,2);assert.equal(JSON.parse(event.delivery_payload).schemaVersion,2);assert.equal(JSON.parse(event.delivery_payload).environment,event.crm_environment);}
  const firstLease=randomUUID(),first=(await db.query<SafarEnquiryJob>(claimSafarEnquirySql,[firstLease])).rows[0];assert(first);
  const frozen=frozenSafarEnquiry(first);assert.equal(frozen.body,first.delivery_payload);assert.equal(frozen.environment,first.crm_environment);
  assert.throws(()=>frozenSafarEnquiry({...first,crm_environment:frozen.environment==='test'?'live':'test'}),/identity/);
  assert.throws(()=>frozenSafarEnquiry({...first,delivery_payload:JSON.stringify({...JSON.parse(frozen.body),schemaVersion:1})}),/identity/);
  assert.throws(()=>frozenSafarEnquiry({...first,delivery_payload:'x'.repeat(65537)}),/bounded/);
  await db.query("UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1",[first.id]);
  const recordId=randomUUID(),ack=[first.id,firstLease,frozen.reference,recordId,frozen.environment];
  assert.equal((await db.query(recordSafarEnquirySql,ack)).affectedRows,0,'An expired lease cannot acknowledge even before reclamation');
  assert.equal((await db.query(deferSafarEnquirySql,[first.id,firstLease,20])).affectedRows,0,'An expired lease cannot change retry state');
  const nextLease=randomUUID(),reclaimed=(await db.query<SafarEnquiryJob>(claimSafarEnquirySql,[nextLease])).rows[0];assert.equal(reclaimed.id,first.id);
  assert.equal((await db.query(recordSafarEnquirySql,ack)).affectedRows,0,'A replaced lease cannot acknowledge');
  assert.equal((await db.query(deferSafarEnquirySql,[first.id,firstLease,20])).affectedRows,0,'A replaced lease cannot defer');
  assert.equal((await db.query(recordSafarEnquirySql,[first.id,nextLease,frozen.reference,recordId,frozen.environment==='test'?'live':'test'])).affectedRows,0,'A mismatched environment cannot be marked delivered');
  assert.equal((await db.query(recordSafarEnquirySql,[first.id,nextLease,frozen.reference,recordId,frozen.environment])).affectedRows,1);
  const saved=(await db.query<{crm_reference:string;crm_lead_id:string}>('SELECT crm_reference,crm_lead_id FROM travel_enquiries WHERE id=$1',[first.aggregate_id])).rows[0];assert.deepEqual(saved,{crm_reference:frozen.reference,crm_lead_id:recordId});
  assert.equal((await db.query(deferSafarEnquirySql,[first.id,nextLease,20])).affectedRows,0,'A delivered event cannot be deferred');
  for(let attempt=0;attempt<12;attempt++){
    const lease=randomUUID(),job=(await db.query<SafarEnquiryJob>(claimSafarEnquirySql,[lease])).rows[0];assert(job);assert.equal(job.attempts,attempt);
    assert.equal((await db.query(deferSafarEnquirySql,[job.id,lease,20])).affectedRows,1);
    assert.equal((await db.query(claimSafarEnquirySql,[randomUUID()])).rows.length,0,'Retry backoff is respected');
    await db.query("UPDATE outbox_events SET next_attempt=now()-interval '1 second' WHERE id=$1",[job.id]);
  }
  assert.equal((await db.query(claimSafarEnquirySql,[randomUUID()])).rows.length,0,'Twelve failed attempts require explicit staff review');
  assert.equal(await heldEvents(),original.events,'Every ordinary booking/payment/refund event and old enquiry remained byte-for-byte unchanged');
  assert.equal(await legacyRows(),original.legacy);assert.equal(await business(),original.business,'Existing booking, payment, refund and notification records were untouched');
});
