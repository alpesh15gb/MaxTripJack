import test from 'node:test';
import assert from 'node:assert/strict';
import { guestDetailsIssues, partyIssues, reviewGuestIssues, type PartySearch } from '../src/lib/guest-validation-rules';
import { validateParty, validateGuestReview } from '../src/lib/guest-validation';
import { guestIssueField, guestNativeIssues, guestsFromForm, parseGuestIssues } from '../src/lib/guest-form';
import { guestSchema, searchSchema, type Guests, type Search } from '../src/lib/providers/contracts';
import { failure, HttpError } from '../src/lib/http';
import { indiaToday } from '../src/lib/booking-presentation';

const flight=searchSchema.parse({product:'FLIGHT',from:'BOM',to:'DEL',date:'2027-06-15',returnDate:'2027-06-20',adults:1,children:1,infants:1}) as Extract<Search,{product:'FLIGHT'}>;
const adult={ti:'Mr' as const,pt:'ADULT' as const,fN:'Aarav',lN:'Example'};
const guests:Guests={email:'traveller@example.test',phone:'9876543210',travellers:[adult,{...adult,pt:'CHILD',dob:'2018-06-15'},{...adult,pt:'INFANT',dob:'2026-06-15'}]};
const paths=(value:ReturnType<typeof guestDetailsIssues>)=>value.map(issue=>issue.path);

test('valid children, infants and optional adult documents need no extra requirements',()=>{
 assert.deepEqual(guestDetailsIssues(guests,flight,{}),[]);
 assert.deepEqual(reviewGuestIssues(guests,{}),[]);
});
test('age errors are collected per traveller; exact second/twelfth birthdays use departure',()=>{
 const invalid={...guests,travellers:[{...adult,dob:'2016-06-16'},{...guests.travellers[1],dob:'2015-06-15'},{...guests.travellers[2],dob:'2025-06-15'}]};
 assert.deepEqual(paths(guestDetailsIssues(invalid,flight,{})),['travellers.0.dob','travellers.1.dob','travellers.2.dob']);
 assert.deepEqual(guestDetailsIssues({...guests,travellers:[{...adult,dob:'2015-06-15'},{...guests.travellers[1],dob:'2025-06-15'},{...guests.travellers[2],dob:'2025-06-16'}]},flight,{}),[]);
});
test('calendar-invalid, travel-day and missing child DOB all block review',()=>{
 for(const dob of ['2027-02-30','2027-06-15','2028-06-15',undefined])assert.ok(paths(guestDetailsIssues({...guests,travellers:guests.travellers.map((t,i)=>i===1?{...t,dob}:t)},flight,{})).includes('travellers.1.dob'));
 const leap=searchSchema.parse({product:'FLIGHT',from:'BOM',to:'DEL',date:'2028-03-01',adults:1,children:1});
 assert.deepEqual(guestDetailsIssues({...guests,travellers:[adult,{...guests.travellers[1],dob:'2024-02-29'}]},leap,{}),[]);
});
test('passport expiry uses final return, final multi-city leg and hotel checkout, not first travel',()=>{
 const cases:PartySearch[]=[flight,{...flight,product:'FLIGHT',legs:[{from:'BOM',to:'DEL',date:'2027-06-15'},{from:'DEL',to:'GOI',date:'2027-06-25'}]}, {product:'HOTEL',checkIn:'2027-06-15',checkOut:'2027-06-22',adults:1,childrenAges:[]}];
 for(const search of cases){const party={...guests,travellers:search.product==='HOTEL'?[{...adult,eD:'2027-06-20'}]:guests.travellers.map((t,i)=>i===0?{...t,eD:search.product==='FLIGHT'&&search.legs?'2027-06-24':'2027-06-20'}:t)};assert.ok(paths(guestDetailsIssues(party,search,{})).includes('travellers.0.eD'));}
 assert.deepEqual(guestDetailsIssues({...guests,travellers:guests.travellers.map(t=>({...t,eD:'2027-06-21'}))},flight,{}),[]);
});
test('hotel child ages compare room multisets at check-in, not traveller order or other rooms',()=>{
 const hotel=searchSchema.parse({product:'HOTEL',hotelIds:['10001'],checkIn:'2027-06-15',checkOut:'2027-06-20',adults:1,nationality:'106',rooms:[{adults:1,children:2,childAge:[5,8]},{adults:1,children:1,childAge:[9]}]});
 const party:Guests={...guests,travellers:[{...adult,roomIndex:0},{...adult,pt:'CHILD',roomIndex:0,dob:'2019-06-15'},{...adult,pt:'CHILD',roomIndex:0,dob:'2022-06-15'},{...adult,roomIndex:1},{...adult,pt:'CHILD',roomIndex:1,dob:'2018-06-15'}]};
 assert.deepEqual(guestDetailsIssues(party,hotel,{}),[]);
 const changed={...party,travellers:party.travellers.map((t,i)=>i===4?{...t,dob:'2019-06-15'}:t)};
 assert.deepEqual(paths(guestDetailsIssues(changed,hotel,{})),['travellers.4.dob']);
 const sibling={...party,travellers:party.travellers.map((t,i)=>i===2?{...t,dob:'2023-06-15'}:t)};
 assert.deepEqual(paths(guestDetailsIssues(sibling,hotel,{})),['travellers.2.dob']);
 assert.throws(()=>validateParty(hotel,changed),(error:unknown)=>error instanceof HttpError&&error.fields?.[0].path==='guests.travellers.4.dob');
});
test('existing PAN, GST, name, email, phone and optional passport schemas are enforced without invented GST pattern',()=>{
 const invalid={...guests,email:'not-an-email',phone:'123',gstInfo:{gstNumber:'short',registeredName:''},travellers:[{...adult,fN:'  ',pan:'123',pNum:'abc'},...guests.travellers.slice(1)]};
 const fields=paths(guestDetailsIssues(invalid,flight,{}));
 for(const field of ['email','phone','gstInfo.gstNumber','gstInfo.registeredName','travellers.0.fN','travellers.0.pan','travellers.0.pNum'])assert.ok(fields.includes(field),field);
 assert.deepEqual(guestDetailsIssues({...guests,gstInfo:{gstNumber:'123456789012345',registeredName:'Business'}},flight,{}),[]);
});
test('supplier-required conditions match native server guard and expose field paths',async()=>{
 const review={conditions:{pcs:{pm:true,pped:true},dob:{adobr:true},ipa:true,gst:{igm:true},iecr:true}};
 const fields=reviewGuestIssues(guests,review);
 for(const path of ['travellers.0.pNum','travellers.0.pNat','travellers.0.eD','travellers.0.dob','travellers.0.pan','gstInfo.gstNumber','contactInfo.ecn'])assert.ok(paths(fields).includes(path));
 assert.throws(()=>validateGuestReview(guests,review),(error:unknown)=>error instanceof HttpError&&error.status===400&&error.fields?.length===fields.length);
 const response=failure(new HttpError(400,'Correct details.',[{path:'guests.travellers.0.pan',message:'PAN required.'}]));
 assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'Correct details.',fields:[{path:'guests.travellers.0.pan',message:'PAN required.'}]});
 assert.deepEqual(reviewGuestIssues(guests,{option:{compliance:{passportRequired:true,panRequired:true,gstType:'PASSTHROUGH'}}}).map(i=>i.path),reviewGuestIssues(guests,{conditions:{pcs:{pm:true},ipa:true,gst:{igm:true}}}).map(i=>i.path));
});
test('native flight counts and room assignment guards remain authoritative',()=>{
 assert.throws(()=>validateParty(flight,{...guests,travellers:guests.travellers.slice(1)}));
 assert.throws(()=>validateParty(flight,{...guests,travellers:guests.travellers.map(t=>({...t,roomIndex:0}))}));
 assert.deepEqual(partyIssues(flight,guests),[]);
 assert.ok(guestDetailsIssues(guests,undefined,{})[0].message.includes('reviewed journey'));
});
test('one form payload normalizes only existing uppercase contracts and retains optional fields',()=>{
 const form=new FormData();for(const [key,value] of Object.entries({'title-0':'Mr','first-0':'Aarav','last-0':'Example','pan-0':'abcde1234f','nationality-0':'in',email:guests.email,phone:guests.phone,gstNumber:'123456789012345',gstName:'Example Co',emergencyName:'Contact',emergencyEmail:'contact@example.test',emergencyPhone:'+919876543210'}))form.set(key,value);
 const value=guestsFromForm(form,['ADULT'],[1]);
 assert.equal(guestSchema.safeParse(value).success,true);assert.deepEqual(value.travellers[0],{...adult,roomIndex:1,pan:'ABCDE1234F',pNat:'IN'});
 assert.equal(value.gstInfo?.gstNumber,'123456789012345');assert.equal(value.contactInfo?.ecn,'Contact');
 assert.deepEqual(guestIssueField('guests.travellers.2.eD'),{name:'expiry-2',label:'Passport expiry',index:2});
 assert.deepEqual(guestIssueField('contactInfo.emails.0'),{name:'emergencyEmail',label:'Emergency contact email',index:undefined});
 assert.deepEqual(parseGuestIssues([null,{}, {path:'guests.travellers.2.dob',message:'Correct date.'}]),[{path:'travellers.2.dob',message:'Correct date.'}]);
});


test('existing DOB max rejects future infant and hotel age-zero births but allows India today',()=>{
 const today=indiaToday(new Date('2026-10-23T20:00:00Z'));
 assert.equal(today,'2026-10-24');
 const infantSearch:PartySearch={product:'FLIGHT',date:'2027-06-15',adults:1,children:0,infants:1};
 const hotelSearch:PartySearch={product:'HOTEL',checkIn:'2027-06-15',checkOut:'2027-06-20',adults:1,childrenAges:[0]};
 for(const [search,pt] of [[infantSearch,'INFANT'],[hotelSearch,'CHILD']] as const){
  const party:Guests={...guests,travellers:[adult,{...adult,pt,dob:'2027-06-14'}]};
  // Keep the existing saved-search server contract separate from the native
  // browser DOB max: both guards run before review/payment in the client.
  assert.deepEqual(guestDetailsIssues(party,search,{}),[]);
  assert.deepEqual(guestNativeIssues([{name:'dob-1',value:party.travellers[1].dob!,validity:{valid:true}}],today),[{path:'travellers.1.dob',message:'Date of birth cannot be after today (2026-10-24).'}]);
  const corrected:Guests={...party,travellers:[adult,{...party.travellers[1],dob:today}]};
  assert.deepEqual(guestDetailsIssues(corrected,search,{}),[]);
  assert.deepEqual(guestNativeIssues([{name:'dob-1',value:today,validity:{valid:true}}],today),[]);
 }
 assert.deepEqual(guestNativeIssues([{name:'dob-0',value:'',validity:{valid:true}}],today),[]);
});
test('every native constraint maps to a correctable field without dropping optional-only details',()=>{
 const cases=[['first-0','valueMissing','travellers.0.fN'],['dob-2','badInput','travellers.2.dob'],['pan-1','patternMismatch','travellers.1.pan'],['emergencyEmail','typeMismatch','contactInfo.emails.0'],['dob-0','rangeOverflow','travellers.0.dob'],['expiry-0','rangeUnderflow','travellers.0.eD'],['gstNumber','tooShort','gstInfo.gstNumber'],['gstName','tooLong','gstInfo.registeredName'],['expiry-3','stepMismatch','travellers.3.eD'],['phone','customError','phone']] as const;
 for(const [name,flag,path] of cases){
  const issues=guestNativeIssues([{name,value:'',validity:{[flag]:true,valid:false},validationMessage:'Existing custom constraint.'}],'2026-10-24');
  assert.equal(issues.length,1,flag);assert.equal(issues[0].path,path,flag);assert.ok(issues[0].message);
 }
 assert.deepEqual(guestNativeIssues([{name:'email',value:'test@example.test',validity:{valid:true}}],'2026-10-24'),[]);
 assert.deepEqual(guestNativeIssues([{name:'phone',value:'x',validity:{valid:false}}],'2026-10-24'),[{path:'phone',message:'Check this field.'}]);
});
