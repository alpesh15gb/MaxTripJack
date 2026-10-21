import "server-only";
import { randomUUID } from "node:crypto";
import { transaction } from "./db";
import { HttpError } from "./http";
export async function recordCapturedPayment(gatewayOrderId:string,gatewayPaymentId:string,amount:number,currency:string,method?:string){return transaction(async tx=>{
 const result=await tx.query("SELECT * FROM payments WHERE gateway_order_id=$1 AND provider='RAZORPAY' FOR UPDATE",[gatewayOrderId]);const payment=result.rows[0];
 if(!payment||String(payment.amount_minor)!==String(amount)||payment.currency!==currency)throw new HttpError(409,"Payment does not match the server order.");
 if(payment.gateway_payment_id&&payment.gateway_payment_id!==gatewayPaymentId)throw new HttpError(409,"Payment requires reconciliation.");
 if(payment.status!=="CAPTURED"){
 await tx.query("UPDATE payments SET status='CAPTURED',gateway_payment_id=$1,method=$3 WHERE id=$2",[gatewayPaymentId,payment.id,method?.slice(0,40)||null]);
 const updated=await tx.query("UPDATE orders SET status=CASE WHEN status='PAYMENT_PENDING' THEN 'PAID' ELSE 'MANUAL_REVIEW' END,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING status",[payment.order_id]);
 if(updated.rows[0]?.status==="PAID")await tx.query("INSERT INTO booking_jobs(order_id) VALUES($1) ON CONFLICT DO NOTHING",[payment.order_id]);
 await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'payment.captured',$3)",[randomUUID(),payment.order_id,{bookingId:payment.order_id,paymentId:gatewayPaymentId,amountMinor:amount,currency}]);
 }else if(method&&!payment.method){await tx.query("UPDATE payments SET method=$1 WHERE id=$2",[method.slice(0,40),payment.id]);await tx.query("UPDATE orders SET revision=revision+1 WHERE id=$1",[payment.order_id]);await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'payment.details_updated',$3)",[randomUUID(),payment.order_id,{bookingId:payment.order_id}]);}
 return {bookingId:payment.order_id};
});}
