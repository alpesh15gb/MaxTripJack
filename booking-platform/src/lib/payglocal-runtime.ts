import 'server-only';
import {isDeepStrictEqual} from 'node:util';
import {payGlocalTravelForQuote} from './payglocal-travel-runtime';
import {guestSchema} from './providers/contracts';
import {billingForProduct} from './billing';
import {unseal} from './vault';
import type {PayGlocalTravelData} from './providers/payglocal-travel';
import {randomUUID} from 'node:crypto';
import {database,transaction} from './db';
import {HttpError} from './http';
import {buildPayGlocalCheckoutPayload,validatePayGlocalUrl,type PayGlocalAttempt,type PayGlocalBillingData} from './providers/payglocal';
import {payGlocalConfig} from './providers/payglocal-config';
import {assertPayGlocalTravelContract} from './providers/payglocal-travel-contract';
import {initiatePayGlocal,readPayGlocalStatus} from './providers/payglocal-wire';
import {reservePayGlocalAttempt,persistPayGlocalInitiation,markPayGlocalUnknown,linkPayGlocalRecoveredStatus,recordPayGlocalVerifiedStatus} from './payglocal-payment';
export function payGlocalPayload(attempt:PayGlocalAttempt,product:'FLIGHT'|'HOTEL',billingData:PayGlocalBillingData,travelData:PayGlocalTravelData,returnChannel:'WEB'|'APP'='WEB'){
 const config=payGlocalConfig(),callback=new URL('/api/payments/payglocal/return',config.origin);if(returnChannel==='APP')callback.searchParams.set('app','1');return buildPayGlocalCheckoutPayload({attempt,product,billingData,travelData,applicationOrigin:config.origin,merchantCallbackURL:callback.href});
}
export async function createPayGlocalCheckout(bookingId:string,product:'FLIGHT'|'HOTEL',billingData:PayGlocalBillingData,returnChannel:'WEB'|'APP'='WEB'){
 assertPayGlocalTravelContract();
 const config=payGlocalConfig();
 const source=(await database().query("SELECT o.product,o.guests_encrypted,o.created_at,o.total_minor,o.supplier_minor,q.total_minor AS quote_total_minor,q.supplier_minor AS quote_supplier_minor,q.product AS quote_product,q.review,q.selection,q.service_kind,s.criteria,s.results FROM orders o JOIN supplier_quotes q ON q.id=o.quote_id JOIN supplier_searches s ON s.id=q.search_id WHERE o.id=$1",[bookingId])).rows[0];
 if(!source||source.product!==product||source.quote_product!==product||source.total_minor!==source.quote_total_minor||source.supplier_minor!==source.quote_supplier_minor)throw new HttpError(409,'Stored travel details do not match this payment.');
 const guests=guestSchema.parse(unseal(source.guests_encrypted,bookingId));
 const storedBilling=billingForProduct(product).parse(guests.billingData);
 if(!isDeepStrictEqual(storedBilling,billingData))throw new HttpError(409,'Payer details differ from the original order.');
 const travelData=await payGlocalTravelForQuote(source,source,guests,new Date(source.created_at));
 // Validate before persisting an initiation reservation: data errors are not
 // uncertain gateway outcomes and must not strand a payment attempt.
 payGlocalPayload({merchantTxnId:'00000000000000000000000000000000',merchantId:config.merchantId,gid:null,amountMinor:Number(source.total_minor),currency:'INR'},product,storedBilling,travelData,returnChannel);
 const reserved=await transaction(tx=>reservePayGlocalAttempt(tx,bookingId,config.merchantId));
 if(reserved.created){
  try{const result=await initiatePayGlocal(payGlocalPayload(reserved.attempt,product,storedBilling,travelData,returnChannel),reserved.attempt,config);await transaction(tx=>persistPayGlocalInitiation(tx,bookingId,result));}
  catch(error){await transaction(tx=>markPayGlocalUnknown(tx,bookingId));throw error;}
 }
 const row=(await database().query("SELECT a.redirect_url,a.gid,a.state,o.status,o.total_minor,q.expires_at FROM payglocal_attempts a JOIN orders o ON o.id=a.order_id JOIN supplier_quotes q ON q.id=o.quote_id WHERE a.order_id=$1",[bookingId])).rows[0];
 if(!row?.redirect_url||row.state==='CAPTURED'||row.status!=='PAYMENT_PENDING'||new Date(row.expires_at).getTime()<=Date.now())throw new HttpError(409,'Payment requires a status check in My trips. Do not start another payment.');
 return {provider:'PAYGLOCAL' as const,bookingId,checkoutUrl:validatePayGlocalUrl(row.redirect_url,'redirect'),amount:Number(row.total_minor),currency:'INR' as const};
}
export async function synchronizePayGlocalPayment(bookingId:string){
 const config=payGlocalConfig(),lease=randomUUID();
 const row=(await database().query("UPDATE payglocal_attempts SET lease_token=$2,lease_until=now()+interval '75 seconds',next_check=now()+interval '60 seconds',checks=checks+1 WHERE order_id=$1 AND merchant_id=$3 AND state<>'CAPTURED' AND next_check<=now() AND (state<>'STARTED' OR created_at<now()-interval '30 seconds') AND (lease_until IS NULL OR lease_until<now()) RETURNING *",[bookingId,lease,config.merchantId])).rows[0];
 if(!row)return;
 try{
  const result=await readPayGlocalStatus({merchantTxnId:row.merchant_txn_id,merchantId:row.merchant_id,amountMinor:Number(row.amount_minor),currency:row.currency,gid:row.gid},config);
  await transaction(async tx=>{const owned=await tx.query('SELECT order_id FROM payglocal_attempts WHERE order_id=$1 AND lease_token=$2 FOR UPDATE',[bookingId,lease]);if(!owned.rowCount)return;await linkPayGlocalRecoveredStatus(tx,bookingId,result);await recordPayGlocalVerifiedStatus(tx,bookingId,result);});
 }finally{await database().query("UPDATE payglocal_attempts SET lease_until=NULL,lease_token=NULL,next_check=now()+CASE WHEN checks<60 THEN interval '60 seconds' ELSE interval '1 hour' END WHERE order_id=$1 AND lease_token=$2",[bookingId,lease]);}
}
export async function runPayGlocalPaymentJob(){
 const config=payGlocalConfig();const due=await database().query("SELECT order_id FROM payglocal_attempts WHERE merchant_id=$1 AND state<>'CAPTURED' AND next_check<=now() AND (state<>'STARTED' OR created_at<now()-interval '30 seconds') AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_check LIMIT 10",[config.merchantId]);
 for(const row of due.rows){try{await synchronizePayGlocalPayment(row.order_id);}catch{/* Persisted delay; never repeat initiation on a lost response. */}}
}
