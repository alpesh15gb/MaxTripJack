import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from './db';
import {HttpError} from './http';
import {payGlocalConfig} from './providers/payglocal-config';
import {formatPayGlocalAmount} from './providers/payglocal';
import {payGlocalRequest} from './providers/payglocal-wire';
type Refund={id:string;payment_id:string;order_id:string;gateway_payment_id:string;amount_minor:string;operation_started_at:Date|null};
export async function reservePayGlocalRefund(tx:Pick<PoolClient,'query'>,refund:Refund){
 const config=payGlocalConfig();const payment=(await tx.query("SELECT a.merchant_id,a.amount_minor FROM payglocal_attempts a WHERE a.order_id=$1 AND a.gid=$2 AND a.state='CAPTURED'",[refund.order_id,refund.gateway_payment_id])).rows[0];
 if(payment?.merchant_id!==config.merchantId)throw new HttpError(409,'Refund merchant identity requires reconciliation.');
 const reserved=(await tx.query("SELECT COALESCE(sum(amount_minor),0)::text AS amount FROM refunds WHERE payment_id=$1 AND status<>'FAILED'",[refund.payment_id])).rows[0];
 if(BigInt(reserved.amount)>BigInt(payment.amount_minor))throw new HttpError(409,'Refund reservations exceed the captured payment.');
 const prior=(await tx.query('SELECT * FROM payglocal_refund_attempts WHERE refund_id=$1',[refund.id])).rows[0];
 if(prior){if(prior.amount_minor!==refund.amount_minor||prior.original_gid!==refund.gateway_payment_id||prior.merchant_id!==config.merchantId)throw new HttpError(409,'Refund identity requires reconciliation.');return {...prior,created:false};}
 // An operation already started by an older adapter must never be reissued.
 if(refund.operation_started_at)throw new HttpError(409,'Existing refund requires reconciliation before execution.');
 const inserted=await tx.query('INSERT INTO payglocal_refund_attempts(refund_id,merchant_txn_id,merchant_id,original_gid,amount_minor) VALUES($1,$2,$3,$4,$5) RETURNING *',[refund.id,randomUUID().replaceAll('-',''),config.merchantId,refund.gateway_payment_id,refund.amount_minor]);return {...inserted.rows[0],created:true};
}
export async function executePayGlocalRefund(refund:Refund&{payglocal:{created:boolean;merchant_txn_id:string;merchant_id:string;gid:string|null}},actorId:string|null){
 const config=payGlocalConfig(),attempt=refund.payglocal;
 if(attempt.merchant_id!==config.merchantId||!/^[A-Za-z0-9_-]{1,128}$/.test(refund.gateway_payment_id))throw new HttpError(409,'Refund identity requires reconciliation.');
 const raw=attempt.created?await payGlocalRequest(`/gl/v1/payments/${refund.gateway_payment_id}/refund`,{merchantTxnId:attempt.merchant_txn_id,refundType:'P',paymentData:{totalAmount:formatPayGlocalAmount(Number(refund.amount_minor)),txnCurrency:'INR'}},config):await payGlocalRequest(`/gl/v1/payments/${attempt.gid??attempt.merchant_txn_id}/status`,undefined,config);
 const data=raw.data as Record<string,unknown>|undefined,gid=data?.gid??raw.gid;
 if(!data||typeof gid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(gid)||(attempt.gid&&attempt.gid!==gid)||data.originalGid!==refund.gateway_payment_id||typeof data.refundAmount!=='string'||!/^\d{1,14}(?:\.\d{1,2})?$/.test(data.refundAmount)||Math.round(Number(data.refundAmount)*100)!==Number(refund.amount_minor)||(data.txnCurrency!==undefined&&data.txnCurrency!=='INR')||(data.merchantTxnId!==undefined&&data.merchantTxnId!==attempt.merchant_txn_id)||raw.status!=='SENT_FOR_REFUND'||(data.status!==undefined&&data.status!==raw.status))throw new HttpError(502,'Refund outcome requires reconciliation. Do not submit another refund.');
 const status=await transaction(async tx=>{
  const current=(await tx.query('SELECT status,gateway_refund_id FROM refunds WHERE id=$1 FOR UPDATE',[refund.id])).rows[0];if(current?.status==='COMPLETED')return 'COMPLETED';if(current?.status!=='PROCESSING')throw new HttpError(409,'Refund state changed during reconciliation.');
  if(current.gateway_refund_id&&current.gateway_refund_id!==gid)throw new HttpError(409,'Conflicting refund reference requires reconciliation.');
  await tx.query("UPDATE payglocal_refund_attempts SET gid=$2,last_provider_status=$3,updated_at=now() WHERE refund_id=$1",[refund.id,gid,raw.status]);
  await tx.query("UPDATE refunds SET gateway_refund_id=$2,next_check=now()+interval '1 hour' WHERE id=$1",[refund.id,gid]);
  if(!current.gateway_refund_id){await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'REFUND_GATEWAY_UPDATE',$3,$4)",[randomUUID(),actorId,refund.id,{provider:'PAYGLOCAL',status:'PROCESSING',providerStatus:'SENT_FOR_REFUND'}]);await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'refund.updated',$3)",[randomUUID(),refund.order_id,{bookingId:refund.order_id,refundId:refund.id,status:'PROCESSING',provider:'PAYGLOCAL',amountMinor:Number(refund.amount_minor)}]);}
  return 'PROCESSING';
 });
 // SENT_FOR_REFUND acknowledges a request, not settled customer funds. Final
 // completion awaits the merchant's authenticated settlement contract in UAT.
 return {id:refund.id,status};
}
