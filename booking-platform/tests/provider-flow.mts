import assert from "node:assert/strict";
import { randomBytes,randomUUID } from "node:crypto";
import { Pool } from "pg";
import { searchSupplier,reviewSupplier } from "../src/lib/supplier-flow";
import { POST as createPayment } from "../src/app/api/payments/create/route";
import { GET as confirmationDocument } from "../src/app/api/bookings/[id]/document/route";
import { POST as verifyPayment } from "../src/app/api/payments/verify/route";
import { runBookingJob } from "../src/lib/booking-runner";
import { signature } from "../src/lib/signatures";
import { database,transaction } from "../src/lib/db";
import { persistGatewayOrder,markGatewayIntentUnknown } from "../src/lib/payment-intent";
import { seal } from "../src/lib/vault";
import { GET as paymentStatus } from "../src/app/api/payments/status/route";
const base=process.env.BETTER_AUTH_URL!;
if(!base||new URL(base).hostname!=="127.0.0.1")throw Error("Local development only.");
const originalFetch=globalThis.fetch;
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const email=`provider-${randomUUID()}@example.test`,password=randomBytes(24).toString("hex");let userId="",cookie="",bookingId="",searchId="",quoteId="",bookCalls=0,validateCalls=0,walletBalance=100000;
let gatewayOrder=`order_${randomUUID().replaceAll("-","")}`,gatewayPayment=`pay_${randomUUID().replaceAll("-","")}`;
const fixtureBookings:string[]=[],fixtureQuotes:string[]=[],fixtureSearches:string[]=[];
const hotelOption={optionId:"hotel-option",pricing:{totalPrice:5000 as unknown,currency:"INR",mf:0,mft:0},cancellation:{isRefundable:true,penalties:[]},compliance:{panRequired:false,passportRequired:false,gstType:"NA"}};
const before={TRIPJACK_FLIGHT_API_KEY:process.env.TRIPJACK_FLIGHT_API_KEY,TRIPJACK_HOTEL_API_KEY:process.env.TRIPJACK_HOTEL_API_KEY,RAZORPAY_KEY_ID:process.env.RAZORPAY_KEY_ID,RAZORPAY_KEY_SECRET:process.env.RAZORPAY_KEY_SECRET};
try{
 const signup=await originalFetch(base+"/api/auth/sign-up/email",{method:"POST",headers:{origin:base,"Content-Type":"application/json"},body:JSON.stringify({email,password,name:"Provider Contract Test"})});assert.equal(signup.status,200);userId=(await signup.json()).user.id;
 // Test-only identity setup; email delivery/verification is covered by test:integration.
 await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[userId]);
 const login=await originalFetch(base+"/api/auth/sign-in/email",{method:"POST",headers:{origin:base,"Content-Type":"application/json"},body:JSON.stringify({email,password})});assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
 process.env.TRIPJACK_FLIGHT_API_KEY="contract-test-key";process.env.TRIPJACK_HOTEL_API_KEY="contract-test-hotel-key";process.env.RAZORPAY_KEY_ID="rzp_test_contract";process.env.RAZORPAY_KEY_SECRET="contract-test-secret";
 globalThis.fetch=async(input,init)=>{const url=String(input);const payload=init?.body?JSON.parse(String(init.body)):{};const ok=(data:unknown)=>Promise.resolve(Response.json(data));
  if(url==="https://apitest.tripjack.com/ums/v1/user-detail")return ok({status:{success:true},walletBalance});
  if(url.startsWith("https://apitest.tripjack.com")){
   assert.equal(new Headers(init?.headers).get("apikey"),"contract-test-key");
   if(url.endsWith("air-search-all"))return ok({status:{success:true},searchResult:{tripInfos:{ONWARD:[{sI:[],totalPriceList:[{id:"price-contract",fD:{ADULT:{fC:{TF:5000}}}}]}]}}});
   if(url.endsWith("/review"))return ok({status:{success:true},bookingId:"TJ-contract",conditions:{st:300},totalPriceInfo:{totalFareDetail:{fC:{TF:5000}}}});
   if(url.endsWith("/farerule"))return ok({status:{success:true},fareRule:{miscInfo:"Contract cancellation policy"}});
   if(url.endsWith("/fare-validate")){validateCalls++;return ok({status:{success:true}});}
   if(url.endsWith("/air/book")){bookCalls++;assert.equal(payload.paymentInfos[0].amount,5000);throw new Error("Simulated connection loss AFTER supplier accepted booking");}
   if(url.endsWith("/booking-details"))return ok({status:{success:true},order:{status:"SUCCESS",bookingId:"TJ-contract"}});
   throw Error("Unexpected supplier endpoint");
  }
  if(url.startsWith("https://apitest-hms.tripjack.com")||url.startsWith("https://apitest-hotel-booker.tripjack.com")){
   assert.equal(new Headers(init?.headers).get("apikey"),"contract-test-hotel-key");
   if(url.endsWith("/listing"))return ok({status:{success:true},hotels:[{tjHotelId:"100001",name:"Contract Hotel",options:[hotelOption]}]});
   if(url.endsWith("/pricing"))return ok({status:{success:true},options:[hotelOption],reviewHash:"hotel-review-hash"});
   if(url.endsWith("/review"))return ok({status:{success:true},bookingId:"TJ-hotel-contract",option:hotelOption});
   if(url.endsWith("/hotel/book")){bookCalls++;assert.equal(payload.paymentInfos[0].amount,5000);assert.equal(payload.roomTravellerInfo.length,1);return ok({status:{success:true}});}
   if(url.endsWith("/booking-details"))return ok({status:{success:true},order:{status:"SUCCESS",bookingId:"TJ-hotel-contract"}});
   throw Error("Unexpected hotel endpoint");
  }
  if(url==="https://api.razorpay.com/v1/orders"){assert.equal(payload.amount,500000);return ok({id:gatewayOrder,amount:500000,currency:"INR"});}
  if(url===`https://api.razorpay.com/v1/payments/${gatewayPayment}`)return ok({id:gatewayPayment,order_id:gatewayOrder,amount:500000,currency:"INR",status:"captured"});
  throw Error("Unexpected external request blocked by contract test");
 };
 const actor={userId,companyId:null};const search=await searchSupplier({product:"FLIGHT",from:"BOM",to:"DEL",date:"2026-12-20",adults:1,children:0,infants:0,cabin:"ECONOMY"},actor);searchId=search.searchId;fixtureSearches.push(searchId);
 const quote=await reviewSupplier(searchId,{priceIds:["price-contract"]},actor);quoteId=quote.quoteId;fixtureQuotes.push(quoteId);
 const readPaymentStatus=(query:string)=>paymentStatus(new Request(base+`/api/payments/status?${query}`,{headers:{cookie}}));
 const unseen=await readPaymentStatus(`quoteId=${quoteId}`);assert.equal(unseen.status,200);assert.deepEqual({found:(await unseen.clone().json()).found,canResume:(await unseen.json()).canResume},{found:false,canResume:false});
 assert.equal((await readPaymentStatus(`quoteId=${randomUUID()}`)).status,404);
 const request=(path:string,data:unknown)=>new Request(base+path,{method:"POST",headers:{origin:base,cookie,"Content-Type":"application/json"},body:JSON.stringify(data)});
 const guests={travellers:[{ti:"Mr",pt:"ADULT",fN:"Contract",lN:"Guest"}],email,phone:"9000000000"};
 const tampered=await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:1}));assert.equal(tampered.status,409);
 walletBalance=0;assert.equal((await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:quote.totalMinor}))).status,503);assert.equal((await pool.query("SELECT count(*)::int AS n FROM orders WHERE quote_id=$1",[quoteId])).rows[0].n,0);walletBalance=100000;
 const created=await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:quote.totalMinor}));assert.equal(created.status,200);const gateway=await created.json();bookingId=gateway.bookingId;fixtureBookings.push(bookingId);
 const resumable=await (await readPaymentStatus(`quoteId=${quoteId}`)).json();assert.equal(resumable.canResume,true);assert.equal(resumable.bookingId,bookingId);assert.equal(resumable.orderId,gatewayOrder);
 const changedContact=await createPayment(request("/api/payments/create",{quoteId,guests:{...guests,email:"changed@example.test"},acceptedTotalMinor:quote.totalMinor}));assert.equal(changedContact.status,409);
 const changedTraveller=await createPayment(request("/api/payments/create",{quoteId,guests:{...guests,travellers:guests.travellers.map(t=>({...t,fN:"Different"}))},acceptedTotalMinor:quote.totalMinor}));assert.equal(changedTraveller.status,409);
 const replay=await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:quote.totalMinor}));assert.equal((await replay.json()).orderId,gatewayOrder);
 const verified=await verifyPayment(request("/api/payments/verify",{bookingId,razorpay_order_id:gatewayOrder,razorpay_payment_id:gatewayPayment,razorpay_signature:signature(`${gatewayOrder}|${gatewayPayment}`,"contract-test-secret")}));assert.equal(verified.status,200);
 const paidStatus=await (await readPaymentStatus(`bookingId=${bookingId}`)).json();assert.equal(paidStatus.canResume,false);assert.equal(paidStatus.checkoutResolved,true);assert.equal(paidStatus.orderId,undefined);
 await runBookingJob();assert.equal(bookCalls,1);assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[bookingId])).rows[0].status,"TICKETED");
 await runBookingJob();assert.equal(bookCalls,1);
 const pdf=await confirmationDocument(new Request(base+`/api/bookings/${bookingId}/document`,{headers:{cookie}}),{params:Promise.resolve({id:bookingId})});assert.equal(pdf.status,200);assert.equal(pdf.headers.get("Content-Type"),"application/pdf");assert.equal(pdf.headers.get("Cache-Control"),"private, no-store");assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),"%PDF-");
 console.log("PASS: mocked flight search → review → server-priced Razorpay order → signed capture verification → supplier timeout recovery → ticketed; duplicate checkout and tampered totals handled.");
 // Crash recovery and concurrent recovery use only synthetic local records.
 const crashed=randomUUID();fixtureBookings.push(crashed);
 await pool.query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor) VALUES($1,$2,$3,'FLIGHT','PAYMENT_PENDING',500000,500000)",[crashed,`TEST-${crashed}`,userId]);
 await pool.query("INSERT INTO gateway_intents(order_id,created_at) VALUES($1,now()-interval '3 minutes')",[crashed]);
 const recoveredGateway={id:`order_${randomUUID().replaceAll("-","")}`,amount:500000,currency:"INR",receipt:crashed};
 const concurrent=await Promise.all([transaction(tx=>persistGatewayOrder(tx,crashed,recoveredGateway,"RECOVER")),transaction(tx=>persistGatewayOrder(tx,crashed,recoveredGateway,"RECOVER"))]);
 assert.equal(concurrent.filter(result=>result.linked).length,1);assert.equal((await pool.query("SELECT count(*)::int AS n FROM payments WHERE order_id=$1",[crashed])).rows[0].n,1);
 await pool.query("UPDATE orders SET status='PAID' WHERE id=$1",[crashed]);
 await pool.query("UPDATE payments SET status='CAPTURED',gateway_payment_id=$2 WHERE order_id=$1",[crashed,`pay_${randomUUID().replaceAll("-","")}`]);
 assert.equal((await transaction(tx=>persistGatewayOrder(tx,crashed,recoveredGateway,"CREATE"))).linked,false);
 await transaction(tx=>markGatewayIntentUnknown(tx,crashed));assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[crashed])).rows[0].status,"PAID");
 for(const validationState of ["STARTED","SUCCEEDED"]){
  const interruptedQuote=randomUUID(),interruptedOrder=randomUUID();fixtureQuotes.push(interruptedQuote);fixtureBookings.push(interruptedOrder);
  await pool.query("INSERT INTO supplier_quotes(id,search_id,user_id,company_id,product,selection,review,supplier_booking_id,supplier_minor,total_minor,expires_at,booking_validation_state,booking_validation_hash,booking_validation_started_at) SELECT $1,search_id,user_id,company_id,product,selection,review,$3,supplier_minor,total_minor,expires_at,$4,'crash-fixture',now()-interval '5 minutes' FROM supplier_quotes WHERE id=$2",[interruptedQuote,quoteId,`TJ-${interruptedOrder}`,validationState]);
  await pool.query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor,quote_id,guests_encrypted) VALUES($1,$2,$3,'FLIGHT','PAID',500000,500000,$4,$5)",[interruptedOrder,`TEST-${interruptedOrder}`,userId,interruptedQuote,seal(guests,interruptedOrder)]);
  await pool.query("INSERT INTO payments(id,order_id,gateway_order_id,gateway_payment_id,amount_minor,status) VALUES($1,$2,$3,$4,500000,'CAPTURED')",[randomUUID(),interruptedOrder,`order_${randomUUID().replaceAll("-","")}`,`pay_${randomUUID().replaceAll("-","")}`]);
  await pool.query("INSERT INTO booking_jobs(order_id) VALUES($1)",[interruptedOrder]);
  const callsBefore:{validateCalls:number;bookCalls:number}={validateCalls,bookCalls};await runBookingJob();
  assert.deepEqual({validateCalls,bookCalls},callsBefore);assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[interruptedOrder])).rows[0].status,"MANUAL_REVIEW");
  assert.deepEqual((await pool.query("SELECT state,attempted FROM booking_jobs WHERE order_id=$1",[interruptedOrder])).rows[0],{state:"REVIEW",attempted:false});
 }
 console.log("PASS: stale STARTED gateway recovery is serialized/idempotent, late creator cannot downgrade capture, and interrupted/stale successful PREBOOK validation never repeats validation or Book.");
 gatewayOrder=`order_${randomUUID().replaceAll("-","")}`;gatewayPayment=`pay_${randomUUID().replaceAll("-","")}`;
 const hotelSearch=await searchSupplier({product:"HOTEL",hotelIds:["100001"],checkIn:"2026-12-20",checkOut:"2026-12-22",adults:1,childrenAges:[],nationality:"106"},actor);fixtureSearches.push(hotelSearch.searchId);
 for(const invalidPrice of [null,"",false]){hotelOption.pricing.totalPrice=invalidPrice;await assert.rejects(reviewSupplier(hotelSearch.searchId,{hid:"100001",optionId:"hotel-option"},actor));}
 hotelOption.pricing.totalPrice=5000;
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM supplier_quotes WHERE search_id=$1",[hotelSearch.searchId])).rows[0].n,0,"invalid hotel prices must not create a payable quote");
 const hotelQuote=await reviewSupplier(hotelSearch.searchId,{hid:"100001",optionId:"hotel-option"},actor);fixtureQuotes.push(hotelQuote.quoteId);
 const hotelPayment=await createPayment(request("/api/payments/create",{quoteId:hotelQuote.quoteId,guests,acceptedTotalMinor:hotelQuote.totalMinor}));assert.equal(hotelPayment.status,200);const hotelGateway=await hotelPayment.json();fixtureBookings.push(hotelGateway.bookingId);
 const hotelVerified=await verifyPayment(request("/api/payments/verify",{bookingId:hotelGateway.bookingId,razorpay_order_id:gatewayOrder,razorpay_payment_id:gatewayPayment,razorpay_signature:signature(`${gatewayOrder}|${gatewayPayment}`,"contract-test-secret")}));assert.equal(hotelVerified.status,200);
 await runBookingJob();assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[hotelGateway.bookingId])).rows[0].status,"CONFIRMED");assert.equal(bookCalls,2);
 console.log("PASS: mocked Hotel v3 listing → pricing → review → Razorpay → re-review → book → confirmed status.");
}finally{
 globalThis.fetch=originalFetch;for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 for(const id of fixtureBookings){for(const table of ["customer_notifications","supplier_booking_payloads","booking_jobs","gateway_intents","payments"])await pool.query(`DELETE FROM ${table} WHERE order_id=$1`,[id]);for(const table of ["outbox_events","audit_events"])await pool.query(`DELETE FROM ${table} WHERE ${table==="outbox_events"?"aggregate_id":"entity_id"}=$1`,[id]);await pool.query("DELETE FROM orders WHERE id=$1",[id]);}
 for(const id of fixtureQuotes)await pool.query("DELETE FROM supplier_quotes WHERE id=$1",[id]);for(const id of fixtureSearches)await pool.query("DELETE FROM supplier_searches WHERE id=$1",[id]);if(userId)await pool.query('DELETE FROM "user" WHERE id=$1',[userId]);await pool.end();await database().end();
}
