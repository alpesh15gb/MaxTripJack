import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {HttpError} from './http';
import {day} from './providers/contracts';
const text=z.string().trim().min(5).max(128).regex(/^[^\u0000-\u001f\u007f]+$/);
export const settlementSchema=z.object({requestId:z.string().uuid(),acceptedAmountMinor:z.number().int().positive().safe(),gatewayRefundId:text,bankReference:text,settledOn:day,note:z.string().trim().min(10).max(1000),attested:z.literal(true)}).strict();
export type SettlementInput=z.infer<typeof settlementSchema>;
/** Finance's explicit checked evidence, not an invented provider status. The
 * HTTP boundary enforces MFA + refunds:execute and no provider call is made. */
export async function recordPayGlocalSettlement(tx:Pick<PoolClient,'query'>,refundId:string,input:SettlementInput,actorId:string){
 const data=settlementSchema.parse(input),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 if(data.settledOn>today)throw new HttpError(400,'Settlement date cannot be in the future.');
 const row=(await tx.query("SELECT r.*,p.provider,p.currency,p.order_id,p.gateway_payment_id FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN orders o ON o.id=p.order_id WHERE r.id=$1 FOR UPDATE OF r,p,o",[refundId])).rows[0];
 if(!row||row.provider!=='PAYGLOCAL'||row.currency!=='INR')throw new HttpError(409,'This settlement action is restricted to the original PayGlocal refund.');
 const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const prior=(await tx.query('SELECT request_id,body_hash FROM payglocal_refund_settlements WHERE refund_id=$1',[refundId])).rows[0];
 if(prior){if(prior.request_id===data.requestId&&prior.body_hash===hash)return {id:refundId,status:'COMPLETED',duplicate:true};throw new HttpError(409,'Settlement was already recorded with different evidence.');}
 if(row.status!=='PROCESSING'||!row.gateway_refund_id||row.gateway_refund_id!==data.gatewayRefundId||Number(row.amount_minor)!==data.acceptedAmountMinor)throw new HttpError(409,'Check the approved amount and original refund reference before recording checked evidence.');
 const linked=(await tx.query('SELECT r.gid,r.original_gid,r.amount_minor,r.merchant_id,a.merchant_id AS original_merchant FROM payglocal_refund_attempts r JOIN payglocal_attempts a ON a.order_id=$2 WHERE r.refund_id=$1',[refundId,row.order_id])).rows[0];
 if(!linked||linked.gid!==row.gateway_refund_id||linked.original_gid!==row.gateway_payment_id||linked.amount_minor!==row.amount_minor||linked.merchant_id!==linked.original_merchant)throw new HttpError(409,'The provider refund reference must be reconciled before recording settlement.');
 const inserted=await tx.query('INSERT INTO payglocal_refund_settlements(refund_id,request_id,body_hash,actor_id,gateway_refund_id,amount_minor,bank_reference,settled_on,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING refund_id',[refundId,data.requestId,hash,actorId,data.gatewayRefundId,row.amount_minor,data.bankReference,data.settledOn,data.note]);
 if(!inserted.rowCount)throw new HttpError(409,'This evidence request reference has already been used.');
 await tx.query("UPDATE refunds SET status='COMPLETED',next_check=NULL WHERE id=$1",[refundId]);
 await tx.query('UPDATE orders SET revision=revision+1,updated_at=now() WHERE id=$1',[row.order_id]);
 await tx.query("INSERT INTO customer_notifications(id,order_id,revision,status) SELECT $1,id,revision,'REFUND_COMPLETED' FROM orders WHERE id=$2 ON CONFLICT DO NOTHING",[randomUUID(),row.order_id]);
 await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'REFUND_SETTLEMENT_RECORDED',$3,$4)",[randomUUID(),actorId,refundId,{source:'STAFF_VERIFIED_EVIDENCE',provider:'PAYGLOCAL',amountMinor:data.acceptedAmountMinor,currency:'INR',gatewayRefundId:data.gatewayRefundId,bankReference:data.bankReference,settledOn:data.settledOn,note:data.note}]);
 await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'refund.updated',$3)",[randomUUID(),row.order_id,{bookingId:row.order_id,refundId,status:'COMPLETED',amountMinor:data.acceptedAmountMinor,provider:'PAYGLOCAL',source:'STAFF_VERIFIED_EVIDENCE'}]);
 return {id:refundId,status:'COMPLETED',duplicate:false};
}
