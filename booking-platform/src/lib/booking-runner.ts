import "server-only";
import { checkoutExtrasFulfilled } from "./checkout-extras-contract";
import { initialFlightBody,validateFlightFare } from "./checkout-extras";
import { FareValidationBlockedError } from "./fare-validation";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { database,transaction } from "./db";
import { tripjack,paths,Product } from "./providers/tripjack";
import { bookingBody,guestSchema,minor } from "./providers/contracts";
import { seal,unseal } from "./vault";
import { runFlightServiceJob } from "./flight-service-runner";
export async function runBookingJob(){
 const lease=randomUUID();
 const claim=await database().query("UPDATE booking_jobs SET lease_token=$1,lease_until=now()+interval '240 seconds' WHERE order_id=(SELECT order_id FROM booking_jobs WHERE state IN ('READY','POLLING') AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",[lease]);
 const job=claim.rows[0];if(!job)return false;
 const result=await database().query("SELECT o.*,q.review,q.selection,q.service_payload,q.supplier_booking_id AS reviewed_booking_id FROM orders o JOIN supplier_quotes q ON q.id=o.quote_id WHERE o.id=$1",[job.order_id]);const order=result.rows[0];
 try{
 if(!order||!["PAID","BOOKING_PENDING"].includes(order.status))throw Error("Order not eligible");
 if(order.service_kind)return await runFlightServiceJob(job,order,lease);
 const product=order.product as Product;
 if(!job.attempted){
  const captured=await database().query("SELECT id FROM payments WHERE order_id=$1 AND status='CAPTURED' AND amount_minor=$2",[order.id,order.total_minor]);if(!captured.rowCount)throw Error("No verified payment");
  const guests=guestSchema.parse(unseal(order.guests_encrypted,order.id));
  let bookingId=order.reviewed_booking_id;
  if(product==="HOTEL"){
    const review=await tripjack("HOTEL",paths.HOTEL.review,order.selection);
    if(!review.bookingId||minor(review.option?.pricing?.totalPrice)!==Number(order.supplier_minor)||!isDeepStrictEqual(review.option?.cancellation,order.review.option?.cancellation)||!isDeepStrictEqual(review.option?.compliance,order.review.option?.compliance))throw Error("Hotel review changed after payment");
    bookingId=review.bookingId;
  }
  const payload=product==="FLIGHT"?initialFlightBody(bookingId,Number(order.supplier_minor),guests,order.selection.checkoutExtras):bookingBody(product,bookingId,Number(order.supplier_minor),guests);
  if(product==="FLIGHT"){
   await validateFlightFare(order.quote_id,payload,Number(order.supplier_minor),"PREBOOK");
  }
  // Persist the booking reference and attempt marker BEFORE calling the supplier.
  // On process crash, recovery queries this reference; it never resubmits Book.
  await transaction(async tx=>{
   const marked=await tx.query("UPDATE booking_jobs SET attempted=true,state='POLLING' WHERE order_id=$1 AND lease_token=$2 AND attempted=false RETURNING order_id",[order.id,lease]);if(!marked.rowCount)throw Error("Lease no longer owned");
   await tx.query("UPDATE orders SET status='BOOKING_PENDING',supplier_booking_id=$1,updated_at=now() WHERE id=$2",[bookingId,order.id]);
  });
  order.supplier_booking_id=bookingId;
  job.attempted=true;
  try{await tripjack(product,paths[product].book,payload,true);}catch{/* Unknown outcome: continue to booking-details, never repeat book. */}
 }
 const details=await tripjack(product,paths[product].details,{bookingId:order.supplier_booking_id, ...(product==="FLIGHT"?{requirePaxPricing:true}:{})},true);
 const status=details.order?.status;
 const supplierSuccess=product==="FLIGHT"?status==="SUCCESS":["SUCCESS","CONFIRMED"].includes(status);
 const reviewRequired=Boolean(supplierSuccess&&product==="FLIGHT"&&!checkoutExtrasFulfilled(details,guestSchema.parse(unseal(order.guests_encrypted,order.id)),order.selection.checkoutExtras));
 const success=supplierSuccess&&!reviewRequired;
 const failed=["FAILED","ABORTED","UNCONFIRMED","CANCELLED"].includes(status);
 await transaction(async tx=>{
  const current=await tx.query("SELECT o.id FROM orders o JOIN booking_jobs j ON j.order_id=o.id WHERE o.id=$1 AND j.lease_token=$2 FOR UPDATE OF o,j",[order.id,lease]);if(!current.rowCount)throw Error("Lease no longer owned");
  const newState=success?(product==="FLIGHT"?"TICKETED":"CONFIRMED"):failed?"BOOKING_FAILED":reviewRequired||job.checks>=35?"MANUAL_REVIEW":"BOOKING_PENDING";
  await tx.query("UPDATE orders SET status=$1,supplier_status=$2,revision=revision+1,updated_at=now() WHERE id=$3",[newState,String(status??"UNKNOWN"),order.id]);
  await tx.query("INSERT INTO supplier_booking_payloads(order_id,encrypted_payload) VALUES($1,$2) ON CONFLICT(order_id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,updated_at=now()",[order.id,seal(details,order.id)]);
  await tx.query("UPDATE booking_jobs SET state=$1,checks=checks+1,next_attempt=now()+interval '5 seconds',lease_until=NULL,lease_token=NULL WHERE order_id=$2 AND lease_token=$3",[success||failed||reviewRequired||job.checks>=35?"DONE":"POLLING",order.id,lease]);
  if(success||failed||reviewRequired||job.checks>=35)await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,$3,$4)",[randomUUID(),order.id,success?"booking.confirmed":failed?"booking.failed":"booking.review_required",{bookingId:order.id,supplierBookingId:order.supplier_booking_id,status:newState}]);
 });
 }catch(error){
  if(job.attempted&&job.checks<35){await database().query("UPDATE booking_jobs SET checks=checks+1,next_attempt=now()+interval '5 seconds',lease_until=NULL,lease_token=NULL WHERE order_id=$1 AND lease_token=$2",[job.order_id,lease]);}
  else {await transaction(async tx=>{const current=await tx.query("SELECT o.id FROM orders o JOIN booking_jobs j ON j.order_id=o.id WHERE o.id=$1 AND j.lease_token=$2 FOR UPDATE OF o,j",[job.order_id,lease]);if(!current.rowCount)return;const reviewRequired=job.attempted||error instanceof FareValidationBlockedError;const status=reviewRequired?"MANUAL_REVIEW":"BOOKING_FAILED";await tx.query("UPDATE orders SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1",[job.order_id,status]);await tx.query("UPDATE booking_jobs SET state='REVIEW',lease_token=NULL,lease_until=NULL WHERE order_id=$1 AND lease_token=$2",[job.order_id,lease]);await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,$3,$4)",[randomUUID(),job.order_id,reviewRequired?"booking.review_required":"booking.failed",{bookingId:job.order_id,status}]);});}
 }
 return true;
}
