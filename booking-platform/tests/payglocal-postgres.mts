import {seal} from "../src/lib/vault";
import {flightTravelSource} from "./fixtures/payglocal-travel";
/** Disposable local PostgreSQL verification only. Never reads DATABASE_URL.
 * Run: TEST_DATABASE_URL=postgresql://...@127.0.0.1:PORT/payglocal_disposable
 * node --conditions=react-server --import ./scripts/standalone-server.mjs --import tsx tests/payglocal-postgres.mts
 * Uses real SQL/transactions and fake normalized provider responses, not payments.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {Pool,type PoolClient} from "pg";
import {reservePayGlocalAttempt,persistPayGlocalInitiation,recordPayGlocalVerifiedStatus,markPayGlocalUnknown} from "../src/lib/payglocal-payment";
import {persistGatewayOrder} from "../src/lib/payment-intent";
import type {PayGlocalVerifiedStatus} from "../src/lib/providers/payglocal";
import {generateKeyPairSync,createHash,verify,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import {compactDecrypt} from 'jose';
import type * as Runtime from '../src/lib/payglocal-runtime';
import type * as RefundRuntime from '../src/lib/refund-runner';
import {enqueuePayGlocalWebhook,payGlocalWebhookHint} from '../src/lib/payglocal-webhook';
import {recordPayGlocalSettlement} from '../src/lib/payglocal-settlement';

const input=process.env.TEST_DATABASE_URL;
if(!input)throw Error("Explicit TEST_DATABASE_URL for a disposable loopback database is required.");
const url=new URL(input);
if(!["postgres:","postgresql:"].includes(url.protocol)||!["127.0.0.1","[::1]"].includes(url.hostname)||url.pathname!=="/payglocal_disposable"||url.search||url.hash)throw Error("Test database must be loopback-only named payglocal_disposable, without URL options.");
const schema=`payglocal_test_${randomUUID().replaceAll("-", "")}`;
const pool=new Pool({connectionString:input,max:12,connectionTimeoutMillis:5000,statement_timeout:10000});
let created=false;
const originalVaultKey=process.env.TRAVELLER_ENCRYPTION_KEY;process.env.TRAVELLER_ENCRYPTION_KEY=randomBytes(32).toString('hex');
const fixtureBilling={firstName:'Payer',lastName:'Example',emailId:'payer@example.test',addressCountry:'IND',addressStreet1:'Synthetic street',addressCity:'Mumbai',addressState:'Maharashtra'};
async function transaction<T>(run:(tx:PoolClient)=>Promise<T>){
 const tx=await pool.connect();
 try{await tx.query("BEGIN");await tx.query(`SET LOCAL search_path TO ${schema}, public`);const result=await run(tx);await tx.query("COMMIT");return result;}
 catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
async function rows(sql:string,values:unknown[]=[]){return transaction(async tx=>(await tx.query(sql,values)).rows);}
async function seedOrder(){
 const orderId=randomUUID(),searchId=randomUUID(),quoteId=randomUUID(),travel=flightTravelSource();
 await transaction(async tx=>{
  await tx.query("INSERT INTO supplier_searches(id,user_id,product,criteria,results,correlation_id,expires_at) VALUES($1,'test-user','FLIGHT',$3,'{}',$2,now()+interval '1 hour')",[searchId,randomUUID(),travel.criteria]);
  await tx.query("INSERT INTO supplier_quotes(id,search_id,user_id,product,selection,review,supplier_booking_id,supplier_minor,total_minor,expires_at,fare_validation_state) VALUES($1,$2,'test-user','FLIGHT','{}',$4,$3,9000,10000,now()+interval '1 hour','SUCCEEDED')",[quoteId,searchId,`supplier-${orderId}`,travel.review]);
  await tx.query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor,quote_id,guests_encrypted) VALUES($1,$2,'test-user','FLIGHT','PAYMENT_PENDING',10000,9000,$3,$4)",[orderId,`MT-${orderId}`,quoteId,seal({billingData:fixtureBilling,email:"guest@example.test",phone:"9000000000",travellers:[{ti:"Mr",pt:"ADULT",fN:"Test",lN:"Traveller"}]},orderId)]);
 });return orderId;
}
async function prepare(orderId:string):Promise<PayGlocalVerifiedStatus>{
 const {attempt}=await transaction(tx=>reservePayGlocalAttempt(tx,orderId,"testmerchant"));
 const gid=`g${randomUUID().replaceAll("-", "")}`;
 const status:PayGlocalVerifiedStatus={source:"SERVER_STATUS",merchantTxnId:attempt.merchantTxnId,merchantId:attempt.merchantId,gid,totalAmount:"100.00",txnCurrency:"INR",status:"SENT_FOR_CAPTURE"};
 await transaction(tx=>persistPayGlocalInitiation(tx,orderId,{...status,redirectUrl:"https://api.uat.payglocal.in/gl/payflow-ui/?token=test",statusUrl:`https://api.uat.payglocal.in/gl/v1/payments/${gid}/status`}));
 return status;
}
async function counts(id:string){return (await rows("SELECT (SELECT count(*)::int FROM booking_jobs WHERE order_id=$1) AS jobs,(SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1 AND event_type='payment.captured') AS events",[id]))[0];}
try{
 await pool.query(`CREATE SCHEMA ${schema}`);created=true;
 const migrations=(await readdir(new URL("../db/",import.meta.url))).filter(name=>/^0(0[1-9]|1[0-5])-.*\.sql$/.test(name)).sort();
 assert.equal(migrations.length,15);
 await transaction(async tx=>{for(const name of migrations)await tx.query(await readFile(new URL(`../db/${name}`,import.meta.url),"utf8"));});
 const historical=await seedOrder();
 await transaction(async tx=>{
  await tx.query("INSERT INTO gateway_intents(order_id,state,gateway_order_id) VALUES($1,'CREATED','order_historical')",[historical]);
  await tx.query("INSERT INTO payments(id,order_id,gateway_order_id,amount_minor) VALUES($1,$2,'order_historical',10000)",[randomUUID(),historical]);
  await tx.query(await readFile(new URL("../db/016-payglocal.sql",import.meta.url),"utf8"));
  await tx.query(await readFile(new URL("../db/017-payglocal-recovery.sql",import.meta.url),"utf8"));
  await tx.query(await readFile(new URL("../db/018-payglocal-webhooks.sql",import.meta.url),"utf8"));
 });
 assert.deepEqual(await rows("SELECT p.provider AS payment,g.provider AS intent FROM payments p JOIN gateway_intents g ON g.order_id=p.order_id WHERE p.order_id=$1",[historical]),[{payment:"RAZORPAY",intent:"RAZORPAY"}]);
 console.log("PASS migrations 001–018 and historical Razorpay provider defaults");
 const id=await seedOrder();
 const reservations=await Promise.all(Array.from({length:8},()=>transaction(tx=>reservePayGlocalAttempt(tx,id,"testmerchant"))));
 assert.equal(reservations.filter(r=>r.created).length,1);assert.equal(new Set(reservations.map(r=>r.attempt.merchantTxnId)).size,1);
 assert.equal((await rows("SELECT count(*)::int AS n FROM payglocal_attempts WHERE order_id=$1",[id]))[0].n,1);
 console.log("PASS eight concurrent reservations create one stable attempt");
 const status=await prepare(id);
 const hint=payGlocalWebhookHint({merchantId:status.merchantId,merchantTxnId:status.merchantTxnId,gid:status.gid,amount:'100.00',currency:'INR',status:'SENT_FOR_CAPTURE'},status.merchantId)!;
 await rows("UPDATE payglocal_attempts SET next_check=now()+interval '1 hour' WHERE order_id=$1",[id]);
 for(const patch of [{amountMinor:'9999'},{currency:'USD'},{merchantId:'foreign'},{merchantTxnId:'foreign'},{gid:'gl_foreign'}])await transaction(tx=>enqueuePayGlocalWebhook(tx,{...hint,...patch}));
 assert.equal((await rows('SELECT next_check>now() AS future,webhook_received_at IS NULL AS untouched FROM payglocal_attempts WHERE order_id=$1',[id]))[0].untouched,true);
 await Promise.all(Array.from({length:8},()=>transaction(tx=>enqueuePayGlocalWebhook(tx,hint))));
 assert.equal((await rows('SELECT next_check<=now() AS due FROM payglocal_attempts WHERE order_id=$1',[id]))[0].due,true);
 assert.deepEqual(await counts(id),{jobs:0,events:0});assert.equal((await rows('SELECT status FROM payments WHERE order_id=$1',[id]))[0].status,'CREATED');
 await rows("UPDATE payglocal_attempts SET next_check=now()+interval '1 hour' WHERE order_id=$1",[id]);await transaction(tx=>enqueuePayGlocalWebhook(tx,hint));
 assert.equal((await rows('SELECT next_check>now() AS future FROM payglocal_attempts WHERE order_id=$1',[id]))[0].future,true);
 console.log('PASS webhooks: wrong bindings ignored; concurrent delivery schedules one durable hint without capture; replay cannot accelerate status polling');

 for(const patch of [{totalAmount:"99.99"},{txnCurrency:"USD"},{merchantTxnId:"other"},{merchantId:"other"},{gid:"other"},{source:"CALLBACK"}])await assert.rejects(transaction(tx=>recordPayGlocalVerifiedStatus(tx,id,{...status,...patch} as PayGlocalVerifiedStatus)));
 assert.deepEqual(await counts(id),{jobs:0,events:0});
 await assert.rejects(transaction(tx=>reservePayGlocalAttempt(tx,historical,"testmerchant")));
 await assert.rejects(transaction(tx=>persistGatewayOrder(tx,id,{id:"order_other",amount:10000,currency:"INR"},"CREATE")));
 console.log("PASS wrong identity/forged callback and cross-provider operations reject without jobs/outbox");
 await transaction(tx=>markPayGlocalUnknown(tx,id));
 const captures=await Promise.all(Array.from({length:8},()=>transaction(tx=>recordPayGlocalVerifiedStatus(tx,id,status))));
 assert.equal(captures.filter(r=>!r.duplicate).length,1);assert.deepEqual(await counts(id),{jobs:1,events:1});
 assert.equal((await rows("SELECT status FROM orders WHERE id=$1",[id]))[0].status,"PAID");
 await transaction(tx=>recordPayGlocalVerifiedStatus(tx,id,{...status,status:"FAILED"}));await transaction(tx=>markPayGlocalUnknown(tx,id));
 assert.equal((await rows("SELECT state FROM payglocal_attempts WHERE order_id=$1",[id]))[0].state,"CAPTURED");
 console.log("PASS timeout→eight concurrent captures, one paid/job/outbox transition; late failure cannot reverse");
 const rollbackId=await seedOrder(),rollbackStatus=await prepare(rollbackId);
 await transaction(async tx=>{
  await tx.query(`CREATE FUNCTION reject_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END; $$`);
  await tx.query("CREATE TRIGGER reject_test_outbox BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_test_outbox()");
 });
 await assert.rejects(transaction(tx=>recordPayGlocalVerifiedStatus(tx,rollbackId,rollbackStatus)));
 assert.deepEqual(await counts(rollbackId),{jobs:0,events:0});
 assert.equal((await rows("SELECT status FROM orders WHERE id=$1",[rollbackId]))[0].status,"PAYMENT_PENDING");
 assert.equal((await rows("SELECT state FROM payglocal_attempts WHERE order_id=$1",[rollbackId]))[0].state,"PENDING");
 assert.equal((await rows("SELECT status FROM payments WHERE order_id=$1",[rollbackId]))[0].status,"CREATED");
 await transaction(tx=>tx.query("DROP TRIGGER reject_test_outbox ON outbox_events; DROP FUNCTION reject_test_outbox()"));
 await transaction(tx=>recordPayGlocalVerifiedStatus(tx,rollbackId,rollbackStatus));assert.deepEqual(await counts(rollbackId),{jobs:1,events:1});
 console.log("PASS real outbox SQL failure rolls back payment/order/job atomically; reconciliation succeeds once");
 const lateId=await seedOrder(),lateStatus=await prepare(lateId);
 await rows("UPDATE orders SET status='BOOKING_FAILED' WHERE id=$1",[lateId]);
 await transaction(tx=>recordPayGlocalVerifiedStatus(tx,lateId,lateStatus));
 assert.equal((await rows("SELECT status FROM orders WHERE id=$1",[lateId]))[0].status,"MANUAL_REVIEW");assert.deepEqual(await counts(lateId),{jobs:0,events:1});
 assert.deepEqual(await rows("SELECT provider,status,gateway_order_id FROM payments WHERE order_id=$1",[historical]),[{provider:"RAZORPAY",status:"CREATED",gateway_order_id:"order_historical"}]);
 console.log("PASS late success enters manual review without rebooking; historical Razorpay record unchanged");
 // Real RSA/JWE transport + real transactional storage, entirely isolated from
 // the provider. Verify concurrent create/capture and a lost initiate response.
 const envNames=['PAYGLOCAL_ENV','PAYGLOCAL_MERCHANT_ID','PAYGLOCAL_PRIVATE_KEY_ID','PAYGLOCAL_PUBLIC_KEY_ID','PAYGLOCAL_PRIVATE_KEY','PAYGLOCAL_PUBLIC_KEY','BETTER_AUTH_URL','PAYMENT_PROVIDER'];const previous=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
 const originalFetch=globalThis.fetch,merchant=generateKeyPairSync('rsa',{modulusLength:2048}),gateway=generateKeyPairSync('rsa',{modulusLength:2048});
 const harness=globalThis as typeof globalThis&{__payglocalHarness?:unknown};
 try{
  Object.assign(process.env,{PAYGLOCAL_ENV:'UAT',PAYMENT_PROVIDER:'PAYGLOCAL',PAYGLOCAL_MERCHANT_ID:'runtimefixture',PAYGLOCAL_PRIVATE_KEY_ID:'signing',PAYGLOCAL_PUBLIC_KEY_ID:'encryption',PAYGLOCAL_PRIVATE_KEY:merchant.privateKey.export({type:'pkcs8',format:'pem'}).toString(),PAYGLOCAL_PUBLIC_KEY:gateway.publicKey.export({type:'spki',format:'pem'}).toString(),BETTER_AUTH_URL:'https://booking.example.test'});
  harness.__payglocalHarness={db:{query:(sql:string,values:unknown[])=>transaction(tx=>tx.query(sql,values))},transaction};
  // Only the isolated synthetic transport/SQL fixture replaces the missing
  // travel contract. The shipped runtime has no bypass flag.
  const compile=async(syntheticContract=false)=>build({stdin:{contents:"export * from './src/lib/payglocal-runtime';export {executeRefund} from './src/lib/refund-runner';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,external:['jose','payglocal-js-client','payglocal-js-client/*'],plugins:[{name:'isolated-boundaries',setup(p){p.onResolve({filter:/^(?:\.\/db|@\/lib\/db)$/},()=>({path:'db',namespace:'isolated'}));if(syntheticContract)p.onResolve({filter:/payglocal-travel-contract$/},()=>({path:'contract-fixture',namespace:'isolated'}));p.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'isolated'}));p.onLoad({filter:/.*/,namespace:'isolated'},arg=>({contents:arg.path==='empty'?'':arg.path==='contract-fixture'?'export function assertPayGlocalTravelContract(){}':'export const database=()=>globalThis.__payglocalHarness.db; export const transaction=globalThis.__payglocalHarness.transaction;'}));}}]});
  const blocked=await compile();const blockedModule={exports:{} as typeof Runtime};new Function('module','exports','require',blocked.outputFiles[0].text)(blockedModule,blockedModule.exports,createRequire(path.resolve('package.json')));
  const blockedOrder=await seedOrder();globalThis.fetch=async()=>{throw Error('Blocked checkout must not contact the provider');};
  await assert.rejects(()=>blockedModule.exports.createPayGlocalCheckout(blockedOrder,'FLIGHT',{firstName:'Payer',lastName:'Example',emailId:'payer@example.test',addressCountry:'IND'}),{status:503});
  assert.equal((await rows('SELECT count(*)::int AS n FROM payglocal_attempts WHERE order_id=$1',[blockedOrder]))[0].n,0);
  console.log('PASS complete synthetic UAT keys cannot bypass merchant confirmation gates: no attempt or provider call');
  const dueTimes=await rows('SELECT order_id,next_check FROM payglocal_attempts');
  await rows("UPDATE payglocal_attempts SET next_check=now()+interval '1 day'");
  const savedMerchant=process.env.PAYGLOCAL_MERCHANT_ID;delete process.env.PAYGLOCAL_MERCHANT_ID;
  try{await blockedModule.exports.runPayGlocalPaymentJob();}finally{process.env.PAYGLOCAL_MERCHANT_ID=savedMerchant;for(const item of dueTimes)await rows('UPDATE payglocal_attempts SET next_check=$2 WHERE order_id=$1',[item.order_id,item.next_check]);}
  console.log('PASS idle payment worker requires no merchant credentials and makes no provider call');
  const compiled=await compile(true);
  const compiledModule={exports:{} as typeof Runtime&typeof RefundRuntime};new Function('module','exports','require',compiled.outputFiles[0].text)(compiledModule,compiledModule.exports,createRequire(path.resolve('package.json')));const runtime=compiledModule.exports;
  const remote=new Map<string,{gid:string;status:string}>(),remoteRefunds=new Map<string,{gid:string;originalGid:string;amount:string}>();let initiations=0,statusChecks=0,loseResponse=false,refundPosts=0,loseRefundResponse=false;
  globalThis.fetch=async(url,init)=>{
   const endpoint=new URL(String(url));assert.equal(endpoint.origin,'https://api.uat.payglocal.in');assert.equal(init?.redirect,'error');const signed=(init?.headers as Record<string,string>)['X-GL-TOKEN-EXTERNAL'].split('.');assert(verify('RSA-SHA256',Buffer.from(signed[0]+'.'+signed[1]),merchant.publicKey,Buffer.from(signed[2],'base64url')));assert.equal(JSON.parse(Buffer.from(signed[1],'base64url').toString()).digest,createHash('sha256').update(String(init?.body??'')).digest('base64'));
   if(endpoint.pathname.endsWith('/initiate/paycollect')){
    assert.equal((init?.headers as Record<string,string>)['Content-Type'],'text/plain');initiations++;const clear=await compactDecrypt(String(init?.body),gateway.privateKey),payload=JSON.parse(Buffer.from(clear.plaintext).toString());assert.equal(payload.paymentData.totalAmount,'100.00');assert.equal(payload.paymentData.billingData.emailId,'payer@example.test');assert.equal(payload.riskData.flightData[0].legData[0].departureDate,'2027-01-10T04:30:00Z');assert.equal(payload.riskData.flightData[0].passengerData[0].firstName,'Test');assert.ok(!("ticketNumber" in payload.riskData.flightData[0]));assert.equal(payload.merchantCallbackURL,'https://booking.example.test/api/payments/payglocal/return'+(loseResponse?'?app=1':''));const gid='gl_'+randomUUID().replaceAll('-','');remote.set(payload.merchantTxnId,{gid,status:'INPROGRESS'});if(loseResponse)throw Error('Simulated connection loss after provider acceptance');return Response.json({gid,status:'INPROGRESS',data:{merchantTxnId:payload.merchantTxnId,redirectUrl:'https://api.uat.payglocal.in/gl/payflow-ui/?x-gl-token=synthetic',statusUrl:`https://api.uat.payglocal.in/gl/v1/payments/${gid}/status?x-gl-token=synthetic`}});
   }
   const reference=endpoint.pathname.split('/').at(-2);
   if(endpoint.pathname.endsWith('/refund')){refundPosts++;const clear=await compactDecrypt(String(init?.body),gateway.privateKey),payload=JSON.parse(Buffer.from(clear.plaintext).toString());assert.equal(payload.refundType,'P');const item={gid:'gl_refund_'+randomUUID().replaceAll('-',''),originalGid:reference!,amount:payload.paymentData.totalAmount};remoteRefunds.set(payload.merchantTxnId,item);if(loseRefundResponse)throw Error('Simulated lost refund acknowledgement');return Response.json({gid:item.gid,status:'SENT_FOR_REFUND',data:{gid:item.gid,originalGid:item.originalGid,refundAmount:item.amount,status:'SENT_FOR_REFUND'}});}
   const refund=[...remoteRefunds.entries()].find(([muid,item])=>muid===reference||item.gid===reference);if(refund)return Response.json({gid:'gl_status_request',status:'SENT_FOR_REFUND',data:{gid:refund[1].gid,merchantTxnId:refund[0],originalGid:refund[1].originalGid,refundAmount:refund[1].amount,status:'SENT_FOR_REFUND'}});
   statusChecks++;const item=[...remote.entries()].find(([muid,item])=>muid===reference||item.gid===reference);assert(item);return Response.json({gid:'gl_status_request',status:item[1].status,data:{gid:item[1].gid,merchantTxnId:item[0],Amount:'100.00',Currency:'INR',status:item[1].status}});
  };
  const billing=fixtureBilling;
  const checkout=await seedOrder();const creations=await Promise.allSettled(Array.from({length:8},()=>runtime.createPayGlocalCheckout(checkout,'FLIGHT',billing)));assert(creations.some(r=>r.status==='fulfilled'),JSON.stringify(creations.map(r=>r.status==='rejected'?{name:r.reason?.name,message:r.reason?.message}:{status:r.status})));assert.equal(initiations,1);await runtime.createPayGlocalCheckout(checkout,'FLIGHT',billing);assert.equal(initiations,1);
  for(const item of remote.values())item.status='SENT_FOR_CAPTURE';await rows('UPDATE payglocal_attempts SET next_check=now() WHERE order_id=$1',[checkout]);await Promise.all(Array.from({length:8},()=>runtime.synchronizePayGlocalPayment(checkout)));assert.equal(statusChecks,1);assert.deepEqual(await counts(checkout),{jobs:1,events:1});
  loseResponse=true;const interrupted=await seedOrder();await assert.rejects(()=>runtime.createPayGlocalCheckout(interrupted,'FLIGHT',billing,'APP'));assert.equal(initiations,2);for(const item of remote.values())item.status='SENT_FOR_CAPTURE';const lost=(await rows('SELECT merchant_txn_id FROM payglocal_attempts WHERE order_id=$1',[interrupted]))[0];const lostRemote=remote.get(lost.merchant_txn_id)!;await transaction(tx=>enqueuePayGlocalWebhook(tx,payGlocalWebhookHint({merchantId:'runtimefixture',merchantTxnId:lost.merchant_txn_id,gid:lostRemote.gid,amount:'100.00',currency:'INR',status:'SENT_FOR_CAPTURE'})!));process.env.PAYMENT_PROVIDER='RAZORPAY';await runtime.runPayGlocalPaymentJob();process.env.PAYMENT_PROVIDER='PAYGLOCAL';assert.deepEqual(await counts(interrupted),{jobs:1,events:1});assert.equal(initiations,2);await assert.rejects(()=>runtime.createPayGlocalCheckout(interrupted,'FLIGHT',billing,'APP'));assert.equal(initiations,2);
  console.log('PASS real RSA transport + SQL: one initiate across concurrent browsers, leased capture exactly once, lost response recovered by merchant reference without re-initiation');
  await rows("UPDATE orders SET status='BOOKING_FAILED' WHERE id=$1",[checkout]);const capturedPayment=(await rows('SELECT id FROM payments WHERE order_id=$1',[checkout]))[0].id;
  const seedRefund=async(amount:number)=>{const id=randomUUID();await rows("INSERT INTO refunds(id,payment_id,amount_minor,status) VALUES($1,$2,$3,'APPROVED')",[id,capturedPayment,amount]);return id;};
  const refund=await seedRefund(2000);await Promise.allSettled(Array.from({length:8},()=>runtime.executeRefund(refund)));assert.equal(refundPosts,1);assert.equal((await rows('SELECT status FROM refunds WHERE id=$1',[refund]))[0].status,'PROCESSING');await rows('UPDATE refunds SET next_check=now() WHERE id=$1',[refund]);await runtime.executeRefund(refund);assert.equal(refundPosts,1);assert.equal((await rows("SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1 AND event_type='refund.updated'",[checkout]))[0].n,1);
  const refundAttempt=(await rows('SELECT * FROM payglocal_refund_attempts WHERE refund_id=$1',[refund]))[0];await rows("UPDATE refunds SET next_check=now()+interval '1 hour' WHERE id=$1",[refund]);
  const refundHint=payGlocalWebhookHint({merchantId:'runtimefixture',merchantTxnId:refundAttempt.merchant_txn_id,gid:refundAttempt.gid,amount:'20.00',currency:'INR',status:'REFUNDED'})!;
  await transaction(tx=>enqueuePayGlocalWebhook(tx,{...refundHint,amountMinor:'2001'}));assert.equal((await rows('SELECT next_check>now() AS future FROM refunds WHERE id=$1',[refund]))[0].future,true);
  await transaction(tx=>enqueuePayGlocalWebhook(tx,refundHint));assert.equal((await rows('SELECT next_check<=now() AS due FROM refunds WHERE id=$1',[refund]))[0].due,true);
  await runtime.executeRefund(refund);assert.equal((await rows('SELECT status FROM refunds WHERE id=$1',[refund]))[0].status,'PROCESSING');assert.equal(refundPosts,1);
  console.log('PASS refund webhook schedules original authenticated status read; forged REFUNDED claim cannot settle a refund');
  await rows("UPDATE payglocal_refund_attempts SET webhook_received_at=now()-interval '61 seconds' WHERE refund_id=$1",[refund]);
  let wake:Promise<void>|undefined;
  await transaction(async finance=>{
   await finance.query('SELECT id FROM refunds WHERE id=$1 FOR UPDATE',[refund]);
   let reportPid!:(pid:number)=>void;const pidReady=new Promise<number>(resolve=>{reportPid=resolve;});
   wake=transaction(async tx=>{reportPid((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await enqueuePayGlocalWebhook(tx,refundHint);});
   const pid=await pidReady;const deadline=Date.now()+3000;
   while(!(await rows('SELECT cardinality(pg_blocking_pids($1::int))>0 AS blocked',[pid]))[0].blocked){if(Date.now()>deadline)throw Error('Webhook did not reach the controlled refund lock');await new Promise(resolve=>setTimeout(resolve,10));}
   // A webhook waiting for the refund must not already own its attempt lock.
   await finance.query('SELECT refund_id FROM payglocal_refund_attempts WHERE refund_id=$1 FOR UPDATE NOWAIT',[refund]);
  });await wake;
  console.log('PASS webhook/finance lock order: concurrent webhook cannot hold the attempt while waiting for a locked refund');

  loseRefundResponse=true;const interruptedRefund=await seedRefund(1000);await assert.rejects(()=>runtime.executeRefund(interruptedRefund));assert.equal(refundPosts,2);await rows('UPDATE refunds SET next_check=now() WHERE id=$1',[interruptedRefund]);await runtime.executeRefund(interruptedRefund);assert.equal(refundPosts,2);assert.equal((await rows('SELECT status FROM refunds WHERE id=$1',[interruptedRefund]))[0].status,'PROCESSING');assert.equal((await rows("SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1 AND event_type='refund.updated'",[checkout]))[0].n,2);
  const overCapture=await seedRefund(8000);await assert.rejects(()=>runtime.executeRefund(overCapture));assert.equal(refundPosts,2);assert.equal((await rows('SELECT status FROM refunds WHERE id=$1',[overCapture]))[0].status,'APPROVED');assert.equal((await rows("SELECT count(*)::int AS n FROM customer_notifications WHERE order_id=$1 AND status='REFUND_COMPLETED'",[checkout]))[0].n,0);
  console.log('PASS refunds: concurrent execution posts once, lost acknowledgement recovers without re-posting, capture ceiling enforced, SENT_FOR_REFUND remains processing with one CRM event per refund');
  await rows("UPDATE refunds SET status='FAILED' WHERE id=$1",[overCapture]);
  const evidence={requestId:randomUUID(),acceptedAmountMinor:2000,gatewayRefundId:(await rows('SELECT gateway_refund_id FROM refunds WHERE id=$1',[refund]))[0].gateway_refund_id,bankReference:'SYNTHETIC-SETTLEMENT-001',settledOn:new Date().toISOString().slice(0,10),note:'Synthetic checked evidence for isolated test only.',attested:true as const};
  await rows("UPDATE refunds SET requested_by='requester-test' WHERE id=$1",[refund]);await assert.rejects(transaction(tx=>recordPayGlocalSettlement(tx,refund,{...evidence,attested:false} as unknown as typeof evidence,'finance-test')));await assert.rejects(transaction(tx=>recordPayGlocalSettlement(tx,refund,{...evidence,acceptedAmountMinor:1999},'finance-test')));
  await transaction(async tx=>{await tx.query("CREATE FUNCTION reject_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END; $$");await tx.query('CREATE TRIGGER reject_test_outbox BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_test_outbox()');});
  await assert.rejects(transaction(tx=>recordPayGlocalSettlement(tx,refund,evidence,'finance-test')));assert.equal((await rows('SELECT status FROM refunds WHERE id=$1',[refund]))[0].status,'PROCESSING');assert.equal((await rows('SELECT count(*)::int AS n FROM payglocal_refund_settlements WHERE refund_id=$1',[refund]))[0].n,0);await transaction(tx=>tx.query('DROP TRIGGER reject_test_outbox ON outbox_events; DROP FUNCTION reject_test_outbox()'));
  await rows('UPDATE refunds SET next_check=now() WHERE id=$1',[refund]);
  let signal!:()=>void,release!:()=>void;const arrived=new Promise<void>(resolve=>{signal=resolve;}),released=new Promise<void>(resolve=>{release=resolve;}),mockFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/'+evidence.gatewayRefundId+'/status')){signal();await released;}return mockFetch(url,init);};
  const checking=runtime.executeRefund(refund);await Promise.race([arrived,checking.then(()=>{throw Error("Reconciliation did not reach the expected status read");})]);
  try{assert.equal((await transaction(tx=>recordPayGlocalSettlement(tx,refund,evidence,'finance-test'))).duplicate,false);}finally{release();}
  assert.equal((await checking).status,'COMPLETED');globalThis.fetch=mockFetch;
  assert.equal((await transaction(tx=>recordPayGlocalSettlement(tx,refund,evidence,'finance-test'))).duplicate,true);await assert.rejects(transaction(tx=>recordPayGlocalSettlement(tx,refund,{...evidence,note:'Changed evidence cannot replace the recorded proof.'},'finance-test')));assert.equal((await rows("SELECT count(*)::int AS n FROM customer_notifications WHERE order_id=$1 AND status='REFUND_COMPLETED'",[checkout]))[0].n,1);assert.equal(refundPosts,2);
  console.log('PASS checked finance settlement: explicit attestation/amount guards, SQL failure rolls back evidence and notification, exact retry completes once without another provider request');
 }finally{globalThis.fetch=originalFetch;delete harness.__payglocalHarness;for(const name of envNames){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
 console.log("PASS all disposable PostgreSQL checks (synthetic encrypted provider; no external provider requests)");
}finally{
 if(originalVaultKey===undefined)delete process.env.TRAVELLER_ENCRYPTION_KEY;else process.env.TRAVELLER_ENCRYPTION_KEY=originalVaultKey;
 try{if(created)await pool.query(`DROP SCHEMA ${schema} CASCADE`);}finally{await pool.end();}
}
