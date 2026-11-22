import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import type {ItineraryEnquirySubmission} from '../src/lib/travel-enquiry-contract';

const require=createRequire(import.meta.url);
type Library=typeof import('../src/lib/travel-enquiries');
const compiled=build({entryPoints:['src/lib/travel-enquiries.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,
  plugins:[{name:'db-boundary',setup(plugin){plugin.onResolve({filter:/^server-only$|^\.\/db$|^next\/navigation$/},args=>({path:args.path,namespace:'test-boundary'}));plugin.onLoad({filter:/.*/,namespace:'test-boundary'},args=>({loader:'js',contents:args.path==='server-only'?'':args.path==='next/navigation'?'export function unstable_rethrow(){}':'export function database(){throw Error("Unexpected real DB")}; export function transaction(){throw Error("Unexpected real transaction")};'}));}}]})
  .then(output=>{const loaded={exports:{} as Library};new Function('module','exports','require',output.outputFiles[0].text)(loaded,loaded.exports,require);return loaded.exports;});
const input:ItineraryEnquirySubmission={requestId:'11111111-1111-4111-8111-111111111111',consent:true,draft:{service:'VISA',destination:'UAE',travelWindow:'December 2030',adults:1,childAges:[],nationality:'Indian',purpose:'Tourism'},contact:{name:'Synthetic customer',email:'synthetic@example.test',preferredChannel:'EMAIL'}};
test('confirmed enquiry saves one frozen CRM event; retries survive midnight without new stale submissions',async context=>{
  const previousMode=process.env.SAFAR_ENQUIRY_MODE;process.env.SAFAR_ENQUIRY_MODE='test';
  context.after(()=>{if(previousMode===undefined)delete process.env.SAFAR_ENQUIRY_MODE;else process.env.SAFAR_ENQUIRY_MODE=previousMode;});
  context.mock.timers.enable({apis:['Date'],now:new Date('2030-12-15T12:00:00Z')});
  const datedInput={...input,draft:{...input.draft,travelStart:'2030-12-15'}};
  const {saveEnquiry}=await compiled;
  const records=new Map<string,Record<string,unknown>>(),events:Record<string,unknown>[]=[],audit:unknown[][]=[];
  let currentActor='',locks=0;
  const runTransaction=async<T>(run:(tx:unknown)=>Promise<T>)=>run({query:async(sql:string,values:unknown[])=>{
    if(sql.includes('pg_advisory_xact_lock')){locks++;return {rows:[],rowCount:1};}
    if(sql.startsWith('SELECT e.*')){currentActor=String(values[0]);const row=records.get(currentActor+':'+values[1]);return {rows:row?[row]:[],rowCount:row?1:0};}
    if(sql.startsWith('INSERT INTO outbox_events')){events.push({id:values[0],enquiryId:values[1],body:String(values[3])});return {rows:[],rowCount:1};}
    if(sql.startsWith('INSERT INTO travel_enquiries')){
      const row={id:values[0],reference:values[1],body_hash:values[5],service:values[6],draft:JSON.parse(String(values[7])),contact:JSON.parse(String(values[8])),crm_event_id:values[9],created_at:values[10],updated_at:values[10],crm_receiver:values[12],crm_environment:values[11],status:'NEW',version:1,contact_verified:false,internal_note:'',crm_reference:null,delivered_at:null,attempts:0};
      records.set(currentActor+':'+values[4],row);return {rows:[row],rowCount:1};
    }
    if(sql.startsWith('INSERT INTO audit_events')){audit.push(values);return {rows:[],rowCount:1};}
    throw Error('Unexpected query');
  }});
  const transaction=runTransaction as Parameters<typeof saveEnquiry>[2];
  const actor={userId:'guest:customer-one',companyId:null};
  const receipt=await saveEnquiry(actor,datedInput,transaction);
  assert.match(receipt.reference,/^ME-[A-F0-9]{12}$/);assert.equal(receipt.status,'NEW');assert.notEqual(receipt.crmStatus,'DELIVERED');
  assert.equal(events.length,1);assert.equal(audit.length,1);assert(!JSON.stringify(receipt).includes('synthetic@example.test'));
  const event=JSON.parse(String(events[0].body));assert.equal(event.eventType,'enquiry.created');assert.equal(event.aggregateId,receipt.id);assert.equal(event.payload.contactVerified,false);assert.deepEqual(event.payload.draft,datedInput.draft);assert.deepEqual(event.payload.contact,input.contact);
  assert.equal(event.schemaVersion,2);assert.equal(event.environment,'test');assert.equal(receipt.crmEnvironment,'test');
  context.mock.timers.setTime(new Date('2030-12-16T12:00:00Z').getTime());
  process.env.SAFAR_ENQUIRY_MODE='live';
  assert.deepEqual(await saveEnquiry(actor,datedInput,transaction),receipt);assert.equal(events.length,1);
  await assert.rejects(saveEnquiry(actor,{...datedInput,requestId:'22222222-2222-4222-8222-222222222222'},transaction),/past|today|future|upcoming|passed/i);assert.equal(events.length,1);
  await assert.rejects(saveEnquiry(actor,{...input,draft:{...input.draft,destination:'Japan'}},transaction),/different details/);assert.equal(events.length,1);
  const other=await saveEnquiry({userId:'guest:other-customer',companyId:null},input,transaction);assert.notEqual(other.id,receipt.id);assert.equal(other.crmEnvironment,'live');assert.equal(JSON.parse(String(events[1].body)).environment,'live');assert.equal(events.length,2);assert.equal(locks,5);
  process.env.SAFAR_ENQUIRY_MODE='invalid';
  assert.deepEqual(await saveEnquiry(actor,datedInput,transaction),receipt,'An existing receipt survives configuration changes without redelivery');
  await assert.rejects(saveEnquiry({userId:'guest:new-customer',companyId:null},input,transaction),/configuration/);assert.equal(events.length,2);assert.equal(audit.length,2);
  for(const [index,service] of (['BUS','PARTNERSHIP'] as const).entries()){
    const request={...input,draft:{service,subject:'Synthetic subject',message:'This is a booking office enquiry.'}};
    const officeActor={userId:`guest:office-${index}`,companyId:null};
    const office=await saveEnquiry(officeActor,request,transaction);
    assert.equal(office.crmStatus,'OFFICE');
    assert.equal(records.get(officeActor.userId+':'+input.requestId)?.crm_receiver,null);
    assert.equal(records.get(officeActor.userId+':'+input.requestId)?.crm_environment,null);
    assert.equal(events.at(-1)?.body,'null');
    assert.deepEqual(await saveEnquiry(officeActor,request,transaction),office);
  }
  assert.equal(events.length,4);
});
