import { randomUUID } from "node:crypto";
import { z } from "zod";
import { administrator } from "@/lib/access";
import { database,transaction } from "@/lib/db";
import { body,json,failure,sameOrigin,HttpError } from "@/lib/http";
import { resources,Resource } from "@/lib/admin-resources";
import { refundableAmount } from "@/lib/booking-policy";
function resourceName(value:string):Resource{if(!(value in resources))throw new HttpError(404,"Resource not found.");return value as Resource;}
type Context={params:Promise<{resource:string}>};
export async function GET(request:Request,context:Context){try{const name=resourceName((await context.params).resource);await administrator(request,resources[name].permission);const page=z.coerce.number().int().min(1).max(10000).parse(new URL(request.url).searchParams.get("page")||1);const result=await database().query(resources[name].sql+" LIMIT 51 OFFSET $1",[(page-1)*50]);return json({rows:result.rows.slice(0,50),page,hasMore:result.rows.length>50});}catch(e){return failure(e);}}
export async function POST(request:Request,context:Context){try{
 sameOrigin(request);const name=resourceName((await context.params).resource);const actor=await administrator(request,resources[name].permission);
 const result=await transaction(async tx=>{
  let id:string;let detail:Record<string,unknown>={};
  if(name==="companies"){
   const input=await body(request,z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(150),email:z.string().email(),gstNumber:z.string().regex(/^[0-9A-Z]{15}$/).optional(),status:z.enum(["APPROVED","SUSPENDED"])}).strict());
   const user=await tx.query('SELECT id,"emailVerified","twoFactorEnabled" FROM "user" WHERE lower(email)=lower($1)',[input.email]);
   if(!user.rows[0]?.emailVerified||!user.rows[0]?.twoFactorEnabled)throw new HttpError(409,"The company login must be a verified account with authenticator enabled.");
   await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",[user.rows[0].id]);
   const linked=await tx.query("SELECT company_id FROM customer_accounts WHERE user_id=$1",[user.rows[0].id]);if(linked.rows[0]?.company_id&&linked.rows[0].company_id!==input.id)throw new HttpError(409,"This login is already linked to another company.");
   const existing=await tx.query("SELECT user_id FROM customer_accounts WHERE company_id=$1",[input.id]);if(existing.rows[0]&&existing.rows[0].user_id!==user.rows[0].id)throw new HttpError(409,"Company already has a different login. Use a separate account-recovery procedure.");
   await tx.query("INSERT INTO companies(id,name,gst_number,status) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,gst_number=excluded.gst_number,status=excluded.status",[input.id,input.name,input.gstNumber??null,input.status]);
   await tx.query("INSERT INTO customer_accounts(user_id,company_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET company_id=excluded.company_id",[user.rows[0].id,input.id]);id=input.id;detail={companyName:input.name,status:input.status};
  }else if(name==="pricing"){
   const input=await body(request,z.object({id:z.string().uuid(),companyId:z.string().uuid().nullable(),product:z.enum(["FLIGHT","HOTEL"]),markupMinor:z.number().int().min(0).max(100000000),basisPoints:z.number().int().min(0).max(10000),serviceFeeMinor:z.number().int().min(0).max(100000000)}).strict());
   await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`${input.product}:${input.companyId??"PUBLIC"}`]);
   const duplicate=await tx.query("SELECT id FROM pricing_rules WHERE id=$1",[input.id]);if(duplicate.rowCount)return {id:input.id};
   await tx.query("UPDATE pricing_rules SET active=false WHERE product=$1 AND company_id IS NOT DISTINCT FROM $2::uuid",[input.product,input.companyId]);
   await tx.query("INSERT INTO pricing_rules(id,company_id,product,markup_minor,markup_basis_points,service_fee_minor) VALUES($1,$2,$3,$4,$5,$6)",[input.id,input.companyId,input.product,input.markupMinor,input.basisPoints,input.serviceFeeMinor]);id=input.id;detail={product:input.product,companyId:input.companyId,markupMinor:input.markupMinor,basisPoints:input.basisPoints,serviceFeeMinor:input.serviceFeeMinor};
  }else if(name==="cancellations"){
   const input=await body(request,z.object({id:z.string().uuid(),status:z.enum(["UNDER_REVIEW","REJECTED"]),note:z.string().trim().min(3).max(1000)}).strict());
   const updated=await tx.query("UPDATE cancellation_requests SET status=$1,review_note=$2,reviewed_by=$3 WHERE id=$4 AND status IN ('REQUESTED','UNDER_REVIEW','AWAITING_ACCEPTANCE') RETURNING id",[input.status,input.note,actor.userId,input.id]);if(!updated.rowCount)throw new HttpError(409,"Request is missing or has progressed beyond review.");id=input.id;detail={status:input.status};
  }else if(name==="refunds"){
   const input=await body(request,z.discriminatedUnion("action",[
    z.object({action:z.literal("request"),id:z.string().uuid(),paymentId:z.string().uuid(),amountMinor:z.number().int().min(100),reason:z.string().trim().min(3).max(1000)}).strict(),
    z.object({action:z.literal("approve"),id:z.string().uuid()}).strict()
   ]));
   if(input.action==="request"){
    const payment=await tx.query("SELECT p.*,o.status AS booking_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 FOR UPDATE OF p,o",[input.paymentId]);const record=payment.rows[0];
    if(!record||record.status!=="CAPTURED"||!["CANCELLED","BOOKING_FAILED","TICKETED","CONFIRMED"].includes(record.booking_status))throw new HttpError(409,"Refund requires a captured payment and a supplier-confirmed cancellation or failed booking.");
    const existing=await tx.query("SELECT id,payment_id,amount_minor::text FROM refunds WHERE id=$1",[input.id]);if(existing.rowCount){if(existing.rows[0].payment_id!==input.paymentId||Number(existing.rows[0].amount_minor)!==input.amountMinor)throw new HttpError(409,"Refund reference was already used for a different request.");return {id:input.id};}
    const amounts=await tx.query("SELECT COALESCE(sum(amount_minor) FILTER(WHERE status='COMPLETED'),0)::text AS completed,COALESCE(sum(amount_minor) FILTER(WHERE status IN ('REQUESTED','APPROVED','PROCESSING')),0)::text AS reserved FROM refunds WHERE payment_id=$1",[input.paymentId]);
    refundableAmount(Number(record.amount_minor),Number(amounts.rows[0].completed),Number(amounts.rows[0].reserved),input.amountMinor);
    if(record.booking_status!=="BOOKING_FAILED"){
     const consent=await tx.query("SELECT COALESCE(sum(refund_offer_minor),0)::text AS refund_offer_minor FROM cancellation_requests WHERE order_id=$1 AND status='CONFIRMED' AND accepted_at IS NOT NULL",[record.order_id]);
     if(!consent.rowCount||Number(amounts.rows[0].completed)+Number(amounts.rows[0].reserved)+input.amountMinor>Number(consent.rows[0].refund_offer_minor))throw new HttpError(409,"Refund exceeds the customer-accepted cancellation offer.");
    }
    await tx.query("INSERT INTO refunds(id,payment_id,amount_minor,reason,requested_by) VALUES($1,$2,$3,$4,$5)",[input.id,input.paymentId,input.amountMinor,input.reason,actor.userId]);detail={action:input.action,amountMinor:input.amountMinor};
   }else{
    const found=await tx.query("SELECT * FROM refunds WHERE id=$1 FOR UPDATE",[input.id]);const refund=found.rows[0];if(!refund||refund.status!=="REQUESTED")throw new HttpError(409,"Refund is not awaiting approval.");
    const threshold=Number(process.env.REFUND_SECOND_APPROVAL_MINOR||5000000);if(!Number.isSafeInteger(threshold)||threshold<100)throw new HttpError(503,"Refund approval threshold is invalid.");
    if(Number(refund.amount_minor)>=threshold&&refund.requested_by===actor.userId)throw new HttpError(403,"This refund needs approval from a different authorised administrator.");
    await tx.query("UPDATE refunds SET status='APPROVED',approved_by=$1 WHERE id=$2",[actor.userId,input.id]);detail={action:input.action};
   }
   id=input.id;
   const changed=await tx.query("UPDATE orders SET revision=revision+1,updated_at=now() WHERE id=(SELECT p.order_id FROM payments p JOIN refunds r ON r.payment_id=p.id WHERE r.id=$1) RETURNING id",[id]);
   if(changed.rows[0])await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'refund.updated',$3)",[randomUUID(),changed.rows[0].id,{refundId:id}]);
  }else if(name==="sync"){
   const input=await body(request,z.object({id:z.string().uuid()}).strict());const updated=await tx.query("UPDATE outbox_events SET attempts=0,next_attempt=now(),lease_until=NULL,lease_token=NULL WHERE id=$1 AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<now()) RETURNING id",[input.id]);if(!updated.rowCount)throw new HttpError(409,"Event is delivered, leased or missing.");id=input.id;
  }else throw new HttpError(405,"This resource is read-only.");
  await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)",[randomUUID(),actor.userId,`ADMIN_${name.toUpperCase()}_UPDATE`,id,detail]);return {id};
 });return json(result);
}catch(e){return failure(e);}}
