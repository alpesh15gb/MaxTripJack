import { z } from "zod";
import { randomUUID } from "node:crypto";
import { administrator } from "@/lib/access";
import { transaction,database } from "@/lib/db";
import { json,body,failure,sameOrigin,HttpError } from "@/lib/http";
export async function GET(request:Request){try{await administrator(request,"integrations:manage");return json({notifications:(await database().query("SELECT id,order_id,status,attempts,next_attempt,delivered_at FROM customer_notifications ORDER BY next_attempt DESC LIMIT 100")).rows});}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const actor=await administrator(request,"integrations:manage");const input=await body(request,z.object({id:z.string().uuid()}).strict());await transaction(async tx=>{const result=await tx.query("UPDATE customer_notifications SET attempts=0,next_attempt=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<now()) RETURNING id",[input.id]);if(!result.rowCount)throw new HttpError(409,"Notification is delivered or currently leased.");await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'NOTIFICATION_RETRY',$3,'{}')",[randomUUID(),actor.userId,input.id]);});return json({message:"Notification queued again."});}catch(e){return failure(e);}}
