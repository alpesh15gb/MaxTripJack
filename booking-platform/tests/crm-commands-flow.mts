import { POST as crmCommand } from "../src/app/api/integrations/crm/commands/route";
import { extrasCatalogue,saveCheckoutExtras } from "../src/lib/checkout-extras";
import assert from "node:assert/strict";
import { randomBytes,randomUUID } from "node:crypto";
import { Pool } from "pg";
import { searchSupplier,reviewSupplier } from "../src/lib/supplier-flow";
import { POST as createPayment } from "../src/app/api/payments/create/route";
import { GET as confirmationDocument } from "../src/app/api/bookings/[id]/document/route";
import { POST as verifyPayment } from "../src/app/api/payments/verify/route";
import { runBookingJob } from "../src/lib/booking-runner";
import { signature,crmSignature } from "../src/lib/signatures";
import { database } from "../src/lib/db";
const base=process.env.BETTER_AUTH_URL!;
if(!base||new URL(base).hostname!=="127.0.0.1")throw Error("Local development only.");
const originalFetch=globalThis.fetch;
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const email=`provider-${randomUUID()}@example.test`,password=randomBytes(24).toString("hex");let userId="",cookie="",bookingId="",searchId="",quoteId="",bookCalls=0,gatewayAmount=675000,walletBalance=100000;
let gatewayOrder=`order_${randomUUID().replaceAll("-","")}`,gatewayPayment=`pay_${randomUUID().replaceAll("-","")}`;
const fixtureBookings:string[]=[],fixtureQuotes:string[]=[],fixtureSearches:string[]=[];
const ssr={BAGGAGE:[{code:"BAG",amount:1000}],MEAL:[{code:"MEAL",amount:250}]};
const hotelOption={optionId:"hotel-option",pricing:{totalPrice:5000,currency:"INR",mf:0,mft:0},cancellation:{isRefundable:true,penalties:[]},compliance:{panRequired:false,passportRequired:false,gstType:"NA"}};
const before={TRIPJACK_FLIGHT_API_KEY:process.env.TRIPJACK_FLIGHT_API_KEY,TRIPJACK_HOTEL_API_KEY:process.env.TRIPJACK_HOTEL_API_KEY,RAZORPAY_KEY_ID:process.env.RAZORPAY_KEY_ID,RAZORPAY_KEY_SECRET:process.env.RAZORPAY_KEY_SECRET,CRM_COMMAND_KEYS:process.env.CRM_COMMAND_KEYS,CRM_STAFF_ACTORS:process.env.CRM_STAFF_ACTORS};
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
   if(url.endsWith("/review"))return ok({status:{success:true},bookingId:"TJ-contract",conditions:{st:300,isa:true},tripInfos:[{sI:[{id:"s1",da:{code:"BOM"},aa:{code:"DEL"},ssrInfo:ssr}]}],totalPriceInfo:{totalFareDetail:{fC:{TF:5000}}}});
   if(url.endsWith("/seat"))return ok({status:{success:true},tripSeatMap:{tripSeat:{s1:{sInfo:[{code:"2A",seatNo:"2A",amount:500,isBooked:false}]}}}});
   if(url.endsWith("/farerule"))return ok({status:{success:true},fareRule:{miscInfo:"Contract cancellation policy"}});
   if(url.endsWith("/fare-validate")){assert.equal(payload.paymentInfos[0].amount,6750);assert.deepEqual(payload.travellerInfo[0].ssrSeatInfos,[{key:"s1",code:"2A"}]);return ok({status:{success:true}});}
   if(url.endsWith("/air/book")){bookCalls++;assert.equal(payload.paymentInfos[0].amount,6750);assert.deepEqual(payload.travellerInfo[0].ssrBaggageInfos,[{key:"s1",code:"BAG"}]);throw new Error("Simulated connection loss AFTER supplier accepted booking");}
   if(url.endsWith("/booking-details"))return ok({status:{success:true},order:{status:"SUCCESS",bookingId:"TJ-contract"},itemInfos:{AIR:{travellerInfos:[{fN:"Contract",lN:"Guest",pt:"ADULT",ssrBaggageInfos:[{key:"s1",code:"BAG"}],ssrMealInfos:[{key:"s1",code:"MEAL"}],ssrSeatInfos:[{key:"s1",code:"2A"}]}]}}});
   throw Error("Unexpected supplier endpoint");
  }
  if(url.startsWith("https://apitest-hms.tripjack.com")||url.startsWith("https://apitest-hotel-booker.tripjack.com")){
   assert.equal(new Headers(init?.headers).get("apikey"),"contract-test-hotel-key");
   if(url.endsWith("/listing"))return ok({status:{success:true},hotels:[{tjHotelId:"100001",name:"Contract Hotel",options:[hotelOption]}]});
   if(url.endsWith("/pricing"))return ok({status:{success:true},options:[hotelOption],reviewHash:"hotel-review-hash"});
   if(url.endsWith("/review"))return ok({status:{success:true},bookingId:"TJ-hotel-contract",option:hotelOption});
   if(url.endsWith("/hotel/book")){bookCalls++;assert.equal(payload.paymentInfos[0].amount,5000);assert.equal(payload.roomTravellerInfo.length,2);assert.deepEqual(payload.roomTravellerInfo.map((r:{travellerInfo:unknown[]})=>r.travellerInfo.length),[3,2]);return ok({status:{success:true}});}
   if(url.endsWith("/booking-details"))return ok({status:{success:true},order:{status:"SUCCESS",bookingId:"TJ-hotel-contract"}});
   throw Error("Unexpected hotel endpoint");
  }
  if(url==="https://api.razorpay.com/v1/orders"){assert.equal(payload.amount,gatewayAmount);return ok({id:gatewayOrder,amount:gatewayAmount,currency:"INR"});}
  if(url===`https://api.razorpay.com/v1/payments/${gatewayPayment}`)return ok({id:gatewayPayment,order_id:gatewayOrder,amount:gatewayAmount,currency:"INR",status:"captured"});
  throw Error("Unexpected external request blocked by contract test");
 };
 const actor={userId,companyId:null};const search=await searchSupplier({product:"FLIGHT",from:"BOM",to:"DEL",date:"2026-12-20",adults:1,children:0,infants:0,cabin:"ECONOMY"},actor);searchId=search.searchId;fixtureSearches.push(searchId);
 let quote=await reviewSupplier(searchId,{priceIds:["price-contract"]},actor);quoteId=quote.quoteId;fixtureQuotes.push(quoteId);
 const catalogue=await extrasCatalogue(quoteId,actor);assert.equal(catalogue.segments[0].options.length,3);
 await assert.rejects(extrasCatalogue(quoteId,{userId:randomUUID(),companyId:null}));
 await assert.rejects(saveCheckoutExtras(quoteId,[{segmentId:"s1",travellerIndex:0,kind:"SEAT",code:"FAKE"}],actor));
 const saved=await saveCheckoutExtras(quoteId,[{segmentId:"s1",travellerIndex:0,kind:"BAGGAGE",code:"BAG"},{segmentId:"s1",travellerIndex:0,kind:"MEAL",code:"MEAL"},{segmentId:"s1",travellerIndex:0,kind:"SEAT",code:"2A"}],actor);quote={...quote,totalMinor:saved.totalMinor};assert.equal(saved.extrasMinor,175000);
 const request=(path:string,data:unknown)=>new Request(base+path,{method:"POST",headers:{origin:base,cookie,"Content-Type":"application/json"},body:JSON.stringify(data)});
 const guests={travellers:[{ti:"Mr",pt:"ADULT",fN:"Contract",lN:"Guest"}],email,phone:"9000000000"};
 const tampered=await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:1}));assert.equal(tampered.status,409);
 walletBalance=0;assert.equal((await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:quote.totalMinor}))).status,503);assert.equal((await pool.query("SELECT count(*)::int AS n FROM orders WHERE quote_id=$1",[quoteId])).rows[0].n,0);walletBalance=100000;
 const created=await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:quote.totalMinor}));assert.equal(created.status,200);const gateway=await created.json();bookingId=gateway.bookingId;fixtureBookings.push(bookingId);
 await assert.rejects(saveCheckoutExtras(quoteId,[],actor));
 const changedContact=await createPayment(request("/api/payments/create",{quoteId,guests:{...guests,email:"changed@example.test"},acceptedTotalMinor:quote.totalMinor}));assert.equal(changedContact.status,409);
 const changedTraveller=await createPayment(request("/api/payments/create",{quoteId,guests:{...guests,travellers:guests.travellers.map(t=>({...t,fN:"Different"}))},acceptedTotalMinor:quote.totalMinor}));assert.equal(changedTraveller.status,409);
 const replay=await createPayment(request("/api/payments/create",{quoteId,guests,acceptedTotalMinor:quote.totalMinor}));assert.equal((await replay.json()).orderId,gatewayOrder);
 const verified=await verifyPayment(request("/api/payments/verify",{bookingId,razorpay_order_id:gatewayOrder,razorpay_payment_id:gatewayPayment,razorpay_signature:signature(`${gatewayOrder}|${gatewayPayment}`,"contract-test-secret")}));assert.equal(verified.status,200);
 await runBookingJob();assert.equal(bookCalls,1);assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[bookingId])).rows[0].status,"TICKETED");
 await runBookingJob();assert.equal(bookCalls,1);
 const pdf=await confirmationDocument(new Request(base+`/api/bookings/${bookingId}/document`,{headers:{cookie}}),{params:Promise.resolve({id:bookingId})});assert.equal(pdf.status,200);assert.equal(pdf.headers.get("Content-Type"),"application/pdf");assert.equal(pdf.headers.get("Cache-Control"),"private, no-store");assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),"%PDF-");
 console.log("PASS initial checkout extras, ownership, forged options, locked checkout: mocked flight search → review → server-priced Razorpay order → signed capture verification → supplier timeout recovery → ticketed; duplicate checkout and tampered totals handled.");
 gatewayAmount=500000;gatewayOrder=`order_${randomUUID().replaceAll("-","")}`;gatewayPayment=`pay_${randomUUID().replaceAll("-","")}`;
 const hotelSearch=await searchSupplier({product:"HOTEL",hotelIds:["100001"],checkIn:"2026-12-20",checkOut:"2026-12-22",adults:1,childrenAges:[5],rooms:[{adults:2,children:1,childAge:[5]},{adults:1,children:1,childAge:[8]}],nationality:"106"},actor);fixtureSearches.push(hotelSearch.searchId);
 const hotelQuote=await reviewSupplier(hotelSearch.searchId,{hid:"100001",optionId:"hotel-option"},actor);fixtureQuotes.push(hotelQuote.quoteId);
 const hotelGuests={...guests,travellers:[{...guests.travellers[0],roomIndex:0},{...guests.travellers[0],fN:"Second",roomIndex:0},{ti:"Master",pt:"CHILD",fN:"Young",lN:"Guest",roomIndex:0,dob:"2021-01-01"},{...guests.travellers[0],fN:"Third",roomIndex:1},{ti:"Master",pt:"CHILD",fN:"Older",lN:"Guest",roomIndex:1,dob:"2018-01-01"}]};
 const hotelPayment=await createPayment(request("/api/payments/create",{quoteId:hotelQuote.quoteId,guests:hotelGuests,acceptedTotalMinor:hotelQuote.totalMinor}));assert.equal(hotelPayment.status,200);const hotelGateway=await hotelPayment.json();fixtureBookings.push(hotelGateway.bookingId);
 const hotelVerified=await verifyPayment(request("/api/payments/verify",{bookingId:hotelGateway.bookingId,razorpay_order_id:gatewayOrder,razorpay_payment_id:gatewayPayment,razorpay_signature:signature(`${gatewayOrder}|${gatewayPayment}`,"contract-test-secret")}));assert.equal(hotelVerified.status,200);
 await runBookingJob();assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[hotelGateway.bookingId])).rows[0].status,"CONFIRMED");assert.equal(bookCalls,2);
 console.log("PASS mixed room occupancy: mocked Hotel v3 listing → pricing → review → Razorpay → re-review → book → confirmed status.");
 const commandSecret=randomBytes(32).toString("hex");process.env.CRM_COMMAND_KEYS=JSON.stringify({test:commandSecret});process.env.CRM_STAFF_ACTORS=JSON.stringify({"crm-staff":userId});
 await pool.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1',[userId]);await pool.query("INSERT INTO admin_grants(user_id,permissions,active) VALUES($1,$2,true)",[userId,["bookings:read","finance:read","cancellations:manage","cancellations:execute","integrations:manage"]]);
 async function command(action:string,data:object={},targetId?:string,id=randomUUID(),valid=true){const payload={id,bookingId,actorId:"crm-staff",action,...(targetId?{targetId}:{}),data};const raw=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));return {id,payload,response:await crmCommand(new Request(base+"/api/integrations/crm/commands",{method:"POST",headers:{"Content-Type":"application/json","x-maxtravel-key-id":"test","x-maxtravel-timestamp":timestamp,"x-maxtravel-command-id":id,"x-maxtravel-signature":valid?crmSignature(timestamp,id,raw,commandSecret):"0".repeat(64)},body:raw}))};}
 assert.equal((await command("STATUS",{},undefined,randomUUID(),false)).response.status,401);
 const live=await command("STATUS");assert.equal(live.response.status,200);const liveBody=await live.response.json();assert.equal(liveBody.order.status,"TICKETED");assert.equal("guests_encrypted" in liveBody.order,false);assert.equal("payments" in liveBody,false);
 assert.equal((await command("STATUS",{},undefined,live.id)).response.status,200);assert.equal((await command("RESYNC",{},undefined,live.id)).response.status,409);
 const cancellation=await command("CANCELLATION_REQUEST",{reason:"Customer requests review"});assert.equal(cancellation.response.status,202);const cancellationId=(await cancellation.response.json()).cancellation.id;
 assert.equal((await command("CANCELLATION_REQUEST",{reason:"Customer requests review"},undefined,cancellation.id)).response.status,202);
 await pool.query("UPDATE crm_commands SET state='STARTED',response=NULL WHERE id=$1",[cancellation.id]);assert.equal((await command("CANCELLATION_REQUEST",{reason:"Customer requests review"},undefined,cancellation.id)).response.status,202);assert.equal((await pool.query("SELECT count(*)::int AS n FROM cancellation_requests WHERE order_id=$1",[bookingId])).rows[0].n,1);
 assert.equal((await command("CANCELLATION_REVIEW",{status:"UNDER_REVIEW",note:"Reviewing requested cancellation"},cancellationId)).response.status,200);
 assert.equal((await command("CANCELLATION_OFFER",{refundMinor:Number(quote.totalMinor),penaltyMinor:0,note:"Test cancellation terms"},cancellationId)).response.status,200);
 assert.equal((await command("CANCELLATION_EXECUTE",{},cancellationId)).response.status,409); // No customer acceptance; never submit cancellation.
 assert.equal((await command("CANCELLATION_CHARGES",{},randomUUID())).response.status,404);
 const sync=await command("RESYNC");assert.equal(sync.response.status,200);assert.equal((await command("RESYNC",{},undefined,sync.id)).response.status,200);
 await pool.query("UPDATE admin_grants SET active=false WHERE user_id=$1",[userId]);assert.equal((await command("STATUS")).response.status,403);
 console.log("PASS CRM commands: separate-key signatures, mapped MFA grants, command replay/collision, scoped targets, cancellation review/offers, customer-consent gate, durable resync and revoked-grant denial.");

}finally{
 globalThis.fetch=originalFetch;for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 const ownedFixtures=userId?(await pool.query("SELECT id FROM orders WHERE user_id=$1",[userId])).rows.map(r=>r.id):fixtureBookings;
 for(const id of ownedFixtures){await pool.query("DELETE FROM crm_commands WHERE booking_id=$1",[id]);await pool.query("DELETE FROM cancellation_requests WHERE order_id=$1",[id]);for(const table of ["customer_notifications","supplier_booking_payloads","booking_jobs","gateway_intents","payments"])await pool.query(`DELETE FROM ${table} WHERE order_id=$1`,[id]);for(const table of ["outbox_events","audit_events"])await pool.query(`DELETE FROM ${table} WHERE ${table==="outbox_events"?"aggregate_id":"entity_id"}=$1`,[id]);await pool.query("DELETE FROM orders WHERE id=$1",[id]);}
 for(const id of fixtureQuotes)await pool.query("DELETE FROM supplier_quotes WHERE id=$1",[id]);for(const id of fixtureSearches)await pool.query("DELETE FROM supplier_searches WHERE id=$1",[id]);if(userId)await pool.query('DELETE FROM admin_grants WHERE user_id=$1',[userId]);if(userId)await pool.query('DELETE FROM "user" WHERE id=$1',[userId]);await pool.end();await database().end();
}
