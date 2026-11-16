import test from 'node:test';
import assert from 'node:assert/strict';
import {enquiryDraftSchema,enquirySubmitSchema,enquiryDateError,enquirySummary,type EnquiryDraft} from '../src/lib/travel-enquiry-contract';

const base={destination:'Singapore',travelWindow:'March 2030, flexible dates',adults:2,childAges:[6]};
const drafts:EnquiryDraft[]=[
  {...base,service:'VISA',nationality:'Indian',purpose:'Tourism'},
  {...base,service:'INSURANCE',travellerAges:[31,34,6]},
  {...base,service:'HOLIDAY',departureCity:'Hyderabad'},
  {...base,service:'CRUISE',durationNights:4},
];
const requestId='11111111-1111-4111-8111-111111111111';

test('four enquiry services preserve flexible planning, room-independent child ages and explicit budget basis',()=>{
  for(const draft of drafts){
    assert.deepEqual(enquiryDraftSchema.parse(draft),draft);
    assert.equal(enquiryDraftSchema.parse({...draft,budgetRupees:90000,budgetBasis:'TOTAL'}).budgetRupees,90000);
    assert.match(enquirySummary(draft).join(' '),/2 adults · 1 child \(ages 6\)/);
  }
  assert.ok(enquiryDraftSchema.safeParse({...drafts[2],destination:'Undecided — beach or mountains',travelWindow:'Flexible, need advice'}).success);
  assert.ok(enquiryDraftSchema.safeParse({...drafts[0],adults:0,childAges:[6]}).success);
  assert.ok(enquiryDraftSchema.safeParse({...drafts[1],adults:0,childAges:[6],travellerAges:[6]}).success);
});

test('missing service facts, malformed dates, unclear budgets and mismatched insurance ages cannot reach submission',()=>{
  for(const value of [
    {...base,service:'VISA'}, {...base,service:'HOLIDAY'}, {...base,service:'INSURANCE',travellerAges:[31,34]},
    {...drafts[1],travellerAges:[31,34,8]}, {...drafts[1],travellerAges:[17,34,6]},
    {...drafts[0],travelStart:'2030-02-30'}, {...drafts[0],travelStart:'2030-04-10',travelEnd:'2030-04-09'},
    {...drafts[0],travelEnd:'2030-04-10'}, {...drafts[0],budgetRupees:10000}, {...drafts[0],budgetBasis:'TOTAL'},
    {...drafts[0],adults:0,childAges:[]}, {...drafts[0],childAges:[18]}, {...drafts[0],service:'FLIGHT'},
    {...drafts[0],price:1}, {...drafts[0],ownerId:'foreign'},
  ])assert.equal(enquiryDraftSchema.safeParse(value).success,false,JSON.stringify(value));
  assert.ok(enquiryDateError({...drafts[0],travelStart:'2026-11-16'},'2026-11-17'));
  assert.equal(enquiryDateError({...drafts[0],travelStart:'2026-11-17'},'2026-11-17'),null);
  assert.equal(enquiryDateError(drafts[0],'2026-11-17'),null);
});

test('obvious contact, credentials and document values stay outside enquiry planning details',()=>{
  for(const notes of ['Email me at traveller@example.test','WhatsApp +919999999998','phone: 9999999998','passport number: A1234567','PAN: ABCDE1234F','OTP: 123456','password: private-value'])
    assert.equal(enquiryDraftSchema.safeParse({...drafts[0],notes}).success,false,notes);
  assert.ok(enquiryDraftSchema.safeParse({...drafts[0],notes:'Need guidance on passport validity; budget not decided'}).success);
});

test('customer submission requires explicit consent and usable selected contact without trusting authority fields',()=>{
  const submission={requestId,draft:drafts[0],contact:{name:'Test Traveller',preferredChannel:'EMAIL',email:'Traveller@Example.test'},consent:true};
  assert.equal(enquirySubmitSchema.parse(submission).contact.email,'traveller@example.test');
  const phone=enquirySubmitSchema.parse({...submission,contact:{name:'Test Traveller',preferredChannel:'WHATSAPP',phone:'9999999998'}});
  assert.equal(phone.contact.phone,'+919999999998');
  for(const value of [
    {...submission,consent:false},{...submission,consent:undefined},{...submission,requestId:'another'},
    {...submission,contact:{name:'Test Traveller',preferredChannel:'EMAIL'}},
    {...submission,contact:{name:'Test Traveller',preferredChannel:'PHONE',email:'traveller@example.test'}},
    {...submission,contact:{...submission.contact,verified:true}},
    {...submission,actorId:'foreign'}, {...submission,status:'CONFIRMED'},
  ])assert.equal(enquirySubmitSchema.safeParse(value).success,false);
});
