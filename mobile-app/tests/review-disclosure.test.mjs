import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {reviewDisclosure,policyDisclosure} from '../src/review-disclosure.ts';
test('named native review shows requirements alongside fare rules without dumping supplier JSON',()=>{
 const secret={token:'PRIVATE_TOKEN'};
 const output=reviewDisclosure({fareRules:{fareRule:{miscInfo:'Fare notes',...secret},...secret},conditions:{pcs:{pm:true,pped:true,...secret},dob:{adobr:true,cdobr:true,idobr:true},gst:{igm:true},iecr:true,ipa:true,...secret},option:{compliance:{passportRequired:true,panRequired:true,gstType:'PASSTHROUGH',...secret},bookingNotes:'Bring ID',pricing:{mf:secret},roomInfo:[{name:'Deluxe',...secret}],...secret},...secret});
 for(const label of ['Passport','Passport expiry','Adult date of birth','Child date of birth','Infant date of birth','GST information','Emergency contact','Adult PAN'])assert.match(output,new RegExp(`${label}: required`));
 assert.match(output,/Fare notes/);assert.match(output,/Bring ID/);assert.match(output,/Rooms: Deluxe/);assert.doesNotMatch(output,/PRIVATE_TOKEN|pricing|token/);
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');assert.doesNotMatch(app,/JSON.stringify\((quote.review.option|room.cancellation)/);assert.equal(app.split('reviewDisclosure(quote.review)').length-1,1);
});
test('native policy text and schedules are bounded complete fields, never recursive dumps',()=>{
 assert.match(policyDisclosure({penalties:[{from:'2026-01-01',to:'2026-02-01',amount:10,token:'PRIVATE_TOKEN'}]}),/currency, units and basis unverified/);
 for(const raw of [null,[],false,{policy:'x'.repeat(2001)},{policy:{token:'PRIVATE_TOKEN'}},{penalties:Array(41).fill({token:'PRIVATE_TOKEN'})}]){const output=policyDisclosure(raw);assert.match(output,/Other terms may be unavailable/);assert.doesNotMatch(output,/PRIVATE_TOKEN|x{2000}/);}
 for(const raw of [null,[],{},'bad',{option:{bookingNotes:{token:'PRIVATE_TOKEN'},compliance:{gstType:{token:'PRIVATE_TOKEN'}}}}])assert.doesNotMatch(reviewDisclosure(raw),/PRIVATE_TOKEN|\[object Object\]/);
});
test('passport requirement alone also discloses the mandatory expiry for flight and hotel',()=>{
 for(const review of [{conditions:{pcs:{pm:true}}},{option:{compliance:{passportRequired:true}}}]){
  assert.match(reviewDisclosure(review),/Passport: required/);assert.match(reviewDisclosure(review),/Passport expiry: required/);
 }
});
