import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpError } from "./http";
import { assertPayGlocalStatusBinding, payGlocalPaymentState, validatePayGlocalUrl, type PayGlocalAttempt, type PayGlocalVerifiedStatus } from "./providers/payglocal";

type Tx = Pick<PoolClient, "query">;
type Row = { order_id:string; merchant_txn_id:string; merchant_id:string; amount_minor:string; currency:"INR"; gid:string|null; state:string; order_status:string; total_minor:string; provider:string; redirect_url:string|null; status_url:string|null };
const locked = `SELECT a.*,o.status AS order_status,o.total_minor,g.provider FROM payglocal_attempts a JOIN orders o ON o.id=a.order_id JOIN gateway_intents g ON g.order_id=o.id WHERE a.order_id=$1 FOR UPDATE OF o,g,a`;
function asAttempt(row:Row):PayGlocalAttempt { return { merchantTxnId:row.merchant_txn_id, merchantId:row.merchant_id, amountMinor:Number(row.amount_minor), currency:row.currency,gid:row.gid }; }
async function load(tx:Tx,id:string) {
  const row=(await tx.query<Row>(locked,[id])).rows[0];
  if(!row || row.provider!=="PAYGLOCAL" || row.total_minor!==row.amount_minor) throw new HttpError(409,"PayGlocal intent requires reconciliation.");
  return row;
}
/** Caller MUST supply a transaction. Never call a provider unless created=true. */
export async function reservePayGlocalAttempt(tx:Tx,bookingId:string,merchantId:string) {
  if(!merchantId || merchantId.length>200) throw new HttpError(503,"PayGlocal merchant is not configured.");
  const order=(await tx.query<{status:string;total_minor:string;currency:"INR"}>("SELECT status,total_minor,currency FROM orders WHERE id=$1 FOR UPDATE",[bookingId])).rows[0];
  if(!order) throw new HttpError(404,"Booking not found.");
  const intent=(await tx.query<{provider:string}>("SELECT provider FROM gateway_intents WHERE order_id=$1 FOR UPDATE",[bookingId])).rows[0];
  if(intent && intent.provider!=="PAYGLOCAL") throw new HttpError(409,"Existing payment provider cannot be changed.");
  const prior=(await tx.query<Row>("SELECT * FROM payglocal_attempts WHERE order_id=$1",[bookingId])).rows[0];
  if(prior) {
    if(prior.merchant_id!==merchantId || prior.amount_minor!==order.total_minor || prior.currency!==order.currency) throw new HttpError(409,"Existing payment identity differs.");
    return {created:false,attempt:asAttempt(prior)};
  }
  if(order.status!=="PAYMENT_PENDING" || !Number.isSafeInteger(Number(order.total_minor)) || Number(order.total_minor)<=0 || order.currency!=="INR") throw new HttpError(409,"Booking cannot start payment.");
  if(!intent) await tx.query("INSERT INTO gateway_intents(order_id,provider) VALUES($1,'PAYGLOCAL')",[bookingId]);
  const merchantTxnId=randomUUID().replaceAll("-", "");
  await tx.query("INSERT INTO payglocal_attempts(order_id,merchant_txn_id,merchant_id,amount_minor,currency) VALUES($1,$2,$3,$4,$5)",[bookingId,merchantTxnId,merchantId,order.total_minor,order.currency]);
  return {created:true,attempt:{merchantTxnId,merchantId,amountMinor:Number(order.total_minor),currency:order.currency,gid:null} satisfies PayGlocalAttempt};
}

type Initiation = Omit<PayGlocalVerifiedStatus,"status"|"source"> & {redirectUrl:string;statusUrl:string};
export async function persistPayGlocalInitiation(tx:Tx,bookingId:string,result:Initiation) {
  const row=await load(tx,bookingId);
  assertPayGlocalStatusBinding({...asAttempt(row),gid:row.gid??result.gid},{...result,status:"INPROGRESS",source:"SERVER_STATUS"});
  const redirectUrl=validatePayGlocalUrl(result.redirectUrl,"redirect");
  const statusUrl=validatePayGlocalUrl(result.statusUrl,"status",result.gid);
  if(row.gid) {
    if(row.gid!==result.gid || row.redirect_url!==redirectUrl || row.status_url!==statusUrl) throw new HttpError(409,"Conflicting PayGlocal initiation requires reconciliation.");
    return {linked:false};
  }
  if(!["STARTED","UNKNOWN"].includes(row.state)) throw new HttpError(409,"PayGlocal attempt already progressed.");
  await tx.query("UPDATE payglocal_attempts SET gid=$2,redirect_url=$3,status_url=$4,state='PENDING',updated_at=now() WHERE order_id=$1",[bookingId,result.gid,redirectUrl,statusUrl]);
  await tx.query("UPDATE gateway_intents SET state='CREATED',gateway_order_id=$2 WHERE order_id=$1",[bookingId,result.gid]);
  await tx.query("INSERT INTO payments(id,order_id,gateway_order_id,amount_minor,currency,provider) VALUES($1,$2,$3,$4,$5,'PAYGLOCAL')",[randomUUID(),bookingId,result.gid,row.amount_minor,row.currency]);
  return {linked:true};
}

/** Transport timeout is uncertainty, not failure or permission to resubmit. */
export async function markPayGlocalUnknown(tx:Tx,bookingId:string) {
  const row=await load(tx,bookingId);
  if(row.state==="CAPTURED") return;
  await tx.query("UPDATE payglocal_attempts SET state='UNKNOWN',updated_at=now() WHERE order_id=$1",[bookingId]);
  if(!row.gid) await tx.query("UPDATE gateway_intents SET state='UNKNOWN' WHERE order_id=$1",[bookingId]);
}

/** Only an authenticated server status adapter may supply this normalized result.
 * The source marker is NOT signature verification. No HTTP callback calls this.
 * Transaction rollback is required on any error, including outbox insert failure.
 */
export async function recordPayGlocalVerifiedStatus(tx:Tx,bookingId:string,result:PayGlocalVerifiedStatus) {
  const row=await load(tx,bookingId);
  assertPayGlocalStatusBinding(asAttempt(row),result);
  if(row.state==="CAPTURED") return {captured:true,duplicate:true,state:"CAPTURED"};
  const state=payGlocalPaymentState(result.status);
  if(state!=="CAPTURED") {
    await tx.query("UPDATE payglocal_attempts SET state=$2,last_provider_status=$3,updated_at=now() WHERE order_id=$1",[bookingId,state,result.status]);
    return {captured:false,duplicate:false,state};
  }
  const payment=(await tx.query<{id:string;status:string;amount_minor:string;currency:string;gateway_payment_id:string|null}>("SELECT id,status,amount_minor,currency,gateway_payment_id FROM payments WHERE order_id=$1 AND gateway_order_id=$2 AND provider='PAYGLOCAL' FOR UPDATE",[bookingId,row.gid])).rows[0];
  if(!payment || payment.amount_minor!==row.amount_minor || payment.currency!==row.currency || (payment.gateway_payment_id && payment.gateway_payment_id!==row.gid)) throw new HttpError(409,"PayGlocal payment link requires reconciliation.");
  if(payment.status==="CAPTURED") throw new HttpError(409,"PayGlocal capture state requires reconciliation.");
  await tx.query("UPDATE payments SET status='CAPTURED',gateway_payment_id=$2 WHERE id=$1",[payment.id,row.gid]);
  await tx.query("UPDATE payglocal_attempts SET state='CAPTURED',last_provider_status=$2,updated_at=now() WHERE order_id=$1",[bookingId,result.status]);
  // Late success is recorded financially, but never blindly retries supplier work.
  await tx.query("UPDATE orders SET status=CASE WHEN status='PAYMENT_PENDING' THEN 'PAID' ELSE 'MANUAL_REVIEW' END,revision=revision+1,updated_at=now() WHERE id=$1",[bookingId]);
  await tx.query("INSERT INTO booking_jobs(order_id) SELECT id FROM orders WHERE id=$1 AND status='PAID' AND quote_id IS NOT NULL ON CONFLICT DO NOTHING",[bookingId]);
  await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'payment.captured',$3)",[randomUUID(),bookingId,{bookingId,paymentId:row.gid,provider:"PAYGLOCAL",amountMinor:Number(row.amount_minor),currency:row.currency}]);
  await tx.query("INSERT INTO audit_events(id,action,entity_id) VALUES($1,'PAYGLOCAL_CAPTURE_VERIFIED',$2)",[randomUUID(),bookingId]);
  return {captured:true,duplicate:false,state};
}
