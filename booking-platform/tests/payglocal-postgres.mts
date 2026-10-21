/** Disposable local PostgreSQL verification only. Never reads DATABASE_URL.
 * Run: TEST_DATABASE_URL=postgresql://...@127.0.0.1:PORT/payglocal_disposable
 * node --import tsx tests/payglocal-postgres.mts
 * Uses real SQL/transactions and fake normalized provider responses, not payments.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {Pool,type PoolClient} from "pg";
import {reservePayGlocalAttempt,persistPayGlocalInitiation,recordPayGlocalVerifiedStatus,markPayGlocalUnknown} from "../src/lib/payglocal-payment";
import {persistGatewayOrder} from "../src/lib/payment-intent";
import type {PayGlocalVerifiedStatus} from "../src/lib/providers/payglocal";

const input=process.env.TEST_DATABASE_URL;
if(!input)throw Error("Explicit TEST_DATABASE_URL for a disposable loopback database is required.");
const url=new URL(input);
if(!["postgres:","postgresql:"].includes(url.protocol)||!["127.0.0.1","[::1]"].includes(url.hostname)||url.pathname!=="/payglocal_disposable"||url.search||url.hash)throw Error("Test database must be loopback-only named payglocal_disposable, without URL options.");
const schema=`payglocal_test_${randomUUID().replaceAll("-", "")}`;
const pool=new Pool({connectionString:input,max:12,connectionTimeoutMillis:5000,statement_timeout:10000});
let created=false;
async function transaction<T>(run:(tx:PoolClient)=>Promise<T>){
 const tx=await pool.connect();
 try{await tx.query("BEGIN");await tx.query(`SET LOCAL search_path TO ${schema}, public`);const result=await run(tx);await tx.query("COMMIT");return result;}
 catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
async function rows(sql:string,values:unknown[]=[]){return transaction(async tx=>(await tx.query(sql,values)).rows);}
async function seedOrder(){
 const orderId=randomUUID(),searchId=randomUUID(),quoteId=randomUUID();
 await transaction(async tx=>{
  await tx.query("INSERT INTO supplier_searches(id,user_id,product,criteria,results,correlation_id,expires_at) VALUES($1,'test-user','FLIGHT','{}','{}',$2,now()+interval '1 hour')",[searchId,randomUUID()]);
  await tx.query("INSERT INTO supplier_quotes(id,search_id,user_id,product,selection,review,supplier_booking_id,supplier_minor,total_minor,expires_at,fare_validation_state) VALUES($1,$2,'test-user','FLIGHT','{}','{}',$3,9000,10000,now()+interval '1 hour','SUCCEEDED')",[quoteId,searchId,`supplier-${orderId}`]);
  await tx.query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor,quote_id) VALUES($1,$2,'test-user','FLIGHT','PAYMENT_PENDING',10000,9000,$3)",[orderId,`MT-${orderId}`,quoteId]);
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
 });
 assert.deepEqual(await rows("SELECT p.provider AS payment,g.provider AS intent FROM payments p JOIN gateway_intents g ON g.order_id=p.order_id WHERE p.order_id=$1",[historical]),[{payment:"RAZORPAY",intent:"RAZORPAY"}]);
 console.log("PASS migrations 001–016 and historical Razorpay provider defaults");
 const id=await seedOrder();
 const reservations=await Promise.all(Array.from({length:8},()=>transaction(tx=>reservePayGlocalAttempt(tx,id,"testmerchant"))));
 assert.equal(reservations.filter(r=>r.created).length,1);assert.equal(new Set(reservations.map(r=>r.attempt.merchantTxnId)).size,1);
 assert.equal((await rows("SELECT count(*)::int AS n FROM payglocal_attempts WHERE order_id=$1",[id]))[0].n,1);
 console.log("PASS eight concurrent reservations create one stable attempt");
 const status=await prepare(id);
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
 console.log("PASS all disposable PostgreSQL checks (mock provider results; no provider requests)");
}finally{
 try{if(created)await pool.query(`DROP SCHEMA ${schema} CASCADE`);}finally{await pool.end();}
}
