import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const id='11111111-1111-4111-8111-111111111111';
let serial=0;
async function harness(){
 const state={allowed:true,owned:false,failGuests:false,malformedGuests:false,events:[] as string[],unsealed:[] as string[],
  order:{reference:'SYNTHETIC',product:'HOTEL',status:'CONFIRMED',currency:'INR',total_minor:123400,created_at:'2026-11-20',supplier_booking_id:'SYNTHETIC-SUPPLIER',guests_encrypted:'guest-record',itinerary_summary:{rooms:[{adults:1},{adults:2}]},service_kind:null},
  supplier:{} as unknown,
  guests:{email:'PRIVATE_EMAIL',phone:'PRIVATE_PHONE',travellers:[{fN:'First',lN:'Guest',roomIndex:0,pan:'PRIVATE_PAN'},{fN:'Second',lN:'Guest',roomIndex:1,passportNumber:'PRIVATE_PASSPORT'},{fN:'Third',lN:'Guest',roomIndex:1}]},
 };
 const key=`__booking_details_${++serial}`,globals=globalThis as unknown as Record<string,unknown>;globals[key]=state;
 const prefix=`const state=globalThis[${JSON.stringify(key)}];`;
 const mocks:Record<string,string>={
  '@/lib/guest-shopping':`${prefix} export async function checkoutAccess(){state.events.push('access');return {actor:{userId:'guest:fixture',companyId:null}};} export function shoppingResponse(response){return response;}`,
  '@/lib/guest-checkout':`${prefix} export async function claimGuestBookings(){state.events.push('claim');}`,
  '@/lib/supplier-flow':`${prefix} export async function owned(table,id,actor){state.events.push('owned');if(table!=='orders'||id!==${JSON.stringify(id)}||actor.userId!=='guest:fixture')throw Error('Incorrect ownership check');if(!state.allowed)throw Object.assign(Error('Record not found.'),{status:404});state.owned=true;return state.order;}`,
  '@/lib/db':`${prefix} export function database(){return {async query(sql){if(!state.owned)throw Error('Read before ownership');state.events.push('query');if(sql.includes('supplier_booking_payloads'))return {rows:[{encrypted_payload:'supplier-record'}]};if(sql.includes('SELECT status FROM payments'))return {rows:[{status:'CAPTURED'}]};if(sql.includes("FROM supplier_quotes"))return {rows:[{hid:'1212',review:{option:{roomInfo:[{name:'Garden room'}],mealBasis:'ROOM_ONLY',inclusions:['Breakfast voucher'],supplierNet:'PRIVATE_PRICE'}}}]};if(sql.includes('FROM refunds'))return {rows:[]};throw Error('Unexpected query');}};}`,
  '@/lib/hotel-content':`${prefix} export async function readStoredHotelProperties(ids){if(!state.owned||ids.length!==1||ids[0]!=='1212')throw Error('Invalid hotel scope');return {'1212':{city:'Goa',amenities:[],photos:[{isHero:true,url:'https://pix8.agoda.net/hotelImages/1212/1212.jpg'}]}};}`,
  '@/lib/vault':`${prefix} export function unseal(value,context){if(!state.owned||context!==${JSON.stringify(id)})throw Error('Decrypt before ownership');state.unsealed.push(value);if(value==='guest-record'){if(state.failGuests)throw Error('PRIVATE_DECRYPTION_FAILURE');return state.malformedGuests?{travellers:'PRIVATE_MALFORMED'}:state.guests;}return state.supplier;}`,
  '@/lib/http':`export function json(data){return Response.json(data,{headers:{'cache-control':'private, no-store'}});} export function failure(error){return Response.json({error:error.message},{status:error.status??500});}`,
 };
 const built=await build({entryPoints:[resolve('src/app/api/bookings/[id]/details/route.ts')],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'details-boundaries',setup(p){p.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);p.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));}}]});
 const compiled={exports:{} as {GET:(request:Request,context:{params:Promise<{id:string}>})=>Promise<Response>}};
 new Function('module','exports','require',built.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
 return {state,call:()=>compiled.exports.GET(new Request(`https://booking.example.test/api/bookings/${id}/details`),{params:Promise.resolve({id})}),cleanup:()=>{delete globals[key];}};
}

test('owned hotel details project saved guest names and exact room assignment without identity documents or contact',async()=>{
 const h=await harness();try{
  const response=await h.call();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.json();assert.deepEqual(body.passengers,[{name:'First Guest',pnrs:[],tickets:[],roomIndex:0},{name:'Second Guest',pnrs:[],tickets:[],roomIndex:1},{name:'Third Guest',pnrs:[],tickets:[],roomIndex:1}]);
  assert.deepEqual(body.stay, {property:{city:'Goa',amenities:[],photos:[{isHero:true,url:'https://pix8.agoda.net/hotelImages/1212/1212.jpg'}]},rooms:['Garden room'], meal:'ROOM ONLY',inclusions:['Breakfast voucher']});
  assert.doesNotMatch(JSON.stringify(body),/PRIVATE_|passport|pan|guest-record/);assert.deepEqual(h.state.events.slice(0,3),['access','claim','owned']);assert.deepEqual(h.state.unsealed,['supplier-record','guest-record']);
 }finally{h.cleanup();}
});

test('hotel details never invent a room assignment when a saved index is outside the owned room count',async()=>{
 const h=await harness();try{
  h.state.guests.travellers[0].roomIndex=-1;h.state.guests.travellers[1].roomIndex=2;h.state.guests.travellers[2].roomIndex=0.5;
  const body=await(await h.call()).json();assert.equal(body.passengers.length,3);assert.ok(body.passengers.every((guest:Record<string,unknown>)=>!Object.hasOwn(guest,'roomIndex')));
 }finally{h.cleanup();}
});

test('flight supplier identifiers remain authoritative and do not decrypt hotel fallback guests',async()=>{
 const h=await harness();try{
  h.state.order.product='FLIGHT';h.state.order.status='TICKETED';h.state.supplier={travellers:[{fN:'Ticketed',lN:'Traveller',pnrDetails:{outbound:'SYNTHETIC-PNR'},ticketNumberDetails:{outbound:'SYNTHETIC-TICKET'}}]};
  const body=await(await h.call()).json();assert.deepEqual(body.passengers,[{name:'Ticketed Traveller',pnrs:['SYNTHETIC-PNR'],tickets:['SYNTHETIC-TICKET']}]);assert.deepEqual(h.state.unsealed,['supplier-record']);
 }finally{h.cleanup();}
});

test('missing, unreadable and malformed legacy hotel guests preserve authoritative status and payment',async()=>{
 const h=await harness();try{
  for(const mode of ['missing','unreadable','malformed']){
   h.state.order.guests_encrypted=mode==='missing'?'':'guest-record';h.state.failGuests=mode==='unreadable';h.state.malformedGuests=mode==='malformed';
   const response=await h.call();assert.equal(response.status,200);const body=await response.json();
   assert.equal(body.status,'CONFIRMED');assert.equal(body.paymentStatus,'CAPTURED');assert.equal(body.supplierBookingId,'SYNTHETIC-SUPPLIER');assert.deepEqual(body.passengers,[]);assert.doesNotMatch(JSON.stringify(body),/PRIVATE_/);
  }
 }finally{h.cleanup();}
});

test('foreign hotel details reject before payload reads or guest decryption',async()=>{
 const h=await harness();try{
  h.state.allowed=false;const response=await h.call();assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/First|Second|Third|PRIVATE_/);assert.deepEqual(h.state.events,['access','claim','owned']);assert.deepEqual(h.state.unsealed,[]);
 }finally{h.cleanup();}
});
