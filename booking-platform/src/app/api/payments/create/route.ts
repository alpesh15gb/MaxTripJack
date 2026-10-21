import { checkoutPaymentProvider, assertNewPaymentProviderReady, assertRazorpayRecord } from "@/lib/payment-provider";
import { isDeepStrictEqual } from "node:util";
import { validateInitialExtras } from "@/lib/checkout-extras";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { principal } from "@/lib/access";
import { body,sameOrigin,json,failure,HttpError } from "@/lib/http";
import { transaction,database } from "@/lib/db";
import { owned,assertFresh } from "@/lib/supplier-flow";
import { guestSchema } from "@/lib/providers/contracts";
import { razorpay,razorpayKey } from "@/lib/providers/razorpay";
import { seal,unseal } from "@/lib/vault";
import { validateParty } from "@/lib/guest-validation";
import { tripjack } from "@/lib/providers/tripjack";
import { markGatewayIntentUnknown, persistGatewayOrder } from "@/lib/payment-intent";
import { FareValidationBlockedError } from "@/lib/fare-validation";
export async function POST(request:Request){try{
 sameOrigin(request);const actor=await principal(request);const input=await body(request,z.object({quoteId:z.string().uuid(),guests:guestSchema.optional(),acceptedTotalMinor:z.number().int().nonnegative()}).strict());
 const quote=await owned("supplier_quotes",input.quoteId,actor);assertFresh(quote.expires_at);
 if(Number(quote.total_minor)!==input.acceptedTotalMinor)throw new HttpError(409,"Price changed. Accept the latest review.");
 const search=await owned("supplier_searches",quote.search_id,actor);
 let guests=input.guests;
 if(quote.service_kind){const parent=await owned("orders",search.parent_order_id,actor);if(parent.status!=="TICKETED")throw new HttpError(409,"Original booking is no longer active.");const original=guestSchema.parse(unseal(parent.guests_encrypted,parent.id));guests=quote.service_kind==="REISSUE"?{...original,travellers:quote.service_payload.travellerIndexes.map((i:number)=>original.travellers[i])}:original;}
 if(!guests)throw new HttpError(400,"Traveller details are required.");
 if(quote.service_kind!=="ANCILLARY")validateParty(search.criteria,guests);
 const conditions=quote.review.conditions??{};const compliance=quote.review.option?.compliance??{};
 for(const t of guests.travellers){if((conditions.pcs?.pm||compliance.passportRequired)&&(!t.pNum||!t.pNat||!t.eD))throw new HttpError(400,"Passport number, nationality and expiry are required.");if(conditions.pcs?.pped&&!t.eD)throw new HttpError(400,"Passport expiry required.");if((t.pt==="ADULT"?conditions.dob?.adobr:t.pt==="CHILD"?conditions.dob?.cdobr:conditions.dob?.idobr)&&!t.dob)throw new HttpError(400,"Date of birth required.");if((conditions.ipa||compliance.panRequired)&&t.pt==="ADULT"&&!t.pan)throw new HttpError(400,"PAN required.");}
 if((conditions.gst?.igm||["PASSTHROUGH","RESELLER"].includes(compliance.gstType))&&!guests.gstInfo)throw new HttpError(400,"GST information required for this option.");if(conditions.iecr&&!guests.contactInfo)throw new HttpError(400,"Emergency contact required.");
 if(Number(quote.total_minor)===0){const freeExisting=await database().query("SELECT id FROM orders WHERE quote_id=$1",[quote.id]);if(freeExisting.rowCount)return json({bookingId:freeExisting.rows[0].id,free:true,amount:0,currency:"INR"});}
 const existingIntent=await database().query("SELECT o.id,o.guests_encrypted,g.provider FROM orders o JOIN gateway_intents g ON g.order_id=o.id WHERE o.quote_id=$1",[quote.id]);
 // Existing provider wins over configuration. Free services never contact a gateway.
 if(Number(quote.total_minor)>0)assertNewPaymentProviderReady(checkoutPaymentProvider(existingIntent.rows[0]?.provider));
 const key=Number(quote.total_minor)>0?razorpayKey():null;
 if(quote.product==="FLIGHT"&&!quote.service_kind&&((quote.fare_validation_state&&quote.fare_validation_state!=="SUCCEEDED")||quote.booking_validation_state)){if(existingIntent.rowCount)throw new HttpError(409,"Existing checkout requires reconciliation. Check My trips and do not pay again.");throw new FareValidationBlockedError();}
 if(existingIntent.rowCount&&!isDeepStrictEqual(unseal(existingIntent.rows[0].guests_encrypted,existingIntent.rows[0].id),guests))throw new HttpError(409,"Checkout already contains different traveller or contact details. Review the original order in My trips before paying.");
 if(quote.selection.checkoutExtras&&!existingIntent.rowCount)await validateInitialExtras(quote,guests);
 if(!existingIntent.rowCount){const account=await tripjack(quote.product,"/ums/v1/user-detail",undefined,false,"GET");const wallet=Number(account.walletBalance);if(!Number.isFinite(wallet)||wallet*100<Number(quote.supplier_minor))throw new HttpError(503,"Booking is temporarily unavailable. Please contact Max Travel before making payment.");assertFresh(quote.expires_at);}
 const intent=await transaction(async tx=>{
  const currentQuote=await tx.query("SELECT total_minor,selection FROM supplier_quotes WHERE id=$1 FOR UPDATE",[quote.id]);if(Number(currentQuote.rows[0].total_minor)!==Number(quote.total_minor)||!isDeepStrictEqual(currentQuote.rows[0].selection,quote.selection))throw new HttpError(409,"Extras changed. Accept the updated total before paying.");
  if(Number(quote.total_minor)===0){const freeExisting=await tx.query("SELECT id FROM orders WHERE quote_id=$1",[quote.id]);if(freeExisting.rowCount)return {id:freeExisting.rows[0].id,created:false,free:true,gateway_order_id:null};}
  const existing=await tx.query("SELECT o.id,o.guests_encrypted,g.provider,g.gateway_order_id,g.state FROM orders o JOIN gateway_intents g ON g.order_id=o.id WHERE o.quote_id=$1",[quote.id]);if(existing.rowCount){assertRazorpayRecord(existing.rows[0].provider);if(!isDeepStrictEqual(unseal(existing.rows[0].guests_encrypted,existing.rows[0].id),guests))throw new HttpError(409,"Checkout already contains different traveller or contact details. Open My trips to review the original order; do not pay it for edited travellers.");return {...existing.rows[0],created:false};}
  if(search.parent_order_id){const locked=await tx.query("SELECT status,service_kind FROM orders WHERE id=$1 FOR UPDATE",[search.parent_order_id]);if(locked.rows[0]?.status!=="TICKETED")throw new HttpError(409,"Original booking is no longer active.");const pending=await tx.query("SELECT id FROM orders WHERE parent_order_id=$1 AND status IN ('PAYMENT_PENDING','PAID','BOOKING_PENDING','MANUAL_REVIEW') UNION ALL SELECT id FROM cancellation_requests WHERE order_id=$1 AND status NOT IN ('CONFIRMED','REJECTED')",[search.parent_order_id]);if(pending.rowCount)throw new HttpError(409,"Another operation is pending. Complete it first.");if(quote.service_kind==="REISSUE"){const changed=await tx.query("SELECT id FROM orders WHERE parent_order_id=$1 AND service_kind='REISSUE' AND status='TICKETED'",[search.parent_order_id]);if(changed.rowCount||locked.rows[0].service_kind==="REISSUE")throw new HttpError(409,"This booking has already been reissued.");}}
  const id=randomUUID();await tx.query("INSERT INTO orders(id,reference,user_id,company_id,product,status,total_minor,supplier_minor,quote_id,guests_encrypted,policy_snapshot,itinerary_summary,parent_order_id,service_kind) VALUES($1,$2,$3,$4,$5,'PAYMENT_PENDING',$6,$7,$8,$9,$10,$11,$12,$13)",[id,`MT-${id.slice(0,8).toUpperCase()}`,actor.userId,actor.companyId,quote.product,quote.total_minor,quote.supplier_minor,quote.id,seal(guests,id),quote.product==="HOTEL"?quote.review.option?.cancellation??{}:{conditions:quote.review.conditions??{},fareRules:quote.review.fareRules??{}},{...search.criteria,...(quote.selection.checkoutExtras?{checkoutExtras:quote.selection.checkoutExtras.summary}:{})},search.parent_order_id??null,quote.service_kind??null]);
  if(Number(quote.total_minor)===0){if(!quote.service_kind)throw new HttpError(400,"Zero-price checkout is restricted to flight services.");await tx.query("UPDATE orders SET status='PAID' WHERE id=$1",[id]);await tx.query("INSERT INTO booking_jobs(order_id) VALUES($1)",[id]);return {id,created:true,free:true,gateway_order_id:null};}
  await tx.query("INSERT INTO gateway_intents(order_id) VALUES($1)",[id]);return {id,created:true,gateway_order_id:null};
 });
 if("free" in intent&&intent.free)return json({bookingId:intent.id,free:true,amount:0,currency:"INR"});
 if(!intent.created){if(!intent.gateway_order_id)throw new HttpError(409,"Payment order creation is pending reconciliation. Do not create another payment.");return json({bookingId:intent.id,orderId:intent.gateway_order_id,keyId:key!.id,amount:Number(quote.total_minor),currency:"INR"});}
 try{const gateway=await razorpay("/orders",{amount:Number(quote.total_minor),currency:"INR",receipt:intent.id,partial_payment:false});
  if(!gateway.id||gateway.amount!==Number(quote.total_minor)||gateway.currency!=="INR")throw new Error("Gateway contract mismatch");
  await transaction(tx=>persistGatewayOrder(tx,intent.id,gateway,"CREATE"));
  return json({bookingId:intent.id,orderId:gateway.id,keyId:key!.id,amount:gateway.amount,currency:"INR"});
 }catch(e){await transaction(tx=>markGatewayIntentUnknown(tx,intent.id));throw e;}
}catch(e){return failure(e);}}
