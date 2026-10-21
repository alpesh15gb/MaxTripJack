import test from "node:test";
import assert from "node:assert/strict";
import type {PoolClient} from "pg";
import {persistPayGlocalInitiation,markPayGlocalUnknown,recordPayGlocalVerifiedStatus,reservePayGlocalAttempt} from "../src/lib/payglocal-payment";
import type {PayGlocalVerifiedStatus} from "../src/lib/providers/payglocal";
const id="booking-test";
const result:PayGlocalVerifiedStatus={source:"SERVER_STATUS",merchantTxnId:"txn-test",merchantId:"mid-test",gid:"gid-test",totalAmount:"100.00",txnCurrency:"INR",status:"SENT_FOR_CAPTURE"};
// SQL-boundary model after row locking: proves decisions/deduplication, NOT real
// PostgreSQL locking, rollback, migration compatibility or provider verification.
function fixture(status="PAYMENT_PENDING", existing=true) {
 const row={order_id:id,merchant_txn_id:"txn-test",merchant_id:"mid-test",amount_minor:"10000",currency:"INR",gid:"gid-test",state:"PENDING",order_status:status,total_minor:"10000",provider:"PAYGLOCAL",redirect_url:null,status_url:null};
 const payment={id:"payment-test",status:"CREATED",amount_minor:"10000",currency:"INR",gateway_payment_id:null as string|null};
 const writes:string[]=[]; let jobs=0,outbox=0;
 const query=async(sql:string,values:unknown[]=[])=>{
  if(sql.startsWith("SELECT a.*")) {assert.match(sql,/FOR UPDATE OF o,g,a$/);return {rows:[{...row}],rowCount:1};}
  if(sql.startsWith("SELECT id,status,amount_minor")) {assert.match(sql,/provider='PAYGLOCAL' FOR UPDATE$/);return {rows:[{...payment}],rowCount:1};}
  if(sql.startsWith("SELECT status,total_minor"))return {rows:[{status:row.order_status,total_minor:row.total_minor,currency:row.currency}],rowCount:1};
  if(sql.startsWith("SELECT provider"))return {rows:[{provider:row.provider}],rowCount:1};
  if(sql.startsWith("SELECT * FROM payglocal_attempts"))return {rows:existing?[{...row}]:[],rowCount:existing?1:0};
  writes.push(sql);
  if(sql.startsWith("UPDATE payments SET status='CAPTURED'")){payment.status="CAPTURED";payment.gateway_payment_id=String(values[1]);}
  else if(sql.startsWith("UPDATE payglocal_attempts SET state='CAPTURED'"))row.state="CAPTURED";
  else if(sql.startsWith("UPDATE payglocal_attempts SET state='UNKNOWN'"))row.state="UNKNOWN";
  else if(sql.startsWith("UPDATE payglocal_attempts SET state=$2"))row.state=String(values[1]);
  else if(sql.startsWith("UPDATE orders SET status=CASE"))row.order_status=row.order_status==="PAYMENT_PENDING"?"PAID":"MANUAL_REVIEW";
  else if(sql.startsWith("INSERT INTO booking_jobs")){if(row.order_status==="PAID")jobs++;}
  else if(sql.startsWith("INSERT INTO outbox_events"))outbox++;
  else if(sql.startsWith("INSERT INTO payglocal_attempts")){existing=true;row.merchant_txn_id=String(values[1]);}
  else if(!sql.startsWith("INSERT INTO audit_events")&&!sql.startsWith("UPDATE gateway_intents"))throw new Error(`Unexpected SQL: ${sql}`);
  return {rows:[],rowCount:1};
 };
 return {tx:{query} as unknown as Pick<PoolClient,"query">,row,payment,writes,counts:()=>({jobs,outbox})};
}
test("duplicate verified capture creates only one paid transition/job/outbox",async()=>{
 const f=fixture();await recordPayGlocalVerifiedStatus(f.tx,id,result);
 assert.deepEqual(f.counts(),{jobs:1,outbox:1});assert.equal(f.row.order_status,"PAID");
 const count=f.writes.length;assert.equal((await recordPayGlocalVerifiedStatus(f.tx,id,result)).duplicate,true);
 assert.equal(f.writes.length,count);
});
test("wrong amount, currency, reference, MID, gid or callback source cannot mutate",async()=>{
 for(const patch of [{totalAmount:"99.99"},{txnCurrency:"USD"},{merchantTxnId:"other"},{merchantId:"other"},{gid:"other"},{source:"CALLBACK"}]){
  const f=fixture();await assert.rejects(recordPayGlocalVerifiedStatus(f.tx,id,{...result,...patch} as PayGlocalVerifiedStatus));assert.deepEqual(f.writes,[]);
 }
});
test("authorization/pending/unknown status does not trigger supplier fulfillment",async()=>{
 for(const status of ["AUTHORIZED","INPROGRESS","UNRECOGNIZED"]){const f=fixture();await recordPayGlocalVerifiedStatus(f.tx,id,{...result,status});assert.deepEqual(f.counts(),{jobs:0,outbox:0});assert.equal(f.payment.status,"CREATED");}
});
test("timeout stays unknown; a later bound success can capture once",async()=>{
 const f=fixture();await markPayGlocalUnknown(f.tx,id);assert.equal(f.row.state,"UNKNOWN");assert.equal(f.row.order_status,"PAYMENT_PENDING");
 await recordPayGlocalVerifiedStatus(f.tx,id,result);assert.deepEqual(f.counts(),{jobs:1,outbox:1});
});
test("late failure and timeout cannot reverse capture",async()=>{
 const f=fixture();await recordPayGlocalVerifiedStatus(f.tx,id,result);const n=f.writes.length;
 await recordPayGlocalVerifiedStatus(f.tx,id,{...result,status:"FAILED"});await markPayGlocalUnknown(f.tx,id);
 assert.equal(f.writes.length,n);assert.equal(f.row.state,"CAPTURED");
});
test("late success after supplier failure/cancellation is financial capture plus manual review, no new job",async()=>{
 for(const status of ["BOOKING_FAILED","CANCELLED","TICKETED","MANUAL_REVIEW"]){const f=fixture(status);await recordPayGlocalVerifiedStatus(f.tx,id,result);assert.equal(f.payment.status,"CAPTURED");assert.equal(f.row.order_status,"MANUAL_REVIEW");assert.deepEqual(f.counts(),{jobs:0,outbox:1});}
});
test("duplicate checkout resumes original attempt even when uncertain, never recreates",async()=>{
 const f=fixture();f.row.state="UNKNOWN";
 for(let i=0;i<2;i++){const reserved=await reservePayGlocalAttempt(f.tx,id,"mid-test");assert.equal(reserved.created,false);assert.equal(reserved.attempt.merchantTxnId,"txn-test");}
 assert.deepEqual(f.writes,[]);
});
test("historical Razorpay intent cannot be switched or captured as PayGlocal",async()=>{
 const f=fixture();f.row.provider="RAZORPAY";
 await assert.rejects(reservePayGlocalAttempt(f.tx,id,"mid-test"));await assert.rejects(recordPayGlocalVerifiedStatus(f.tx,id,result));assert.deepEqual(f.writes,[]);
});

 test("initiation cannot store a status URL for another transaction or an unsafe redirect",async()=>{
 const initial={...result,redirectUrl:"https://api.uat.payglocal.in/gl/payflow-ui/?token=example",statusUrl:"https://api.uat.payglocal.in/gl/v1/payments/gid-test/status"};
 for(const patch of [{statusUrl:"https://api.uat.payglocal.in/gl/v1/payments/other/status"},{redirectUrl:"https://attacker.example/"},{merchantTxnId:"other"},{totalAmount:"0.01"}]){
  const f=fixture();await assert.rejects(persistPayGlocalInitiation(f.tx,id,{...initial,...patch}));assert.deepEqual(f.writes,[]);
 }
 });

test("reservation issues one stable merchant reference across repeated clicks",async()=>{
 const f=fixture("PAYMENT_PENDING",false);const first=await reservePayGlocalAttempt(f.tx,id,"mid-test");const second=await reservePayGlocalAttempt(f.tx,id,"mid-test");
 assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(first.attempt.merchantTxnId,second.attempt.merchantTxnId);
 assert.equal(f.writes.filter(q=>q.startsWith("INSERT INTO payglocal_attempts")).length,1);
});
