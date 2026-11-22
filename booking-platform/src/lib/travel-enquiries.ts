import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {database,transaction} from './db';
import {HttpError} from './http';
import {enquiryCrmStatus} from './travel-enquiry-delivery';
import {enquiryDateError} from './travel-enquiry-contract';
import {indiaToday} from './booking-presentation';
import type {EnquirySubmission,EnquiryReceipt,EnquiryStatus,StoredEnquiryDraft,EnquiryContact} from './travel-enquiry-contract';

type Actor={userId:string;companyId:string|null};
export type EnquiryRow={id:string;reference:string;service:StoredEnquiryDraft['service'];status:EnquiryStatus;created_at:Date|string;updated_at:Date|string;version:number;draft:StoredEnquiryDraft;contact:EnquiryContact;contact_verified:false;internal_note:string;crm_receiver:string|null;crm_environment:string|null;crm_reference:string|null;body_hash:string;delivered_at:Date|string|null;attempts:number;crm_event_id:string};
export const enquirySelect=`SELECT e.*,o.delivered_at,o.attempts FROM travel_enquiries e JOIN outbox_events o ON o.id=e.crm_event_id`;
const date=(value:Date|string)=>new Date(value).toISOString();
export function enquiryReceipt(row:EnquiryRow):EnquiryReceipt{
  return {id:row.id,reference:row.reference,service:row.service,status:row.status,createdAt:date(row.created_at),crmStatus:row.service==='BUS'||row.service==='PARTNERSHIP'?'OFFICE':enquiryCrmStatus(row),...(row.crm_reference?{crmReference:row.crm_reference}:{}),...(row.crm_environment==='test'||row.crm_environment==='live'?{crmEnvironment:row.crm_environment}:{})};
}
export function adminEnquiry(row:EnquiryRow){
  return {...enquiryReceipt(row),version:row.version,updatedAt:date(row.updated_at),draft:row.draft,contact:row.contact,contactVerified:row.contact_verified,internalNote:row.internal_note};
}
export async function findEnquiryRequest(actor:Actor,requestId:string){
  const result=await database().query<EnquiryRow>(enquirySelect+' WHERE e.user_id=$1 AND e.request_key=$2',[actor.userId,requestId]);
  return result.rows[0]?enquiryReceipt(result.rows[0]):null;
}
/** One atomic customer-confirmed save and frozen, replayable CRM event. */
export async function saveEnquiry(actor:Actor,input:EnquirySubmission,runTransaction:typeof transaction=transaction):Promise<EnquiryReceipt>{
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return runTransaction(async(tx:PoolClient)=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`enquiry:${actor.userId}:${input.requestId}`]);
    const prior=await tx.query<EnquiryRow>(enquirySelect+' WHERE e.user_id=$1 AND e.request_key=$2',[actor.userId,input.requestId]);
    if(prior.rows[0]){
      if(prior.rows[0].body_hash!==hash)throw new HttpError(409,'This enquiry was already submitted with different details. Check its status before starting another enquiry.');
      return enquiryReceipt(prior.rows[0]);
    }
    const office='message' in input.draft;
    const dateError='travelWindow' in input.draft?enquiryDateError(input.draft,indiaToday()):null;
    if(dateError)throw new HttpError(400,dateError);
    const id=randomUUID(),eventId=randomUUID(),createdAt=new Date().toISOString(),reference='ME-'+id.replaceAll('-','').slice(0,12).toUpperCase();
    const payload={enquiryId:id,reference,service:input.draft.service,draft:input.draft,contact:input.contact,contactVerified:false,consentAt:createdAt,createdAt};
    const environment=office?null:process.env.SAFAR_ENQUIRY_MODE||'test';
    if(!office&&environment!=='test'&&environment!=='live')throw new HttpError(503,'The enquiry destination needs configuration. Please contact the team.');
    // Both senders skip these records: the generic sender excludes enquiry.created
    // and the dedicated sender only claims rows explicitly assigned to Safar.
    const frozen=office?null:JSON.stringify({schemaVersion:2,environment,eventId,eventType:'enquiry.created',aggregateId:id,occurredAt:createdAt,revision:1,payload});
    await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,schema_version,payload,delivery_payload,created_at) VALUES($1,$2,'enquiry.created',2,$3::jsonb,$4,$5)",[eventId,id,JSON.stringify({enquiryId:id}),frozen,createdAt]);
    const saved=await tx.query<EnquiryRow>(`INSERT INTO travel_enquiries(id,reference,user_id,company_id,request_key,body_hash,service,draft,contact,crm_event_id,created_at,updated_at,consent_at,crm_receiver,crm_environment)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$11,$11,$13,$12) RETURNING *`,[id,reference,actor.userId,actor.companyId,input.requestId,hash,input.draft.service,JSON.stringify(input.draft),JSON.stringify(input.contact),eventId,createdAt,environment,office?null:'safar']);
    await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'enquiry.created',$3,$4::jsonb)",[randomUUID(),actor.userId,id,JSON.stringify({service:input.draft.service,contactVerified:false})]);
    return enquiryReceipt({...saved.rows[0],attempts:0,delivered_at:null});
  });
}
