import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { razorpay,razorpayKey } from "@/lib/providers/razorpay";
export async function executeRefund(refundId:string,actorId:string|null=null){
 razorpayKey();const id=z.string().uuid().parse(refundId);
 const refund=await transaction(async tx=>{
  const found=await tx.query("SELECT r.*,p.gateway_payment_id,p.order_id,o.status AS booking_status FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN orders o ON o.id=p.order_id WHERE r.id=$1 FOR UPDATE OF r,p,o",[id]);const row=found.rows[0];
  if(!row||!["APPROVED","PROCESSING"].includes(row.status))throw new HttpError(409,"Refund must be approved before execution.");
  if(row.booking_status!=="BOOKING_FAILED"){
   const consent=await tx.query("SELECT COALESCE(sum(refund_offer_minor),0)::text AS amount FROM cancellation_requests WHERE order_id=$1 AND status='CONFIRMED' AND accepted_at IS NOT NULL",[row.order_id]);
   const reserved=await tx.query("SELECT COALESCE(sum(r.amount_minor),0)::text AS amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1 AND r.status IN ('REQUESTED','APPROVED','PROCESSING','COMPLETED')",[row.order_id]);
   if(!["CANCELLED","TICKETED","CONFIRMED"].includes(row.booking_status)||Number(reserved.rows[0].amount)>Number(consent.rows[0].amount))throw new HttpError(409,"Refund exceeds supplier-confirmed, customer-accepted cancellation terms.");
  }
  if(row.next_check&&new Date(row.next_check).getTime()>Date.now())throw new HttpError(409,"Refund operation is already in progress. Wait before reconciliation.");
  await tx.query("UPDATE refunds SET status='PROCESSING',operation_started_at=COALESCE(operation_started_at,now()),next_check=now()+interval '60 seconds' WHERE id=$1",[id]);return row;
 });
 // Same persisted id and identical payload on every retry; Razorpay guarantees
 // idempotency for this header. Unknown outcomes remain PROCESSING, not FAILED.
 const result=refund.gateway_refund_id?await razorpay(`/refunds/${encodeURIComponent(refund.gateway_refund_id)}`):await razorpay(`/payments/${encodeURIComponent(refund.gateway_payment_id)}/refund`,{amount:Number(refund.amount_minor),speed:"normal",receipt:id,notes:{refundId:id}},{"X-Refund-Idempotency":id});
 if(!result.id||result.payment_id!==refund.gateway_payment_id||result.amount!==Number(refund.amount_minor)||result.currency!=="INR")throw new HttpError(502,"Gateway refund response needs reconciliation.");
 let status=result.status==="processed"?"COMPLETED":result.status==="failed"?"FAILED":"PROCESSING";
 await transaction(async tx=>{const current=await tx.query("SELECT status FROM refunds WHERE id=$1 FOR UPDATE",[id]);if(current.rows[0]?.status==="COMPLETED"){status="COMPLETED";return;}await tx.query("UPDATE refunds SET gateway_refund_id=$1,status=$2,next_check=now()+interval '60 seconds' WHERE id=$3",[result.id,status,id]);await tx.query("UPDATE orders SET revision=revision+1,updated_at=now() WHERE id=$1",[refund.order_id]);if(status==="COMPLETED")await tx.query("INSERT INTO customer_notifications(id,order_id,revision,status) SELECT $1,id,revision,'REFUND_COMPLETED' FROM orders WHERE id=$2 ON CONFLICT DO NOTHING",[randomUUID(),refund.order_id]);await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'REFUND_GATEWAY_UPDATE',$3,$4)",[randomUUID(),actorId,id,{status}]);await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'refund.updated',$3)",[randomUUID(),refund.order_id,{bookingId:refund.order_id,refundId:id,status,amountMinor:Number(refund.amount_minor)}]);});return {id,status};
}
