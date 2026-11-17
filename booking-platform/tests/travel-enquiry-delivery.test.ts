import test from 'node:test';
import assert from 'node:assert/strict';
import {enquiryCrmConfigured,enquiryCrmStatus,readEnquiryCrmReceipt,readEnquiryCrmResponse} from '../src/lib/travel-enquiry-delivery';

const id='11111111-1111-4111-8111-111111111111';
test('CRM status distinguishes durable local save, absent config, retry exhaustion and actual delivery',()=>{
  assert.equal(enquiryCrmStatus({delivered_at:null,attempts:0,crm_receiver:'safar'},false),'NOT_CONFIGURED');
  assert.equal(enquiryCrmStatus({delivered_at:null,attempts:0,crm_receiver:'safar'},true),'PENDING');
  assert.equal(enquiryCrmStatus({delivered_at:null,attempts:12,crm_receiver:'safar'},true),'ACTION_REQUIRED');
  assert.equal(enquiryCrmStatus({delivered_at:'2026-11-17',attempts:12,crm_receiver:'safar'},false),'DELIVERED');
  assert.equal(enquiryCrmStatus({delivered_at:null,attempts:0,crm_receiver:null},true),'DESTINATION_REVIEW');
  assert.equal(enquiryCrmStatus({delivered_at:'2026-11-17',attempts:0,crm_receiver:null},true),'LEGACY_DELIVERY');
  const config={SAFAR_ENQUIRY_URL:'https://crm.example.test/api/integrations/max-ai/enquiries',SAFAR_ENQUIRY_SIGNING_KEY:'x'.repeat(32),SAFAR_ENQUIRY_KEY_ID:'test'};
  assert.equal(enquiryCrmConfigured(config),true);
  assert.equal(enquiryCrmConfigured({...config,SAFAR_ENQUIRY_MODE:'live'}),true);
  assert.equal(enquiryCrmConfigured({CRM_EVENTS_URL:'https://legacy.example.test/events',CRM_SIGNING_KEY:'x'.repeat(32),CRM_KEY_ID:'legacy'}),false);
  for(const env of [{...config,SAFAR_ENQUIRY_SIGNING_KEY:''},{...config,SAFAR_ENQUIRY_MODE:'production'},{...config,SAFAR_ENQUIRY_URL:'http://public.example.test/api/integrations/max-ai/enquiries'},{...config,SAFAR_ENQUIRY_URL:'https://user:secret@crm.example.test/api/integrations/max-ai/enquiries'},{...config,SAFAR_ENQUIRY_URL:'https://crm.example.test/events'},{...config,SAFAR_ENQUIRY_URL:config.SAFAR_ENQUIRY_URL+'?key=bad'},{...config,SAFAR_ENQUIRY_URL:'not a URL'}])assert.equal(enquiryCrmConfigured(env),false);
});
test('Safar acknowledgement matches receiver, reference, enquiry and frozen environment',async()=>{
  const expected={enquiryId:id,reference:'ME-111111111111',environment:'test' as const};
  const receipt={accepted:true,receiver:'safar',...expected,recordId:'33333333-3333-4333-8333-333333333333'};
  assert.deepEqual(readEnquiryCrmReceipt(receipt,expected),receipt);
  for(const value of [{ok:true},{accepted:true,enquiryId:id,crmReference:'CASE-TEST-1',leadId:'legacy'},{...receipt,accepted:false},{...receipt,receiver:'legacy'},{...receipt,enquiryId:'22222222-2222-4222-8222-222222222222'},{...receipt,reference:'ME-222222222222'},{...receipt,environment:'live'},{...receipt,recordId:'not-a-uuid'},{...receipt,privateContact:'must not be returned'}])assert.throws(()=>readEnquiryCrmReceipt(value,expected));
  assert.deepEqual(await readEnquiryCrmResponse(Response.json(receipt),expected),receipt);
  await assert.rejects(readEnquiryCrmResponse(new Response('x'.repeat(4097)),expected),/too large/);
  await assert.rejects(readEnquiryCrmResponse(new Response(null),expected),/Missing/);
});
