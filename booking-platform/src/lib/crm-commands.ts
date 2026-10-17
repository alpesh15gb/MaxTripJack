import "server-only";
import { cancellationOptions,type CancellationScope } from "./cancellation-scope";
import { unseal } from "./vault";
import { z } from "zod";
import { createHash,randomUUID } from "node:crypto";
import { database,transaction } from "./db";
import { boundedText,HttpError,json } from "./http";
import { verifySignature } from "./signatures";
import { crmCommandContext } from "./crm-command-context";
import { requestLimit } from "./request-limit";
export const commandSchema=z.object({id:z.string().uuid(),bookingId:z.string().uuid(),actorId:z.string().min(1).max(100),action:z.enum(["STATUS","RESYNC","RECONCILE","CANCELLATION_REQUEST","CANCELLATION_CHARGES","CANCELLATION_REVIEW","CANCELLATION_OFFER","CANCELLATION_EXECUTE","REFUND_REQUEST","REFUND_APPROVE","REFUND_EXECUTE"]),targetId:z.string().uuid().optional(),data:z.record(z.string(),z.unknown()).default({})}).strict();
export type CrmCommand=z.infer<typeof commandSchema>;
const permissions:Record<CrmCommand["action"],string>={STATUS:"bookings:read",RESYNC:"integrations:manage",RECONCILE:"bookings:reconcile",CANCELLATION_REQUEST:"cancellations:manage",CANCELLATION_CHARGES:"cancellations:manage",CANCELLATION_REVIEW:"cancellations:manage",CANCELLATION_OFFER:"cancellations:manage",CANCELLATION_EXECUTE:"cancellations:execute",REFUND_REQUEST:"refunds:manage",REFUND_APPROVE:"refunds:manage",REFUND_EXECUTE:"refunds:execute"};
export async function verifyCrmCommand(request:Request){
 const timestamp=request.headers.get("x-maxtravel-timestamp")??"",id=request.headers.get("x-maxtravel-command-id")??"",keyId=request.headers.get("x-maxtravel-key-id")??"";
 let keys:Record<string,string>;try{keys=JSON.parse(process.env.CRM_COMMAND_KEYS??"{}");}catch{throw new HttpError(503,"CRM command keys are not configured.");}
 const key=Object.hasOwn(keys,keyId)?keys[keyId]:null;
 if(key&&key===process.env.CRM_SIGNING_KEY)throw new HttpError(503,"Use a separate key for CRM commands and booking events.");
 if(!key||key.length<32)throw new HttpError(503,"CRM command key unavailable.");
 if(!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300)throw new HttpError(401,"Command timestamp is invalid.");
 const raw=await boundedText(request);
 // Reuse the exact-body HMAC format, with a direction-specific secret.
 if(!verifySignature(`${timestamp}.${id}.${raw}`,request.headers.get("x-maxtravel-signature"),key))throw new HttpError(401,"Command signature is invalid.");
 const command=commandSchema.parse(JSON.parse(raw));if(command.id!==id)throw new HttpError(400,"Command identity mismatch.");
 let mapping:Record<string,string>;try{mapping=JSON.parse(process.env.CRM_STAFF_ACTORS??"{}");}catch{throw new HttpError(503,"CRM actor mapping unavailable.");}
 const userId=Object.hasOwn(mapping,command.actorId)?mapping[command.actorId]:null;if(!userId)throw new HttpError(403,"CRM staff member is not mapped to a booking administrator.");
 const permission=permissions[command.action];const actor=await database().query('SELECT g.permissions FROM admin_grants g JOIN "user" u ON u.id=g.user_id LEFT JOIN customer_accounts a ON a.user_id=u.id LEFT JOIN companies c ON c.id=a.company_id WHERE g.user_id=$1 AND g.active=true AND u."emailVerified"=true AND u."twoFactorEnabled"=true AND COALESCE(a.active,true)=true AND (a.company_id IS NULL OR c.status=\'APPROVED\')',[userId]);
 if(!actor.rows[0]?.permissions.includes(permission))throw new HttpError(403,"Mapped administrator does not have this operation permission.");
 if(command.action==="STATUS"&&command.data.financial===true&&!actor.rows[0].permissions.includes("finance:read"))throw new HttpError(403,"Live financial status requires finance permission.");
 await requestLimit(userId,"crm-commands",60);
 if(!(await database().query("SELECT id FROM orders WHERE id=$1",[command.bookingId])).rowCount)throw new HttpError(404,"Booking unavailable.");
 if(command.action.startsWith("CANCELLATION_")&&command.action!=="CANCELLATION_REQUEST"){const target=await database().query("SELECT id FROM cancellation_requests WHERE id=$1 AND order_id=$2",[command.targetId,command.bookingId]);if(!target.rowCount)throw new HttpError(404,"Cancellation does not belong to this booking.");}
 if(command.action==="REFUND_REQUEST"){const target=await database().query("SELECT id FROM payments WHERE id=$1 AND order_id=$2",[command.data.paymentId,command.bookingId]);if(!target.rowCount)throw new HttpError(404,"Payment does not belong to this booking.");}
 if(["REFUND_APPROVE","REFUND_EXECUTE"].includes(command.action)){const target=await database().query("SELECT r.id FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.id=$1 AND p.order_id=$2",[command.targetId,command.bookingId]);if(!target.rowCount)throw new HttpError(404,"Refund does not belong to this booking.");}
 return {command,userId,permission,hash:createHash("sha256").update(raw).digest("hex")};
}
async function dispatch(command:CrmCommand){
 const make=(path:string,data:unknown)=>new Request(new URL(path,process.env.BETTER_AUTH_URL),{method:"POST",headers:{Origin:new URL(process.env.BETTER_AUTH_URL!).origin,"Content-Type":"application/json"},body:JSON.stringify(data)});
 const context={params:Promise.resolve({id:command.targetId??command.bookingId})};
 if(command.action==="CANCELLATION_REQUEST"){const {requestCancellation,cancellationRequestSchema}=await import("./cancellation-request");const order=(await database().query("SELECT user_id,company_id FROM orders WHERE id=$1",[command.bookingId])).rows[0];return requestCancellation(command.bookingId,cancellationRequestSchema.parse({...command.data,requestKey:command.id}),{userId:order.user_id,companyId:order.company_id},crmCommandContext.getStore()!.userId);}
 if(command.action==="STATUS"){
  const order=(await database().query("SELECT id,reference,product,status,revision,guests_encrypted,itinerary_summary FROM orders WHERE id=$1",[command.bookingId])).rows[0];
  const options=order.product==="FLIGHT"?cancellationOptions({},unseal(order.guests_encrypted,order.id),order.itinerary_summary):{trips:[],travellers:[]};
  const previous=await database().query<{scope:CancellationScope|null}>("SELECT scope FROM cancellation_requests WHERE order_id=$1 AND status='CONFIRMED'",[command.bookingId]);
  const {guests_encrypted,itinerary_summary,...publicOrder}=order;void guests_encrypted;void itinerary_summary;
  const cancellations=await database().query("SELECT id,status,reason,review_note,refund_offer_minor::text,penalty_minor::text,accepted_at,offer_expires_at FROM cancellation_requests WHERE order_id=$1 ORDER BY created_at DESC",[command.bookingId]);
  const payments=await database().query("SELECT id,status,amount_minor::text FROM payments WHERE order_id=$1",[command.bookingId]);
  const refunds=await database().query("SELECT r.id,r.status,r.amount_minor::text,r.requested_by,r.approved_by FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1",[command.bookingId]);return json({order:publicOrder,options:{...options,cancelledUnits:previous.rows.flatMap(row=>row.scope?.units??options.trips.flatMap((_,i)=>options.travellers.map((_,j)=>`${i}:${j}`)))},cancellations:command.data.financial===true?cancellations.rows:cancellations.rows.map(row=>({id:row.id,status:row.status,reason:row.reason,review_note:row.review_note,accepted_at:row.accepted_at,offer_expires_at:row.offer_expires_at})),...(command.data.financial===true?{payments:payments.rows,refunds:refunds.rows}:{})});
 }
 if(command.action==="RESYNC"){await database().query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'crm.resync_requested',$3)",[command.id,command.bookingId,{commandId:command.id}]);return json({message:"Current snapshot queued for CRM sync."});}
 if(command.action==="RECONCILE"){const route=await import("@/app/api/admin/bookings/[id]/reconcile/route");return route.POST(make("/api/admin/bookings/reconcile",command.data),context);}
 if(command.action==="CANCELLATION_CHARGES"){const route=await import("@/app/api/admin/cancellations/[id]/charges/route");return route.POST(make("/api/admin/cancellations/charges",{}),context);}
 if(command.action==="CANCELLATION_OFFER"){const route=await import("@/app/api/admin/cancellations/[id]/offer/route");return route.POST(make("/api/admin/cancellations/offer",command.data),context);}
 if(command.action==="CANCELLATION_EXECUTE"){const route=await import("@/app/api/admin/cancellations/[id]/execute/route");return route.POST(make("/api/admin/cancellations/execute",{}),context);}
 if(command.action==="REFUND_EXECUTE"){const route=await import("@/app/api/admin/refunds/[id]/execute/route");return route.POST(make("/api/admin/refunds/execute",{}),context);}
 const route=await import("@/app/api/admin/[resource]/route");const resource=command.action==="CANCELLATION_REVIEW"?"cancellations":"refunds";
 const data=command.action==="CANCELLATION_REVIEW"?{...command.data,id:command.targetId}:command.action==="REFUND_APPROVE"?{action:"approve",id:command.targetId}:{...command.data,action:"request"};
 return route.POST(make(`/api/admin/${resource}`,data),{params:Promise.resolve({resource})});
}
async function recoverCommand(command:CrmCommand,userId:string,permission:string):Promise<Response|null>{
 if(command.action==="STATUS"||command.action==="CANCELLATION_CHARGES")return crmCommandContext.run({userId,permission},()=>dispatch(command));
 if(command.action==="RESYNC"&&(await database().query("SELECT id FROM outbox_events WHERE id=$1 AND aggregate_id=$2",[command.id,command.bookingId])).rowCount)return json({message:"Original sync request is already queued or delivered."});
 if(command.action==="CANCELLATION_REQUEST"){const row=(await database().query("SELECT id,status FROM cancellation_requests WHERE order_id=$1 AND request_key=$2",[command.bookingId,command.id])).rows[0];if(row)return json({cancellation:row,message:"Original cancellation review request recovered."},202);}
 if(command.action==="REFUND_REQUEST"){const row=(await database().query("SELECT id FROM refunds WHERE id=$1 AND payment_id=$2 AND amount_minor=$3",[command.id,command.data.paymentId,command.data.amountMinor])).rows[0];if(row)return json({id:row.id,message:"Original refund request recovered; no second refund was created."});}
 if(command.action==="REFUND_APPROVE"){const row=(await database().query("SELECT id FROM refunds WHERE id=$1 AND approved_by=$2 AND status IN ('APPROVED','PROCESSING','COMPLETED')",[command.targetId,userId])).rows[0];if(row)return json({id:row.id,message:"Original refund approval recovered."});}
 if(command.action==="REFUND_EXECUTE"){const row=(await database().query("SELECT status FROM refunds WHERE id=$1",[command.targetId])).rows[0];if(row&&["COMPLETED","FAILED"].includes(row.status))return json({status:row.status,message:"Original gateway outcome recovered without resubmission."});}
 if(command.action.startsWith("CANCELLATION_")){const row=(await database().query("SELECT * FROM cancellation_requests WHERE id=$1",[command.targetId])).rows[0];if(row){if(command.action==="CANCELLATION_EXECUTE"&&["CONFIRMED","REJECTED"].includes(row.status))return json({status:row.status,message:"Original supplier cancellation outcome recovered."});if(command.action==="CANCELLATION_OFFER"&&row.offer_version&&row.reviewed_by===userId&&Number(row.refund_offer_minor)===command.data.refundMinor&&Number(row.penalty_minor)===command.data.penaltyMinor&&row.review_note===command.data.note)return json({offerVersion:row.offer_version,message:"Original cancellation offer recovered; acceptance was preserved."});if(command.action==="CANCELLATION_REVIEW"&&row.reviewed_by===userId&&row.status===command.data.status&&row.review_note===command.data.note)return json({id:row.id});}}
 return null;
}
export async function executeCrmCommand(request:Request){
 const verified=await verifyCrmCommand(request),{command,userId,permission,hash}=verified;
 const claimed=await database().query("INSERT INTO crm_commands(id,booking_id,actor_id,body_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",[command.id,command.bookingId,userId,hash]);
 if(!claimed.rowCount){const prior=(await database().query("SELECT * FROM crm_commands WHERE id=$1",[command.id])).rows[0];if(prior.body_hash!==hash)throw new HttpError(409,"Command ID was reused for different content.");if(prior.state!=="DONE"){const recovered=await recoverCommand(command,userId,permission);if(!recovered)return json({error:"Command outcome requires reconciliation. It will not be submitted again.",uncertain:true},409);const recoveredBody=await recovered.json();await database().query("UPDATE crm_commands SET state='DONE',response=$2,http_status=$3,updated_at=now() WHERE id=$1",[command.id,recoveredBody,recovered.status]);return json({...recoveredBody,commandRecorded:true},recovered.status);}return json({...prior.response,commandRecorded:true},prior.http_status);}
 try{
  const response=await crmCommandContext.run({userId,permission},()=>dispatch(command));const result=await response.json();
  await transaction(async tx=>{await tx.query("UPDATE crm_commands SET state='DONE',response=$2,http_status=$3,updated_at=now() WHERE id=$1",[command.id,result,response.status]);await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'CRM_COMMAND',$3,$4)",[randomUUID(),userId,command.bookingId,{commandId:command.id,crmActor:command.actorId,operation:command.action,status:response.status}]);});
  return json({...result,commandRecorded:true},response.status);
 }catch(error){await database().query("UPDATE crm_commands SET state='UNKNOWN',updated_at=now() WHERE id=$1",[command.id]);throw error;}
}
