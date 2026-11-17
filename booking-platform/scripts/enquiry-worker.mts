import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {heartbeat} from '../src/lib/worker-health';
import {database} from '../src/lib/db';
import {crmSignature} from '../src/lib/signatures';
import {deploymentProtectionHeaders} from '../src/lib/deployment-protection';
import {enquiryCrmConfigured,readEnquiryCrmResponse} from '../src/lib/travel-enquiry-delivery';
import {claimSafarEnquirySql,recordSafarEnquirySql,deferSafarEnquirySql,frozenSafarEnquiry,type SafarEnquiryJob} from '../src/lib/enquiry-crm-queue';

if(!process.env.DATABASE_URL||!enquiryCrmConfigured())throw Error('Configure the database and dedicated Safar enquiry URL/signing key/key ID. Legacy CRM settings are not used.');
const url=process.env.SAFAR_ENQUIRY_URL!,key=process.env.SAFAR_ENQUIRY_SIGNING_KEY!,keyId=process.env.SAFAR_ENQUIRY_KEY_ID!;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
try{
 while(!stopping){
  await heartbeat('enquiries');
  const lease=randomUUID(),claimed=await pool.query<SafarEnquiryJob>(claimSafarEnquirySql,[lease]),event=claimed.rows[0];
  if(!event){await new Promise(resolve=>setTimeout(resolve,2000));continue;}
  try{
   const payload=frozenSafarEnquiry(event),timestamp=String(Math.floor(Date.now()/1000));
   const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:await deploymentProtectionHeaders(url,{'Content-Type':'application/json','X-MaxTravel-Key-Id':keyId,'X-MaxTravel-Timestamp':timestamp,'X-MaxTravel-Event-Id':event.id,'X-MaxTravel-Signature':crmSignature(timestamp,event.id,payload.body,key)}),body:payload.body});
   if(!response.ok)throw Error('Safar rejected enquiry delivery.');
   const receipt=await readEnquiryCrmResponse(response,{enquiryId:event.aggregate_id,reference:payload.reference,environment:payload.environment});
   await pool.query(recordSafarEnquirySql,[event.id,lease,receipt.reference,receipt.recordId,receipt.environment]);
  }catch{
   const delay=Math.min(3600,2**Math.min(event.attempts+1,12)*10);
   await pool.query(deferSafarEnquirySql,[event.id,lease,delay]);
   console.warn('Safar enquiry delivery deferred',{eventId:event.id});
  }
 }
}finally{await pool.end();await database().end();}
