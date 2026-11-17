import {createHmac,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';

const TIMEOUT_MS=12000;
const bool=value=>value===true;
const count=value=>(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value))&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const present=value=>typeof value==='string'&&value.length>0;
const endpoint=value=>{
  try{const url=new URL(value);return !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/api/integrations/max-ai/enquiries'&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname));}catch{return false;}
};

export const SAFAR_SCHEMA_SQL=`WITH relations AS (
 SELECT to_regclass('public.schema_migrations') AS migrations,
 to_regclass('public.travel_enquiries') AS enquiries,to_regclass('public.outbox_events') AS outbox
) SELECT current_user='maxtravel_app' AS runtime_role_expected,
 migrations IS NOT NULL AS migrations_present,enquiries IS NOT NULL AS enquiries_present,outbox IS NOT NULL AS outbox_present,
 coalesce(has_table_privilege(current_user,migrations,'SELECT'),false) AS migrations_readable,
 coalesce(has_table_privilege(current_user,enquiries,'SELECT'),false) AS enquiries_readable,
 coalesce(has_table_privilege(current_user,outbox,'SELECT'),false) AS outbox_readable,
 EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=enquiries AND attname='crm_receiver' AND attnum>0 AND NOT attisdropped) AS receiver_present,
 EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=enquiries AND attname='crm_environment' AND attnum>0 AND NOT attisdropped) AS environment_present
 FROM relations`;
export const SAFAR_MIGRATION_SQL="SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name='025-safar-enquiry-destination') AS applied";
export const SAFAR_QUEUE_SQL=`SELECT
 count(*) FILTER(WHERE o.event_type<>'enquiry.created' AND o.delivered_at IS NULL)::int AS legacy_pending,
 count(*) FILTER(WHERE o.event_type<>'enquiry.created' AND o.delivered_at IS NOT NULL)::int AS legacy_delivered,
 count(*) FILTER(WHERE o.event_type='enquiry.created' AND (e.crm_receiver IS DISTINCT FROM 'safar' OR e.crm_environment IS NULL OR e.id IS DISTINCT FROM o.aggregate_id))::int AS excluded_enquiries,
 count(*) FILTER(WHERE o.event_type='enquiry.created' AND e.crm_receiver='safar' AND e.id=o.aggregate_id AND e.crm_environment='test' AND o.delivered_at IS NULL)::int AS test_pending,
 count(*) FILTER(WHERE o.event_type='enquiry.created' AND e.crm_receiver='safar' AND e.id=o.aggregate_id AND e.crm_environment='live' AND o.delivered_at IS NULL)::int AS live_pending,
 count(*) FILTER(WHERE o.event_type='enquiry.created' AND e.crm_receiver='safar' AND e.id=o.aggregate_id AND o.delivered_at IS NOT NULL)::int AS safar_delivered,
 count(*) FILTER(WHERE o.event_type='enquiry.created' AND e.crm_receiver='safar' AND e.id=o.aggregate_id AND o.delivered_at IS NULL AND o.attempts>=12)::int AS action_required
 FROM outbox_events o LEFT JOIN travel_enquiries e ON e.crm_event_id=o.id`;

async function rejectionMatches(response){
  if(response.status!==400||!response.headers.get('content-type')?.toLowerCase().includes('application/json')||Number(response.headers.get('content-length')||0)>4096){await response.body?.cancel();return false;}
  const reader=response.body?.getReader();if(!reader)return false;
  let size=0;const chunks=[];
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return false;}chunks.push(value);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===1&&body.error==='Check the enquiry details.';
  }finally{reader.releaseLock();}
}

/** Read-only runtime SQL plus one deliberately invalid signed HTTP body.
 * The receiver authenticates then rejects {} before any database call.
 * No valid enquiry, customer, booking or payment is ever submitted.
 */
export async function checkSafarEnquiries({environment=process.env,fetch:fetcher=globalThis.fetch,createPool=options=>new Pool(options),now=Date.now}={}){
  const mode=environment.SAFAR_ENQUIRY_MODE||'test',url=environment.SAFAR_ENQUIRY_URL,key=environment.SAFAR_ENQUIRY_SIGNING_KEY,keyId=environment.SAFAR_ENQUIRY_KEY_ID;
  const configured=endpoint(url)&&present(key)&&key.length>=32&&key.length<=4096&&!/[\r\n\0]/.test(key)&&/^[A-Za-z0-9_-]{1,64}$/.test(keyId||'')&&['test','live'].includes(mode);
  const result={diagnostic:{databaseReadOnly:true,validEnquirySubmitted:false,confirmsDelivery:false,timeoutMs:TIMEOUT_MS},
    configuration:{databasePresent:present(environment.DATABASE_URL),destinationPresent:present(url),destinationValid:endpoint(url),keyPresent:present(key),keyIdPresent:present(keyId),mode:['test','live'].includes(mode)?mode:'invalid',configured},
    database:{outcome:'configuration_missing'},receiver:{outcome:'configuration_missing_or_invalid'},ready:false};
  if(present(environment.DATABASE_URL)){
    let pool;
    try{
      pool=createPool({connectionString:environment.DATABASE_URL,max:1,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:5000});
      const schema=(await pool.query(SAFAR_SCHEMA_SQL)).rows[0]||{};
      const checks={runtimeRoleExpected:bool(schema.runtime_role_expected),migrationTablePresent:bool(schema.migrations_present),enquiryTablePresent:bool(schema.enquiries_present),outboxTablePresent:bool(schema.outbox_present),receiverColumnPresent:bool(schema.receiver_present),environmentColumnPresent:bool(schema.environment_present),migrationReadable:bool(schema.migrations_readable),enquiryReadable:bool(schema.enquiries_readable),outboxReadable:bool(schema.outbox_readable)};
      const applied=checks.migrationTablePresent&&checks.migrationReadable?bool((await pool.query(SAFAR_MIGRATION_SQL)).rows[0]?.applied):false;
      result.database={outcome:'schema_not_ready',...checks,migrationApplied:applied};
      if(applied&&checks.enquiryTablePresent&&checks.outboxTablePresent&&checks.receiverColumnPresent&&checks.environmentColumnPresent&&checks.enquiryReadable&&checks.outboxReadable){
        const row=(await pool.query(SAFAR_QUEUE_SQL)).rows[0]||{};
        const queue={legacyPending:count(row.legacy_pending),legacyDelivered:count(row.legacy_delivered),excludedEnquiries:count(row.excluded_enquiries),safarTestPending:count(row.test_pending),safarLivePending:count(row.live_pending),safarDelivered:count(row.safar_delivered),actionRequired:count(row.action_required)};
        result.database={...result.database,outcome:Object.values(queue).every(value=>value!==null)?'ok':'invalid_counts',queue};
      }
    }catch{result.database={outcome:'unavailable'};}
    finally{if(pool)await pool.end().catch(()=>{});}
  }
  if(configured){
    try{
      const body='{}',eventId=randomUUID(),timestamp=String(Math.floor(now()/1000));
      const signature=createHmac('sha256',key).update(`${timestamp}.${eventId}.${body}`).digest('hex');
      const response=await fetcher(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(TIMEOUT_MS),headers:{'Content-Type':'application/json','X-MaxTravel-Key-Id':keyId,'X-MaxTravel-Timestamp':timestamp,'X-MaxTravel-Event-Id':eventId,'X-MaxTravel-Signature':signature},body});
      const matched=await rejectionMatches(response);
      result.receiver={outcome:matched?'authenticated_invalid_body_rejected':'unexpected_response',httpStatus:response.status,signatureVerified:matched,preIngestRejection:matched};
    }catch{result.receiver={outcome:'unavailable'};}
  }
  result.ready=Boolean(configured&&result.database.outcome==='ok'&&result.database.runtimeRoleExpected&&result.receiver.outcome==='authenticated_invalid_body_rejected');
  return result;
}

export async function runCheckSafarEnquiries(dependencies={},output=console){
  try{const result=await checkSafarEnquiries(dependencies);output.log(JSON.stringify(result,null,2));return result.ready?0:1;}
  catch{output.error('Safar enquiry diagnostic unavailable. No customer data or credentials are displayed.');return 1;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)void runCheckSafarEnquiries().then(code=>{process.exitCode=code;});
