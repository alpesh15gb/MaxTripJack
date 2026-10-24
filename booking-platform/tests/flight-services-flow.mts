import assert from "node:assert/strict";
import { randomUUID,randomBytes } from "node:crypto";
import { database } from "../src/lib/db";
import { seal } from "../src/lib/vault";
import { searchFlightService,reviewFlightService } from "../src/lib/flight-services";
import { POST as createPayment } from "../src/app/api/payments/create/route";
import { GET as paymentStatus } from "../src/app/api/payments/status/route";
import { POST as verifyPayment } from "../src/app/api/payments/verify/route";
import { runBookingJob } from "../src/lib/booking-runner";
import { signature } from "../src/lib/signatures";
const base=process.env.BETTER_AUTH_URL!;if(new URL(base).hostname!=="127.0.0.1")throw Error("Local fixtures only");
const originalFetch=globalThis.fetch,before={TRIPJACK_FLIGHT_API_KEY:process.env.TRIPJACK_FLIGHT_API_KEY,RAZORPAY_KEY_ID:process.env.RAZORPAY_KEY_ID,RAZORPAY_KEY_SECRET:process.env.RAZORPAY_KEY_SECRET};
const parent=randomUUID(),email=`services-${randomUUID()}@example.test`,password=randomBytes(24).toString("hex");let userId="",cookie="",gatewayOrder="",gatewayPayment="",expectedAmount=0,addCalls=0,reissueCalls=0,lost=false,providerCalls=0,reissueTerms:Record<string,unknown>={conditions:{st:180,restriction:"Changes remain subject to supplier confirmation"},alerts:["Seat eligibility still applies"]},appliedSegments:Record<string,unknown>[]=[];const searches:string[]=[],quotes:string[]=[],children:string[]=[];
const person={ti:"Mr",pt:"ADULT",fN:"Test",lN:"Guest"},guests={travellers:[person],email,phone:"9000000000"};
const segment=(id:string,paxId:string,from:string,to:string,first:boolean)=>({id,da:{code:from},aa:{code:to},dt:"2027-01-01T10:00",bI:{tI:[{...person,id:paxId}],ssrInfo:{BAGGAGE:[{code:"BAG",desc:"Extra baggage",...(first?{amount:1000}:{})}],MEAL:[{code:"MEAL",desc:"Meal",amount:500},{code:"FREE",desc:"Included meal",amount:0}]}}});
const ssr={status:{success:true},tripInfos:[{sI:[segment("s1","p1","BOM","HYD",true),segment("s2","p2","HYD","DEL",false)]}]};
try{
 const signup=await originalFetch(base+"/api/auth/sign-up/email",{method:"POST",headers:{origin:base,"Content-Type":"application/json"},body:JSON.stringify({email,password,name:"Service Test"})});assert.equal(signup.status,200);userId=(await signup.json()).user.id;await database().query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[userId]);
 const login=await originalFetch(base+"/api/auth/sign-in/email",{method:"POST",headers:{origin:base,"Content-Type":"application/json"},body:JSON.stringify({email,password})});assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
 const actor={userId,companyId:null};await database().query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor,supplier_booking_id,guests_encrypted,itinerary_summary) VALUES($1,$2,$3,'FLIGHT','TICKETED',1000000,900000,$4,$5,$6)",[parent,`TEST-${parent}`,userId,`ORIGINAL-${parent}`,seal(guests,parent),{product:"FLIGHT",from:"BOM",to:"DEL",date:"2027-01-01",adults:1,children:0,infants:0,cabin:"ECONOMY"}]);
 process.env.TRIPJACK_FLIGHT_API_KEY="service-contract";process.env.RAZORPAY_KEY_ID="rzp_test_services";process.env.RAZORPAY_KEY_SECRET="service-secret";
 globalThis.fetch=async(input,init)=>{providerCalls++;const url=String(input),body=init?.body?JSON.parse(String(init.body)):{};const ok=(data:unknown)=>Response.json(data);
 if(url.endsWith("/ums/v1/user-detail"))return ok({status:{success:true},walletBalance:100000});
 if(url.endsWith("/ancillaries/fetch/ssr"))return ok(ssr);
 if(url.endsWith("/ancillaries/fetch/seat"))return ok({status:{success:true},tripSeatMap:{tripSeat:{s1:{sInfo:[{code:"14A",seatNo:"14A",isBooked:false,amount:3000},{code:"15A",seatNo:"15A",isBooked:true,amount:0}]}}}});
 if(url.endsWith("/add/ssr")){appliedSegments=body.sI.map((segment:{id:string;bI:{tI:{id:string;sbi?:unknown;smi?:unknown;ssi?:unknown}[]}})=>({id:segment.id,tI:segment.bI.tI.map(p=>({id:p.id,ssrBaggageInfos:p.sbi,ssrMeaInfos:p.smi,ssrSeatInfos:p.ssi}))}));addCalls++;assert.equal(body.paymentInfos[0].amount,expectedAmount/100);if(expectedAmount===450000){assert.equal(body.sI[0].bI.tI[0].sbi.amount,1000);assert.equal(body.sI[1].bI.tI[0].sbi.amount,0);assert.equal(body.sI[1].bI.tI[0].id,"p2");}if(lost)throw Error("Lost SSR response");return ok({status:{success:true},amendmentids:[`amend-${addCalls}`]});}
 if(url.endsWith("/amendment-details"))return ok({status:{success:true},bookingId:`ORIGINAL-${parent}`,amendmentStatus:"SUCCESS",totalAmount:expectedAmount/100,SSRAmendmentDetails:appliedSegments});
 if(url.endsWith("/reissue/poll/searchquery-list")){assert.deepEqual(body.searchQuery.paxIds,["original-pax"]);assert.equal(body.searchQuery.pnr,"PNR123");return ok({status:{success:true},requestId:"rq"});}
 if(url.endsWith("/reissue/poll/search"))return ok({status:{success:true},searchResult:{tripInfos:{ONWARD:[{sI:[],totalPriceList:[{id:"replacement",fD:{ADULT:{fC:{TF:2000}}}}]}]}}});
 if(url.endsWith("/reissue/review"))return ok({status:{success:true},bookingId:`NEW-${parent}`,...reissueTerms,internalAccounting:{commission:999,apiKey:"private-provider-metadata"},totalPriceInfo:{totalFareDetail:{fC:{TF:2000}}},travellerInfo:[{...person,id:"original-pax"}]});
 if(url.endsWith("/auto-reissue")){reissueCalls++;assert.equal(body.paymentInfos[0].amount,2000);assert.equal(body.oldBookingId,`ORIGINAL-${parent}`);assert.equal(body.travellerInfo[0].id,"original-pax");throw Error("Lost reissue response");}
 if(url.endsWith("/booking-details"))return ok({status:{success:true},order:{status:"SUCCESS"},travellerInfo:[{...person,id:"original-pax",pnrDetails:{"BOM-DEL":"PNR123"}}]});
 if(url==="https://api.razorpay.com/v1/orders"){assert.equal(body.amount,expectedAmount);return ok({id:gatewayOrder,amount:expectedAmount,currency:"INR"});}
 if(url===`https://api.razorpay.com/v1/payments/${gatewayPayment}`)return ok({id:gatewayPayment,order_id:gatewayOrder,amount:expectedAmount,currency:"INR",status:"captured"});throw Error("Unexpected provider call");};
 const request=(path:string,data:unknown)=>new Request(base+path,{method:"POST",headers:{origin:base,cookie,"Content-Type":"application/json"},body:JSON.stringify(data)});
 async function effects(quoteId:string){
  const result=await database().query(`SELECT
   (SELECT count(*)::int FROM orders WHERE quote_id=$1) AS orders,
   (SELECT count(*)::int FROM gateway_intents g JOIN orders o ON o.id=g.order_id WHERE o.quote_id=$1) AS intents,
   (SELECT count(*)::int FROM booking_jobs j JOIN orders o ON o.id=j.order_id WHERE o.quote_id=$1) AS jobs,
   (SELECT count(*)::int FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.quote_id=$1) AS payments`,[quoteId]);
  return {...result.rows[0],providerCalls,addCalls,reissueCalls};
 }
 async function rejectUnsafeNew(quote:{quoteId:string;totalMinor:number}){
  const saved=(await database().query("SELECT review FROM supplier_quotes WHERE id=$1",[quote.quoteId])).rows[0].review;
  const beforeChecks=await effects(quote.quoteId);
  const unauthenticated=await createPayment(new Request(base+"/api/payments/create",{method:"POST",headers:{origin:base,"Content-Type":"application/json"},body:JSON.stringify({quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor})}));
  assert.equal(unauthenticated.status,401);
  const changedTotal=await createPayment(request("/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor+1}));assert.equal(changedTotal.status,409);
  const originalExpiry=(await database().query("SELECT expires_at FROM supplier_quotes WHERE id=$1",[quote.quoteId])).rows[0].expires_at;
  try{
   await database().query("UPDATE supplier_quotes SET expires_at=now()-interval '1 minute' WHERE id=$1",[quote.quoteId]);
   const expired=await createPayment(request("/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor}));assert.equal(expired.status,409);
  }finally{await database().query("UPDATE supplier_quotes SET expires_at=$2 WHERE id=$1",[quote.quoteId,originalExpiry]);}
  assert.deepEqual(await effects(quote.quoteId),beforeChecks,"Authentication, accepted total and expiry checks must remain side-effect-free");
  const unsafe=[
   {conditions:{st:180,unknownRestriction:"Do not omit this material term"}},
   {conditions:{st:180,providerData:{credential:"never-display-credential",netFare:123}}},
   {conditions:{st:180,apiKey:"never-display-credential"}},
   {conditions:{st:180,restriction:{privateNote:"unsupported nested term"}}},
   {conditions:{st:180},alerts:["Known notice",{commission:123}]},
   {conditions:{st:180},alerts:"x".repeat(2001)},
   {conditions:null}, {conditions:[]}, {conditions:undefined},
  ];
  try{for(const replacement of unsafe){
   // Replace the actual persisted review, not a client-supplied disclosure/flag.
   const raw={...saved,...replacement};
   await database().query("UPDATE supplier_quotes SET review=$2 WHERE id=$1",[quote.quoteId,raw]);
   const beforeEffects=await effects(quote.quoteId);
   const response=await createPayment(request("/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor}));
   assert.equal(response.status,409,JSON.stringify(await response.clone().json()));
   const body=JSON.stringify(await response.json());assert.doesNotMatch(body,/never-display-credential|privateNote|netFare|commission/);
   assert.deepEqual(await effects(quote.quoteId),beforeEffects,"Blocked review must not create an order, gateway intent, job, payment or provider call");
  }}finally{await database().query("UPDATE supplier_quotes SET review=$2 WHERE id=$1",[quote.quoteId,saved]);}
 }
 async function recoverExisting(quote:{quoteId:string;totalMinor:number},expected:Record<string,unknown>,verifyExisting?:()=>Promise<void>){
  const saved=(await database().query("SELECT review FROM supplier_quotes WHERE id=$1",[quote.quoteId])).rows[0].review;
  try{
   await database().query("UPDATE supplier_quotes SET review=$2 WHERE id=$1",[quote.quoteId,{...saved,conditions:{st:180,unknownRestriction:"Reconciliation must remain available"}}]);
   const beforeEffects=await effects(quote.quoteId);
   const response=await createPayment(request("/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor}));
   const result=await response.json();
   if(expected.free){assert.equal(response.status,200);assert.deepEqual(result,expected,"Existing free-order recovery preserves its exact identity");}
   else{
    assert.equal(response.status,409);assert.equal(result.code,"SERVICE_TERMS_UNAVAILABLE");assert.equal(result.bookingId,expected.bookingId);
    for(const field of ["orderId","keyId","checkoutUrl"])assert.equal(result[field],undefined,"Unsafe terms must not yield resumable payment credentials");
   }
   assert.deepEqual(await effects(quote.quoteId),beforeEffects,"Blocked recovery must preserve payment state without another provider call or order");
   const statusRequest=()=>new Request(`${base}/api/payments/status?quoteId=${quote.quoteId}`,{headers:{cookie}});
   if(!expected.free){
    const pending=await paymentStatus(statusRequest());assert.equal(pending.status,200);const state=await pending.json();
    assert.equal(state.bookingId,expected.bookingId);assert.equal(state.canResume,false);assert.equal(state.checkoutResolved,false);
    assert.equal(state.orderId,undefined);assert.equal(state.keyId,undefined);
   }
   // A capture already received is still verifiable; blocking new charge initiation
   // must never remove the original attempt's reconciliation path.
   if(verifyExisting){
    await verifyExisting();
    const captured=await paymentStatus(statusRequest());assert.equal(captured.status,200);const state=await captured.json();
    assert.equal(state.bookingId,expected.bookingId);assert.equal(state.canResume,false);assert.equal(state.checkoutResolved,true);
    assert.equal(state.orderId,undefined);assert.equal(state.keyId,undefined);
   }
  }finally{await database().query("UPDATE supplier_quotes SET review=$2 WHERE id=$1",[quote.quoteId,saved]);}
 }
 async function checkout(quote:{quoteId:string;totalMinor:number},runWorker=true){
  expectedAmount=quote.totalMinor;gatewayOrder=`order_${randomUUID().replaceAll("-","")}`;gatewayPayment=`pay_${randomUUID().replaceAll("-","")}`;
  const r=await createPayment(request("/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
  const payment=await r.json();children.push(payment.bookingId);
  const duplicate=await createPayment(request("/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor}));assert.equal((await duplicate.json()).bookingId,payment.bookingId);
  await recoverExisting(quote,payment,payment.free?undefined:async()=>{
   const verified=await verifyPayment(request("/api/payments/verify",{bookingId:payment.bookingId,razorpay_order_id:gatewayOrder,razorpay_payment_id:gatewayPayment,razorpay_signature:signature(`${gatewayOrder}|${gatewayPayment}`,"service-secret")}));
   assert.equal(verified.status,200,"Previously captured payment remains verifiable even when new checkout is blocked");
  });
  if(runWorker)await runBookingJob();return payment.bookingId;
 }
 const search=await searchFlightService(parent,{kind:"ANCILLARY"},actor);searches.push(search.searchId);const choices=[{segmentId:"s1",paxId:"p1",kind:"BAGGAGE" as const,code:"BAG"},{segmentId:"s1",paxId:"p1",kind:"MEAL" as const,code:"MEAL"},{segmentId:"s1",paxId:"p1",kind:"SEAT" as const,code:"14A"}];
 const quote=await reviewFlightService({searchId:search.searchId,choices},actor);quotes.push(quote.quoteId);assert.equal(quote.totalMinor,450000);assert.deepEqual(quote.review,{version:1,blocked:false,lines:[{label:"Supplier quote validity (seconds)",text:"180"}]});await rejectUnsafeNew(quote);const child=await checkout(quote);assert.equal((await database().query("SELECT status FROM orders WHERE id=$1",[child])).rows[0].status,"CONFIRMED");assert.equal(addCalls,1);
 await assert.rejects(()=>reviewFlightService({searchId:search.searchId,choices:[{...choices[2],code:"15A"}]},actor));
 const free=await reviewFlightService({searchId:search.searchId,choices:[{segmentId:"s2",paxId:"p2",kind:"MEAL",code:"FREE"}]},actor);quotes.push(free.quoteId);await rejectUnsafeNew(free);const freeChild=await checkout(free);assert.equal(free.totalMinor,0);assert.equal((await database().query("SELECT status FROM orders WHERE id=$1",[freeChild])).rows[0].status,"CONFIRMED");
 const replacement=await searchFlightService(parent,{kind:"REISSUE",tripIndex:0,date:"2027-01-03",travellerIndexes:[0]},actor);searches.push(replacement.searchId);const supportedTerms=reissueTerms;
 for(const unsupported of [
  {conditions:{st:180,unknownRestriction:"Material but unsupported"},alerts:["Known notice"]},
  {conditions:{st:180},alerts:[{apiKey:"never-display-credential",commission:999}]},
 ]){
  reissueTerms=unsupported;const blocked=await reviewFlightService({searchId:replacement.searchId,priceId:"replacement"},actor);quotes.push(blocked.quoteId);
  assert.deepEqual(blocked.review,{version:1,blocked:true,lines:[]});
  assert.doesNotMatch(JSON.stringify(blocked),/never-display-credential|private-provider-metadata|commission|Material but unsupported/);
  const persisted=(await database().query("SELECT review FROM supplier_quotes WHERE id=$1",[blocked.quoteId])).rows[0].review;
  assert.deepEqual(persisted.conditions,unsupported.conditions);assert.deepEqual(persisted.alerts,unsupported.alerts);
  assert.equal(persisted.internalAccounting.apiKey,"private-provider-metadata");
  const beforeEffects=await effects(blocked.quoteId);
  const response=await createPayment(request("/api/payments/create",{quoteId:blocked.quoteId,acceptedTotalMinor:blocked.totalMinor}));
  assert.equal(response.status,409);assert.deepEqual(await effects(blocked.quoteId),beforeEffects);
 }
 reissueTerms=supportedTerms;
 const rq=await reviewFlightService({searchId:replacement.searchId,priceId:"replacement"},actor);quotes.push(rq.quoteId);
 assert.deepEqual(rq.review,{version:1,blocked:false,lines:[{label:"Supplier quote validity (seconds)",text:"180"},{label:"Service restriction",text:"Changes remain subject to supplier confirmation"},{label:"Supplier notice",text:"Seat eligibility still applies"}]});
 assert.doesNotMatch(JSON.stringify(rq),/private-provider-metadata|internalAccounting|original-pax|totalPriceInfo/);
 const reissued=await checkout(rq);assert.equal((await database().query("SELECT status FROM orders WHERE id=$1",[reissued])).rows[0].status,"TICKETED");assert.equal(reissueCalls,1);await assert.rejects(()=>searchFlightService(parent,{kind:"REISSUE",tripIndex:0,date:"2027-01-04",travellerIndexes:[0]},actor));
 // Unknown SSR outcomes must remain manual, with no repeated supplier submission.
 await database().query("UPDATE orders SET status='BOOKING_FAILED' WHERE id=$1",[reissued]);const uncertain=await reviewFlightService({searchId:search.searchId,choices:[choices[2]]},actor);quotes.push(uncertain.quoteId);lost=true;const unknown=await checkout(uncertain);assert.equal((await database().query("SELECT status FROM orders WHERE id=$1",[unknown])).rows[0].status,"MANUAL_REVIEW");const beforeCalls=addCalls;await runBookingJob();assert.equal(addCalls,beforeCalls);
 // A capture is not authority to dispatch a new service when stored terms are
 // unsupported. Preserve the money and original attempt for manual reconciliation.
 await database().query("UPDATE orders SET status='CLOSED' WHERE id=$1",[unknown]);
 const undispatched=await reviewFlightService({searchId:search.searchId,choices:[choices[1]]},actor);quotes.push(undispatched.quoteId);
 const undispatchedChild=await checkout(undispatched,false);
 const unsafeConditions={st:180,unknownRestriction:"Material terms require operations review"};
 await database().query("UPDATE supplier_quotes SET review=jsonb_set(review,'{conditions}',$2::jsonb) WHERE id=$1",[undispatched.quoteId,JSON.stringify(unsafeConditions)]);
 const beforeUndispatchedCalls=providerCalls;
 const preservedPayments=(await database().query("SELECT * FROM payments WHERE order_id=$1 ORDER BY id",[undispatchedChild])).rows;
 await runBookingJob();
 assert.equal(providerCalls,beforeUndispatchedCalls,"Unsupported unattempted service must not contact any provider after capture");
 const blockedJob=(await database().query("SELECT o.status,j.state,j.attempted,p.status AS payment_status FROM orders o JOIN booking_jobs j ON j.order_id=o.id JOIN payments p ON p.order_id=o.id WHERE o.id=$1",[undispatchedChild])).rows[0];
 assert.deepEqual(blockedJob,{status:"MANUAL_REVIEW",state:"REVIEW",attempted:false,payment_status:"CAPTURED"});
 assert.deepEqual((await database().query("SELECT * FROM payments WHERE order_id=$1 ORDER BY id",[undispatchedChild])).rows,preservedPayments,"Captured amount, identity and payment evidence must remain untouched");
 const reviewEvent=(await database().query("SELECT payload FROM outbox_events WHERE aggregate_id=$1 AND event_type='booking.review_required'",[undispatchedChild])).rows;
 assert.equal(reviewEvent.length,1);assert.equal(reviewEvent[0].payload.reason,"SERVICE_TERMS_UNAVAILABLE");
 assert.equal(await runBookingJob(),false,"Manual-review jobs must not be automatically reclaimed");assert.equal(providerCalls,beforeUndispatchedCalls);
 // Simulate recovery of an already-dispatched reissue. Unknown current terms may
 // stop new submission, but must not strand read-only supplier reconciliation.
 await database().query("UPDATE supplier_quotes SET review=jsonb_set(review,'{conditions}',$2::jsonb) WHERE id=$1",[rq.quoteId,JSON.stringify(unsafeConditions)]);
 await database().query("UPDATE orders SET status='BOOKING_PENDING' WHERE id=$1",[reissued]);
 await database().query("UPDATE booking_jobs SET state='POLLING',attempted=true,next_attempt=now(),lease_token=NULL,lease_until=NULL WHERE order_id=$1",[reissued]);
 const beforeReconciliation={providerCalls,addCalls,reissueCalls};
 const reissuePayments=(await database().query("SELECT * FROM payments WHERE order_id=$1 ORDER BY id",[reissued])).rows;
 await runBookingJob();
 assert.equal(providerCalls,beforeReconciliation.providerCalls+1,"Attempted reissue must still read supplier booking details");
 assert.equal(addCalls,beforeReconciliation.addCalls);assert.equal(reissueCalls,beforeReconciliation.reissueCalls,"Never resubmit an attempted service");
 const reconciled=(await database().query("SELECT o.status,j.state,j.attempted,p.status AS payment_status FROM orders o JOIN booking_jobs j ON j.order_id=o.id JOIN payments p ON p.order_id=o.id WHERE o.id=$1",[reissued])).rows[0];
 assert.deepEqual(reconciled,{status:"TICKETED",state:"DONE",attempted:true,payment_status:"CAPTURED"});
 assert.deepEqual((await database().query("SELECT * FROM payments WHERE order_id=$1 ORDER BY id",[reissued])).rows,reissuePayments);
 console.log("PASS: paid extras, connecting baggage amounts/pax IDs, free extras idempotency, separate capture/CRM records, reissue timeout recovery, one-time reissue, unknown SSR submission protection, bounded public service disclosures, blocked paid/free checkout with zero side effects, raw supplier evidence preservation, and existing free-order recovery and captured-payment reconciliation without unsafe resumable credentials, blocked unattempted fulfilment after capture, and read-only attempted-service reconciliation.");
}finally{globalThis.fetch=originalFetch;for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}for(const id of children){for(const table of ["customer_notifications","supplier_booking_payloads","booking_jobs","gateway_intents","payments"])await database().query(`DELETE FROM ${table} WHERE order_id=$1`,[id]);await database().query("DELETE FROM outbox_events WHERE aggregate_id=$1",[id]);await database().query("DELETE FROM audit_events WHERE entity_id=$1",[id]);await database().query("DELETE FROM orders WHERE id=$1",[id]);}for(const id of quotes)await database().query("DELETE FROM supplier_quotes WHERE id=$1",[id]);for(const id of searches)await database().query("DELETE FROM supplier_searches WHERE id=$1",[id]);await database().query("DELETE FROM outbox_events WHERE aggregate_id=$1",[parent]);await database().query("DELETE FROM orders WHERE id=$1",[parent]);if(userId)await database().query('DELETE FROM "user" WHERE id=$1',[userId]);await database().end();}
