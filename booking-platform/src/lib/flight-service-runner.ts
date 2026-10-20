import "server-only";
import { randomUUID } from "node:crypto";
import { database,transaction } from "./db";
import { tripjack,paths } from "./providers/tripjack";
import { bookingBody,guestSchema } from "./providers/contracts";
import { seal,unseal } from "./vault";
import { passengerIdentitiesMatch } from "./passenger-identity";
// Internal database rows and supplier response data are validated before mutation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
export async function runFlightServiceJob(job:Row,order:Row,lease:string){
 await database().query("UPDATE booking_jobs SET lease_until=now()+interval '600 seconds' WHERE order_id=$1 AND lease_token=$2",[order.id,lease]);
 const product=order.service_kind;const parent=(await database().query("SELECT * FROM orders WHERE id=$1",[order.parent_order_id])).rows[0];
 if(!job.attempted){
  if(parent?.status!=="TICKETED")throw Error("Original booking no longer active");
  const paid=Number(order.total_minor)===0||(await database().query("SELECT id FROM payments WHERE order_id=$1 AND status='CAPTURED' AND amount_minor=$2",[order.id,order.total_minor])).rowCount;
  if(!paid)throw Error("No verified service payment");
  const guests=guestSchema.parse(unseal(order.guests_encrypted,order.id));let payload:Row;
  if(product==="ANCILLARY")payload={paymentInfos:[{amount:Number(order.supplier_minor)/100}],sI:order.service_payload.sI};
  else{payload=bookingBody("FLIGHT",order.reviewed_booking_id,Number(order.supplier_minor),guests);const supplied=order.review.travellerInfo??order.review.travellerInfos;if(!passengerIdentitiesMatch(guests.travellers,supplied))throw Error("Original passenger data missing from reissue review");payload.travellerInfo=supplied;payload.oldBookingId=order.service_payload.oldBookingId;payload.paymentInfos=[{amount:Number(order.supplier_minor)/100,bookingId:order.reviewed_booking_id}];}
  await transaction(async tx=>{const marked=await tx.query("UPDATE booking_jobs SET attempted=true,state='POLLING' WHERE order_id=$1 AND lease_token=$2 AND attempted=false RETURNING order_id",[order.id,lease]);if(!marked.rowCount)throw Error("Lease lost");await tx.query("UPDATE orders SET status='BOOKING_PENDING',supplier_booking_id=$1 WHERE id=$2",[order.reviewed_booking_id,order.id]);});job.attempted=true;
  try{const submitted=await tripjack("FLIGHT",product==="ANCILLARY"?"/oms/v1/air/amendment/add/ssr":"/oms/v1/air/amendment/auto-reissue",payload,true);if(product==="ANCILLARY"&&Array.isArray(submitted.amendmentids)&&submitted.amendmentids.length&&submitted.amendmentids.every((id:unknown)=>typeof id==="string"&&id.length<200)){job.amendment_ids=submitted.amendmentids;await database().query("UPDATE booking_jobs SET amendment_ids=$1 WHERE order_id=$2 AND lease_token=$3",[JSON.stringify(job.amendment_ids),order.id,lease]);}}
  catch{/* Submission outcome may be unknown. Never submit the paid operation twice. */}
 }
 let status="BOOKING_PENDING",supplier:Row={};
 if(product==="ANCILLARY"){
  if(!Array.isArray(job.amendment_ids)||!job.amendment_ids.length||job.amendment_ids.length!==order.service_payload.expectedAmendmentCount){status="MANUAL_REVIEW";supplier={order:{status:"UNKNOWN"},note:"SSR response lost or amendment IDs missing. Reconcile in TripJack; never resubmit."};}
  else{const amendments=[];for(const amendmentId of job.amendment_ids){const detail=await tripjack("FLIGHT","/oms/v1/air/amendment/amendment-details",{amendmentId},true);if(detail.bookingId!==order.service_payload.oldBookingId)throw Error("SSR amendment does not match the original booking");amendments.push(detail);}supplier={amendments,order:{status:"PENDING"}};
   if(amendments.every(a=>a.amendmentStatus==="SUCCESS")){const charged=amendments.reduce((sum,a)=>sum+Number(a.totalAmount),0);const segments=amendments.flatMap(a=>Array.isArray(a.SSRAmendmentDetails)?a.SSRAmendmentDetails:[]);
    const selectedMatch=order.service_payload.sI.every((segment:Row)=>segment.bI.tI.every((pax:Row)=>["sbi","smi","ssi"].every(field=>{if(!pax[field])return true;const matched=segments.filter((s:Row)=>String(s.id)===String(segment.id)).flatMap((s:Row)=>Array.isArray(s.tI)?s.tI:[]).filter((p:Row)=>String(p.id)===String(pax.id));return matched.some((p:Row)=>{const value=field==="sbi"?p.ssrBaggageInfos:field==="smi"?p.ssrMeaInfos??p.ssrMealInfos:p.ssrSeatInfos;return (Array.isArray(value)?value:[value]).some(item=>item?.code===pax[field].code);});})));
    status=selectedMatch&&Number.isFinite(charged)&&Math.round(charged*100)===Number(order.supplier_minor)?"CONFIRMED":"MANUAL_REVIEW";}
   else if(amendments.every(a=>a.amendmentStatus==="REJECTED"))status="BOOKING_FAILED";
   else if(amendments.some(a=>a.amendmentStatus==="REJECTED")||job.checks>=4)status="MANUAL_REVIEW";
  }
 }else{supplier=await tripjack("FLIGHT",paths.FLIGHT.details,{bookingId:order.reviewed_booking_id,requirePaxPricing:true},true);status=supplier.order?.status==="SUCCESS"?"TICKETED":["FAILED","ABORTED","UNCONFIRMED"].includes(supplier.order?.status)?"BOOKING_FAILED":job.checks>=35?"MANUAL_REVIEW":"BOOKING_PENDING";}
 await transaction(async tx=>{const owned=await tx.query("SELECT o.id FROM orders o JOIN booking_jobs j ON j.order_id=o.id WHERE o.id=$1 AND j.lease_token=$2 FOR UPDATE OF o,j",[order.id,lease]);if(!owned.rowCount)throw Error("Service job lease lost");await tx.query("UPDATE orders SET status=$1,supplier_status=$2,revision=revision+1,updated_at=now() WHERE id=$3",[status,String(supplier.order?.status??status),order.id]);await tx.query("INSERT INTO supplier_booking_payloads(order_id,encrypted_payload) VALUES($1,$2) ON CONFLICT(order_id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,updated_at=now()",[order.id,seal(supplier,order.id)]);
 const done=status!=="BOOKING_PENDING";await tx.query("UPDATE booking_jobs SET state=$1,checks=checks+1,next_attempt=now()+interval '10 seconds',lease_token=NULL,lease_until=NULL WHERE order_id=$2 AND lease_token=$3",[done?"DONE":"POLLING",order.id,lease]);
 if(done){await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'flight.service_updated',$3)",[randomUUID(),order.id,{bookingId:order.id,parentBookingId:parent.id,kind:product,status}]);await tx.query("UPDATE orders SET revision=revision+1,updated_at=now() WHERE id=$1",[parent.id]);await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'flight.service_updated',$3)",[randomUUID(),parent.id,{bookingId:parent.id,serviceBookingId:order.id,kind:product,status}]);}
 });return true;
}
