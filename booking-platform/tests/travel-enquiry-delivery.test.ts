import test from 'node:test';
import assert from 'node:assert/strict';
import {enquiryCrmConfigured,enquiryCrmStatus,readEnquiryCrmReceipt,readEnquiryCrmResponse} from '../src/lib/travel-enquiry-delivery';

const id='11111111-1111-4111-8111-111111111111';
test('CRM status distinguishes durable local save, absent config, retry exhaustion and actual delivery',()=>{
  assert.equal(enquiryCrmStatus({delivered_at:null,attempts:0},false),'NOT_CONFIGURED');
  assert.equal(enquiryCrmStatus({delivered_at:null,attempts:0},true),'PENDING');
  assert.equal(enquiryCrmStatus({delivered_at:null,attempts:12},true),'ACTION_REQUIRED');
  assert.equal(enquiryCrmStatus({delivered_at:'2026-11-17',attempts:12},false),'DELIVERED');
  const config={CRM_EVENTS_URL:'https://crm.example.test/events',CRM_SIGNING_KEY:'x'.repeat(32),CRM_KEY_ID:'test'};
  assert.equal(enquiryCrmConfigured(config),true);
  for(const env of [{...config,CRM_SIGNING_KEY:''},{...config,CRM_EVENTS_URL:'http://public.example.test/events'},{...config,CRM_EVENTS_URL:'https://user:secret@crm.example.test/events'},{...config,CRM_EVENTS_URL:'not a URL'}])assert.equal(enquiryCrmConfigured(env),false);
});
test('CRM acknowledgement requires the exact saved enquiry and cannot mistake generic success for a lead',async()=>{
  const receipt={accepted:true,enquiryId:id,crmReference:'CASE-TEST-1',leadId:'maxai-enquiry-'+id};
  assert.deepEqual(readEnquiryCrmReceipt(receipt,id),receipt);
  for(const value of [{ok:true},{...receipt,accepted:false},{...receipt,enquiryId:'22222222-2222-4222-8222-222222222222'},{...receipt,crmReference:''},{...receipt,privateContact:'must not be returned'}])assert.throws(()=>readEnquiryCrmReceipt(value,id));
  assert.deepEqual(await readEnquiryCrmResponse(Response.json(receipt),id),receipt);
  await assert.rejects(readEnquiryCrmResponse(new Response('x'.repeat(4097)),id),/too large/);
  await assert.rejects(readEnquiryCrmResponse(new Response(null),id),/Missing/);
});
