import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {publicSupplierReview} from '../src/lib/public-supplier-review';
import {reviewGuestIssues,type GuestReview} from '../src/lib/guest-validation-rules';
import type {Guests} from '../src/lib/providers/contracts';
const guests={travellers:[{pt:'ADULT',ti:'Mr',fN:'Test',lN:'Adult'},{pt:'CHILD',ti:'Master',fN:'Test',lN:'Child'},{pt:'INFANT',ti:'Master',fN:'Test',lN:'Infant'}],email:'test@example.com',phone:'9876543210'} as Guests;
test('public review allowlist excludes arbitrary fields at every raw boundary without mutating storage input',()=>{
 const privateData={token:'PRIVATE_TOKEN',account:'PRIVATE_ACCOUNT'};
 const raw={...privateData,conditions:{...privateData,st:180,isa:true,pcs:{pm:true,pped:false,...privateData},dob:{adobr:true,cdobr:false,idobr:true,...privateData},gst:{igm:true,...privateData},iecr:true,ipa:false},option:{...privateData,compliance:{...privateData,passportRequired:true,panRequired:true,gstType:'PASSTHROUGH'},bookingNotes:'Bring identification.',pricing:{mf:privateData,mft:privateData,totalPrice:99999},cancellation:{policy:'Cancellation rules',...privateData}},alerts:[privateData]};
 const before=JSON.stringify(raw),result=publicSupplierReview('HOTEL',raw),serialized=JSON.stringify(result);
 assert.doesNotMatch(serialized,/PRIVATE_|99999|"pricing"|"mf"|"mft"|"st"|"isa"/);
 assert.equal(result.option?.bookingNotes,'Bring identification.');assert.equal(JSON.stringify(raw),before);
 assert.deepEqual(reviewGuestIssues(guests,result),reviewGuestIssues(guests,raw));
 const boundary=readFileSync(new URL('../src/lib/supplier-flow.ts',import.meta.url),'utf8');
 assert.match(boundary,/chosen,data,data.bookingId,supplierMinor,totalMinor,expiresAt/);
 assert.match(boundary,/review:publicSupplierReview\(product,data\)/);

});
test('all required flags retain server truthiness and validation parity including malformed supplier values',()=>{
 for(const value of [true,false,0,1,'false','',null,[],{token:'PRIVATE_TOKEN'}]){
  const raw={conditions:{pcs:{pm:value,pped:value},dob:{adobr:value,cdobr:value,idobr:value},gst:{igm:value},iecr:value,ipa:value},option:{compliance:{passportRequired:value,panRequired:value,gstType:'NA'}}};
  const projected=publicSupplierReview('FLIGHT',raw);
  assert.deepEqual(reviewGuestIssues(guests,projected),reviewGuestIssues(guests,raw as GuestReview));
  assert.doesNotMatch(JSON.stringify(projected),/PRIVATE_TOKEN/);
 }
 for(const gstType of ['PASSTHROUGH','RESELLER','NA','OTHER',' PASSTHROUGH ',null,{},'x'.repeat(81)]){
  const raw={option:{compliance:{gstType}}};assert.deepEqual(reviewGuestIssues(guests,publicSupplierReview('HOTEL',raw)),reviewGuestIssues(guests,raw as GuestReview));
 }
});
test('passport expiry alone and all individual requirement flags remain effective',()=>{
 for(const conditions of [{pcs:{pped:true}},{pcs:{pm:true}},{dob:{adobr:true}},{dob:{cdobr:true}},{dob:{idobr:true}},{gst:{igm:true}},{ipa:true},{iecr:true}]){
  const raw={conditions};const issues=reviewGuestIssues(guests,raw);assert.ok(issues.length);assert.deepEqual(reviewGuestIssues(guests,publicSupplierReview('FLIGHT',raw)),issues);
 }
});
test('empty and malformed review fields do not expose objects or silently truncate policy notes',()=>{
 for(const source of [undefined,null,false,[],{},'bad'])assert.doesNotThrow(()=>publicSupplierReview('HOTEL',source));
 for(const bookingNotes of [{text:'PRIVATE_TOKEN'},['PRIVATE_TOKEN'],'x'.repeat(2001),'bad\u0000note'])assert.equal(publicSupplierReview('HOTEL',{option:{bookingNotes}}).option?.bookingNotes,null);
 assert.equal(publicSupplierReview('HOTEL',{option:{bookingNotes:'x'.repeat(2000)}}).option?.bookingNotes?.length,2000);
});
test('hotel compliance flags independently retain required passport, PAN and GST validation',()=>{
 for(const compliance of [{passportRequired:true},{panRequired:true},{gstType:'PASSTHROUGH'},{gstType:'RESELLER'}]){
  const raw={option:{compliance}},issues=reviewGuestIssues(guests,raw);assert.ok(issues.length);assert.deepEqual(reviewGuestIssues(guests,publicSupplierReview('HOTEL',raw)),issues);
 }
});
