import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
let serial=0;
async function harness(){
 const now=Date.now(),oldStart=new Date(now-120000).toISOString(),nextStart=new Date(now-1000).toISOString(),deadline=new Date(now+86400000).toISOString(),end=new Date(now+172800000).toISOString();
 const review=(from:string)=>({bookingId:'fresh-supplier-reference',option:{pricing:{totalPrice:10000,currency:'INR'},compliance:{panRequired:false},cancellation:{isRefundable:true,penalties:[{from,to:deadline,amount:0},{from:deadline,to:end,amount:10000}]}}});
 const state={job:{order_id:'synthetic-order',state:'READY',attempted:false,checks:0},order:{id:'synthetic-order',reference:'MT-SYNTHETIC',product:'HOTEL',status:'PAID',total_minor:1034983,supplier_minor:1000000,quote_created_at:new Date(now-60000),review:review(oldStart),selection:{hid:'10001',optionId:'selected-room'},supplier_booking_id:null as string|null},fresh:review(nextStart),events:[] as Array<{type:string;payload:Record<string,unknown>}>,warnings:[] as unknown[],reviewCalls:0,bookCalls:0,detailsCalls:0,detailsStatus:'SUCCESS',detailsFail:false,detailsMissing:false,bookRejected:false,bookResponseLost:false,reviewFails:false,guestFails:false};
 const globals=globalThis as unknown as Record<string,unknown>,key=`__booking_runner_${++serial}`;
 globals[key]=state;const scope=`const state=globalThis[${JSON.stringify(key)}];`;
 const mocks:Record<string,string>={
  'server-only':'',
  './checkout-extras':`export function initialFlightBody(){throw Error('Unexpected flight');} export function validateFlightFare(){throw Error('Unexpected flight');}`,
  './flight-service-runner':`export function runFlightServiceJob(){throw Error('Unexpected service');}`,
  './vault':`${scope} export function seal(){return 'synthetic-encrypted';} export function unseal(){if(state.guestFails)throw Error('PRIVATE KEY DATA');return {travellers:[{ti:'Mr',pt:'ADULT',fN:'Synthetic',lN:'Guest'}],email:'synthetic@example.test',phone:'9000000000'};}`,
  './providers/tripjack':`${scope}
   export const paths={HOTEL:{review:'review',book:'book',details:'details'}};
   export class TripjackRequestError extends Error {
    constructor(code){super('PRIVATE PROVIDER MESSAGE');this.upstream={product:'HOTEL',httpStatus:400,supplierErrorCodes:[code]};}
   }
   export async function tripjack(product,path,payload){
    if(product!=='HOTEL')throw Error('Unexpected product');
    if(path==='review'){state.reviewCalls++;if(state.reviewFails)throw Error('PRIVATE PROVIDER BODY');return structuredClone(state.fresh);}
    if(path==='book'){
     if(!state.job.attempted||state.order.status!=='BOOKING_PENDING'||state.order.supplier_booking_id!==payload.bookingId||payload.paymentInfos[0].amount!==10000)throw Error('Book dispatched without persisted marker or correct amount');
     state.bookCalls++;if(state.bookRejected)throw new TripjackRequestError('810');if(state.bookResponseLost)throw Error('Response lost after acceptance');return {};
    }
    if(path==='details'){state.detailsCalls++;if(payload.bookingId!==state.order.supplier_booking_id)throw Error('Wrong supplier reference');if(state.detailsMissing)throw new TripjackRequestError('2501');if(state.detailsFail)throw Error('PRIVATE DETAILS');return {order:{status:state.detailsStatus}};}
    throw Error('Unexpected supplier request');
   }`,
  './db':`${scope}
   async function query(sql,values=[]){
    if(sql.startsWith('UPDATE booking_jobs SET lease_token='))return {rows:['READY','POLLING'].includes(state.job.state)?[{...state.job}]:[],rowCount:1};
    if(sql.startsWith('SELECT o.*,q.review'))return {rows:[structuredClone(state.order)],rowCount:1};
    if(sql.startsWith('SELECT id FROM payments'))return {rows:[{id:'captured'}],rowCount:1};
    if(sql.startsWith("UPDATE booking_jobs SET attempted=true")){state.job.attempted=true;state.job.state='POLLING';return {rows:[{order_id:state.order.id}],rowCount:1};}
    if(sql.startsWith("UPDATE orders SET status='BOOKING_PENDING'")){state.order.status='BOOKING_PENDING';state.order.supplier_booking_id=values[0];return {rows:[],rowCount:1};}
    if(sql.startsWith('SELECT o.id,o.status FROM orders'))return {rows:[{id:state.order.id,status:state.order.status}],rowCount:1};
    if(sql.startsWith('UPDATE orders SET status=$1')){state.order.status=values[0];return {rows:[],rowCount:1};}
    if(sql.startsWith('UPDATE orders SET status=$2')){state.order.status=values[1];return {rows:[],rowCount:1};}
    if(sql.startsWith('INSERT INTO supplier_booking_payloads'))return {rows:[],rowCount:1};
    if(sql.startsWith('UPDATE booking_jobs SET state=$1')){state.job.state=values[0];state.job.checks++;return {rows:[],rowCount:1};}
    if(sql.startsWith('UPDATE booking_jobs SET checks=')){state.job.checks++;return {rows:[],rowCount:1};}
    if(sql.startsWith("UPDATE booking_jobs SET state='REVIEW'")){state.job.state='REVIEW';return {rows:[],rowCount:1};}
    if(sql.startsWith('INSERT INTO outbox_events')){state.events.push({type:values[2],payload:values[3]});return {rows:[],rowCount:1};}
    throw Error('Unexpected SQL: '+sql);
   }
   export const database=()=>({query});export const transaction=async action=>action({query});`,
 };
 try{
  const result=await build({entryPoints:[resolve('src/lib/booking-runner.ts')],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,logLevel:'silent',plugins:[{name:'booking-boundaries',setup(plugin){
   plugin.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);
   plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}));
  }}]});
  const compiled={exports:{} as {runBookingJob:()=>Promise<boolean>}};
  new Function('module','exports','require','console',result.outputFiles[0].text)(compiled,compiled.exports,require,{warn:(...values:unknown[])=>state.warnings.push(values)});
  return {state,run:compiled.exports.runBookingJob,cleanup:()=>{delete globals[key];}};
 }catch(e){delete globals[key];throw e;}
}

test('actual booking worker accepts rolling hotel origin and marks attempt before booking exactly once',async()=>{
 const h=await harness();try{
  assert.equal(await h.run(),true);assert.equal(h.state.order.status,'CONFIRMED');assert.equal(h.state.job.attempted,true);
  assert.equal(h.state.reviewCalls,1);assert.equal(h.state.bookCalls,1);assert.equal(h.state.detailsCalls,1);
  assert.equal(h.state.events[0].type,'booking.confirmed');assert.equal(await h.run(),false);assert.equal(h.state.bookCalls,1);
 }finally{h.cleanup();}
});

test('actual worker blocks changed price, fees and compliance before Book and records safe reasons',async()=>{
 for(const kind of ['price','fee','compliance'] as const){const h=await harness();try{
  if(kind==='price')h.state.fresh.option.pricing.totalPrice++;
  if(kind==='fee')h.state.fresh.option.cancellation.penalties[1].amount++;
  if(kind==='compliance')h.state.fresh.option.compliance.panRequired=true;
  await h.run();assert.equal(h.state.order.status,'BOOKING_FAILED');assert.equal(h.state.job.attempted,false);assert.equal(h.state.job.state,'REVIEW');
  assert.equal(h.state.bookCalls,0);assert.equal(h.state.detailsCalls,0);
  assert.deepEqual(h.state.events[0].payload.failure,{stage:'HOTEL_REVIEW',code:kind==='price'?'HOTEL_PRICE_CHANGED':kind==='fee'?'HOTEL_CANCELLATION_CHANGED':'HOTEL_COMPLIANCE_CHANGED'});
  assert.equal(await h.run(),false);
 }finally{h.cleanup();}}
});

test('supplier review and guest failures are distinguishable without logging private errors',async()=>{
 for(const guestFails of [false,true]){const h=await harness();try{
  h.state.guestFails=guestFails;h.state.reviewFails=!guestFails;await h.run();assert.equal(h.state.bookCalls,0);
  assert.deepEqual(h.state.events[0].payload.failure,{stage:guestFails?'GUEST_VALIDATION':'HOTEL_REVIEW',code:'OPERATION_FAILED'});
  assert.doesNotMatch(JSON.stringify(h.state.warnings),/PRIVATE|synthetic@example|9000000000/);
 }finally{h.cleanup();}}
});

test('lost Book response is reconciled by existing reference without submitting another Book',async()=>{
 const h=await harness();try{
  h.state.bookResponseLost=true;h.state.detailsMissing=true;await h.run();
  assert.equal(h.state.job.attempted,true);assert.equal(h.state.job.state,'POLLING');assert.equal(h.state.order.status,'BOOKING_PENDING');
  h.state.detailsMissing=false;await h.run();assert.equal(h.state.order.status,'CONFIRMED');assert.equal(h.state.bookCalls,1);assert.equal(h.state.reviewCalls,1);
 }finally{h.cleanup();}
});

test('known submit rejection with a missing supplier order goes straight to manual review',async()=>{
 const h=await harness();try{
  h.state.bookRejected=true;h.state.detailsMissing=true;await h.run();
  assert.equal(h.state.order.status,'MANUAL_REVIEW');assert.equal(h.state.job.state,'REVIEW');
  assert.deepEqual(h.state.events[0].payload.failure,{stage:'BOOKING_SUBMIT',code:'TRIPJACK_BOOK_REJECTED',supplierErrorCodes:['810']});
  assert.equal(await h.run(),false);assert.equal(h.state.bookCalls,1);assert.equal(h.state.detailsCalls,1);
  assert.doesNotMatch(JSON.stringify(h.state.warnings),/PRIVATE PROVIDER MESSAGE/);
 }finally{h.cleanup();}
});

test('existing terminal failures stay untouched and exhausted uncertain attempts need manual review',async()=>{
 const h=await harness();try{
  h.state.job.state='REVIEW';h.state.order.status='BOOKING_FAILED';assert.equal(await h.run(),false);assert.equal(h.state.reviewCalls,0);
  h.state.job.state='POLLING';h.state.job.attempted=true;h.state.job.checks=35;h.state.order.status='BOOKING_PENDING';h.state.order.supplier_booking_id='existing-reference';h.state.detailsFail=true;
  await h.run();assert.equal(h.state.order.status,'MANUAL_REVIEW');assert.equal(h.state.bookCalls,0);assert.equal(h.state.reviewCalls,0);
 }finally{h.cleanup();}
});

test('a stale ready job cannot rewrite a terminal order or publish a failure',async()=>{
 const h=await harness();try{
  h.state.order.status='CANCELLED';
  assert.equal(await h.run(),true);
  assert.equal(h.state.job.state,'DONE');
  assert.equal(h.state.order.status,'CANCELLED');
  assert.equal(h.state.reviewCalls,0);
  assert.equal(h.state.bookCalls,0);
  assert.deepEqual(h.state.events,[]);
 }finally{h.cleanup();}
});
