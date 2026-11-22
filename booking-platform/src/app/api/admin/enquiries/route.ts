import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {operationsAccess,administrator} from '@/lib/access';
import {body,failure,HttpError,json,sameOrigin} from '@/lib/http';
import {database,transaction} from '@/lib/db';
import {adminEnquiry,enquirySelect,type EnquiryRow} from '@/lib/travel-enquiries';
import {allEnquiryServices} from '@/lib/travel-enquiry-contract';

const status=z.enum(['NEW','CONTACTED','QUOTED','CLOSED']);
export async function GET(request:Request){try{
  const actor=await operationsAccess(request);
  if(!actor.permissions.includes('bookings:read'))throw new HttpError(403,'You do not have permission to view enquiries.');
  const params=new URL(request.url).searchParams,page=z.coerce.number().int().min(1).max(10000).parse(params.get('page')||1),q=z.string().trim().max(100).parse(params.get('q')||'');
  const values:unknown[]=[],conditions:string[]=[];
  if(params.get('status')){values.push(status.parse(params.get('status')));conditions.push(`e.status=$${values.length}`);}
  if(params.get('service')){values.push(z.enum(allEnquiryServices).parse(params.get('service')));conditions.push(`e.service=$${values.length}`);}
  if(q){values.push('%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%');conditions.push(`(e.reference ILIKE $${values.length} OR e.draft->>'destination' ILIKE $${values.length} OR e.draft->>'subject' ILIKE $${values.length} OR e.contact->>'name' ILIKE $${values.length} OR e.contact->>'email' ILIKE $${values.length} OR e.contact->>'phone' ILIKE $${values.length})`);}
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const [rows,count]=await Promise.all([database().query<EnquiryRow>(enquirySelect+where+` ORDER BY e.created_at DESC,e.id DESC LIMIT 26 OFFSET $${values.length+1}`,[...values,(page-1)*25]),database().query('SELECT count(*)::text AS total FROM travel_enquiries e'+where,values)]);
  return json({rows:rows.rows.slice(0,25).map(adminEnquiry),page,total:Number(count.rows[0].total),hasMore:rows.rows.length>25,canManage:actor.permissions.includes('bookings:reconcile'),canRetryCrm:actor.permissions.includes('integrations:manage')});
}catch(error){return failure(error);}}

export async function PATCH(request:Request){try{
  sameOrigin(request);const actor=await administrator(request,'bookings:reconcile');
  const input=await body(request,z.object({id:z.string().uuid(),version:z.number().int().positive(),status,internalNote:z.string().trim().max(2000)}).strict());
  const enquiry=await transaction(async tx=>{
    const updated=await tx.query('UPDATE travel_enquiries SET status=$3,internal_note=$4,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING id',[input.id,input.version,input.status,input.internalNote]);
    if(!updated.rowCount)throw new HttpError(409,'This enquiry changed. Refresh it before saving.');
    await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'enquiry.updated',$3,$4::jsonb)",[randomUUID(),actor.userId,input.id,JSON.stringify({status:input.status,noteUpdated:true})]);
    return adminEnquiry((await tx.query<EnquiryRow>(enquirySelect+' WHERE e.id=$1',[input.id])).rows[0]);
  });return json({enquiry});
}catch(error){return failure(error);}}

export async function POST(request:Request){try{
  sameOrigin(request);const actor=await administrator(request,'integrations:manage');
  const input=await body(request,z.object({id:z.string().uuid(),version:z.number().int().positive(),action:z.literal('retry_crm')}).strict());
  await transaction(async tx=>{
    const row=await tx.query('SELECT crm_event_id,version,crm_receiver FROM travel_enquiries WHERE id=$1 FOR UPDATE',[input.id]);
    if(!row.rows[0]||row.rows[0].version!==input.version)throw new HttpError(409,'This enquiry changed. Refresh it before retrying.');
    if(row.rows[0].crm_receiver!=='safar')throw new HttpError(409,'This enquiry predates the Safar destination. Review its previous delivery before arranging a separate transfer.');
    const updated=await tx.query('UPDATE outbox_events SET attempts=0,next_attempt=now() WHERE id=$1 AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<now()) RETURNING id',[row.rows[0].crm_event_id]);
    if(!updated.rowCount)throw new HttpError(409,'CRM delivery is already complete or being checked. Refresh its status.');
    await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,'enquiry.crm-retry',$3)",[randomUUID(),actor.userId,input.id]);
  });return json({ok:true});
}catch(error){return failure(error);}}
