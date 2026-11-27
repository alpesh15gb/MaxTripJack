import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../src/lib/db";
import { executeCancellation } from "../src/lib/cancellation-runner";
if(new URL(process.env.BETTER_AUTH_URL??"https://invalid").hostname!=="127.0.0.1")throw Error("Local fixtures only");
const originalFetch=globalThis.fetch,before={TRIPJACK_FLIGHT_API_KEY:process.env.TRIPJACK_FLIGHT_API_KEY,TRIPJACK_HOTEL_API_KEY:process.env.TRIPJACK_HOTEL_API_KEY};const fixtures:{order:string;cancellation:string}[]=[];
try{process.env.TRIPJACK_FLIGHT_API_KEY="contract-flight";process.env.TRIPJACK_HOTEL_API_KEY="contract-hotel";
for(const scenario of ["FLIGHT","HOTEL","FLIGHT_LOST","FLIGHT_PARTIAL"]){const order=randomUUID(),cancellation=randomUUID(),product=scenario==="HOTEL"?"HOTEL":"FLIGHT";fixtures.push({order,cancellation});await database().query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor,supplier_booking_id) VALUES($1,$2,'cancellation-contract',$3,$4,10000,9000,$5)",[order,`TEST-${order}`,product,product==="FLIGHT"?"TICKETED":"CONFIRMED",`TJ-${order}`]);await database().query("INSERT INTO cancellation_requests(id,order_id,user_id,reason,request_key,status,refund_offer_minor,penalty_minor,offer_version,offer_expires_at) VALUES($1,$2,'cancellation-contract','Fixture cancellation',$3,'AWAITING_ACCEPTANCE',9000,1000,$4,now()+interval '10 minutes')",[cancellation,order,randomUUID(),randomUUID()]);if(scenario==="FLIGHT_PARTIAL")await database().query("UPDATE cancellation_requests SET is_partial=true,scope=$1 WHERE id=$2",[{units:["0:0"],trips:[{src:"BOM",dest:"DEL",departureDate:"2027-01-01",travellers:[{fn:"Test",ln:"Guest"}]}]},cancellation]);let submissions=0,final=false;
const amendmentId="amendment-contract";
let wrongReference:"BOOKING"|"AMENDMENT"|"MISSING"|null=null,submittedScope:unknown,pollReference:unknown;
globalThis.fetch=async(input,init)=>{
 const url=String(input),ok=(value:unknown)=>Response.json(value);
 if(url.includes("submit-amendment")||url.includes("cancel-booking")){
  submissions++;
  if(scenario==="FLIGHT_PARTIAL")submittedScope=JSON.parse(String(init?.body)).trips;
  if(scenario!=="FLIGHT"&&scenario!=="FLIGHT_PARTIAL")throw Error("Lost response after supplier accepted");
  return ok({status:{success:true},amendmentId});
 }
 if(url.includes("amendment-details")){
  pollReference=JSON.parse(String(init?.body)).amendmentId;
  return ok({status:{success:true},bookingId:wrongReference==="BOOKING"?"other-booking":`TJ-${order}`,amendmentId:wrongReference==="MISSING"?undefined:wrongReference==="AMENDMENT"?"other-amendment":amendmentId,amendmentStatus:final?"SUCCESS":"REQUESTED"});
 }
 if(url.includes("booking-details"))return ok({status:{success:true},order:{status:final?"CANCELLED":"SUCCESS"}});
 throw Error("Unexpected external request");
};
const poll=async()=>{
 await database().query("UPDATE cancellation_requests SET next_check=now()-interval '1 second' WHERE id=$1",[cancellation]);
 return executeCancellation(cancellation,null,false);
};
await assert.rejects(()=>executeCancellation(cancellation,null,false));await assert.rejects(()=>executeCancellation(cancellation,null));assert.equal(submissions,0);
await database().query("UPDATE cancellation_requests SET accepted_at=now() WHERE id=$1",[cancellation]);
assert.equal((await executeCancellation(cancellation,"fixture-operator")).status,"SUPPLIER_PENDING");
assert.equal(submissions,1);
if(scenario==="FLIGHT_PARTIAL")assert.deepEqual(submittedScope,[{src:"BOM",dest:"DEL",departureDate:"2027-01-01",travellers:[{fn:"Test",ln:"Guest"}]}]);
if(scenario==="FLIGHT"||scenario==="FLIGHT_PARTIAL")assert.equal(pollReference,amendmentId);
await assert.rejects(()=>executeCancellation(cancellation,null,false));
assert.equal(submissions,1);
final=true;
if(scenario==="FLIGHT"){
 for(const mismatch of ["BOOKING","AMENDMENT","MISSING"] as const){
  wrongReference=mismatch;
  assert.equal((await poll()).status,"SUPPLIER_PENDING");
  const saved=await database().query("SELECT c.check_error,c.follow_up_required_at,o.status FROM cancellation_requests c JOIN orders o ON o.id=c.order_id WHERE c.id=$1",[cancellation]);
  assert.equal(saved.rows[0].check_error,"AMENDMENT_REFERENCE_UNAVAILABLE");
  assert.equal(saved.rows[0].status,"TICKETED");
  assert.ok(saved.rows[0].follow_up_required_at);
 }
 wrongReference=null;
}
assert.equal((await poll()).status,"CONFIRMED");
assert.equal(submissions,1);
assert.equal((await database().query("SELECT status FROM orders WHERE id=$1",[order])).rows[0].status,scenario==="FLIGHT_PARTIAL"?"TICKETED":"CANCELLED");}
console.log("PASS: cancellation consent and staff submission; flight amendment identity and partial scope; hotel timeout and lost-amendment recovery without duplicate submission.");
}finally{globalThis.fetch=originalFetch;for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}for(const f of fixtures){await database().query("DELETE FROM customer_notifications WHERE order_id=$1",[f.order]);await database().query("DELETE FROM outbox_events WHERE aggregate_id=$1",[f.order]);await database().query("DELETE FROM audit_events WHERE entity_id=$1",[f.cancellation]);await database().query("DELETE FROM cancellation_requests WHERE id=$1",[f.cancellation]);await database().query("DELETE FROM orders WHERE id=$1",[f.order]);}await database().end();}
