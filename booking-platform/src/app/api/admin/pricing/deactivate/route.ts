import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { administrator } from '@/lib/access';
import { transaction } from '@/lib/db';
import { body, failure, HttpError, json, sameOrigin } from '@/lib/http';
export async function POST(request:Request){try{
 sameOrigin(request);const actor=await administrator(request,'pricing:manage');
 const input=await body(request,z.object({id:z.string().uuid()}).strict());
 await transaction(async tx=>{
  const found=await tx.query('SELECT * FROM pricing_rules WHERE id=$1',[input.id]);const rule=found.rows[0];
  if(!rule)throw new HttpError(404,'Pricing rule not found.');
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${rule.product}:${rule.company_id??'PUBLIC'}`]);
  const result=await tx.query('UPDATE pricing_rules SET active=false WHERE id=$1 AND active=true RETURNING id',[input.id]);
  if(result.rowCount)await tx.query('INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor.userId,'ADMIN_PRICING_DEACTIVATE',input.id,{before:rule}]);
 });return json({id:input.id,message:'Rule deactivated. Existing bookings and quotes retain their totals.'});
}catch(e){return failure(e);}}
