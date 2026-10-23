import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHotelContentCache } from '../src/lib/hotel-content-cache';
import { customerHotelOptions, type PricingRule } from '../src/lib/customer-pricing';
import type { Actor } from '../src/lib/supplier-flow';

const actor: Actor = {userId:'synthetic-room-user',companyId:null};
const rule: PricingRule = {markup_minor:100,markup_basis_points:100,service_fee_minor:50};
const supplier = {reviewHash:'fresh-supplier-review',options:[{
 optionId:'original-room-id',inventory:{available:true},roomInfo:[{id:'supplier-room-type',name:'Deluxe'}],
 pricing:{currency:'INR',totalPrice:8000,mf:12,mft:2},mealBasis:'BREAKFAST',
 cancellation:{isRefundable:false,penalties:[{from:'2027-01-01T00:00:00+05:30',to:'2027-01-02T00:00:00+05:30',amount:2407.09}]},
 bookingNotes:'Mandatory property charge: see supplier terms.',
},{optionId:'sold-out-room',inventory:{available:false},pricing:{currency:'INR',totalPrice:1}}]};
const metadata = {hotels:[{tjHotelId:'10001',locale:{address:{fulladdr:'Verified static address'}},amenities:{'0':{name:'Pool'}},pricing:{totalPrice:1},cancellation:{isRefundable:true}}]};
let serial=0;
const require=createRequire(import.meta.url);

// Exercise the ACTUAL supplier-flow implementation with only DB/provider boundaries
// doubled. The real metadata cache is deliberately held; no live services are used.
async function harness(content:ReturnType<typeof createHotelContentCache>){
 const state={content,supplier,rule,calls:0,owned:true,expires:new Date(Date.now()+60_000).toISOString()};
 const key=`__room_first_test_${++serial}`;
 const globals=globalThis as unknown as Record<string,unknown>;globals[key]=state;
 const stateSource=`const state=globalThis[${JSON.stringify(key)}];`;
 const mocks:Record<string,string>={
  'server-only':'',
  './hotel-content':`${stateSource} export const hotelContentForSearch=state.content;`,
  './request-limit':'export async function requestLimit(){}',
  './db':`${stateSource} export function database(){return {async query(sql){
   if(sql.includes('FROM supplier_searches'))return {rows:state.owned?[{product:'HOTEL',expires_at:state.expires,correlation_id:'owned-correlation',criteria:{product:'HOTEL',hotelIds:['10001'],checkIn:'2027-01-01',checkOut:'2027-01-02',adults:1,nationality:'106'}}]:[]};
   if(sql.includes('FROM pricing_rules'))return {rows:[state.rule]};
   throw Error('Unexpected DB query');
  }}}`,
  './providers/tripjack':`${stateSource}
   export const paths={HOTEL:{detail:'fixture-hotel-detail'}};
   export async function tripjack(product,path,input){
    if(product!=='HOTEL'||path!=='fixture-hotel-detail'||input.hid!=='10001'||input.correlationId!=='owned-correlation')throw Error('Unexpected provider request');
    state.calls++;return structuredClone(state.supplier);
   }`,
 };
 try{
  const result=await build({entryPoints:[resolve('src/lib/supplier-flow.ts')],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,logLevel:'silent',plugins:[{name:'room-first-boundaries',setup(plugin){
   plugin.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);
   plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}));
  }}]});
  const compiled={exports:{} as Record<string,unknown>};
  new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);
  const detail=compiled.exports.customerHotelDetail as (searchId:string,hid:string,actor:Actor)=>Promise<ReturnType<typeof customerHotelOptions>&{property?:{address?:string}}>
  return {detail,state,cleanup:()=>{delete globals[key];}};
 }catch(error){delete globals[key];throw error;}
}

test('room prices, IDs and mandatory policies return while optional metadata is still held',async()=>{
 let release!:()=>void,contentCalls=0;
 const held=new Promise<void>(resolve=>{release=resolve;});
 const content=createHotelContentCache(async()=>{contentCalls++;await held;return metadata;});
 const pendingContent=content(['10001'],['10001']);
 const {detail,state,cleanup}=await harness(content);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const notReady=Symbol('Room detail waited for optional content');
  const result=await Promise.race([detail('owned-search','10001',actor),new Promise<typeof notReady>(resolve=>{timer=setTimeout(()=>resolve(notReady),500);})]);
  assert.notEqual(result,notReady,'Ready rates must return before held static metadata');
  if(result===notReady)throw Error('Room detail blocked');
  assert.deepEqual(result.options,customerHotelOptions(supplier,rule).options);
  assert.equal(result.options[0].optionId,'original-room-id');
  assert.equal(result.options[0].pricing.totalPrice,8081.5);
  assert.equal(result.options[0].bookingNotes,'Mandatory property charge: see supplier terms.');
  assert.deepEqual(result.options[0].cancellation,supplier.options[0].cancellation);
  assert.equal(result.property,undefined);assert.equal(contentCalls,1);assert.equal(state.calls,1);
  release();await pendingContent;
  const cached=await detail('owned-search','10001',actor);
  assert.equal(cached.property?.address,'Verified static address');
  assert.deepEqual(cached.options,result.options,'Static content must never replace live prices or policies');
  assert.equal(contentCalls,1,'Room detail must not start detached metadata requests');
  assert.equal(state.calls,2,'Every room detail still requests fresh supplier availability');
 }finally{clearTimeout(timer);release();await pendingContent;cleanup();}
});

test('room detail cache miss does not start metadata work and retains ownership/freshness checks',async()=>{
 let contentCalls=0;
 const content=createHotelContentCache(async()=>{contentCalls++;return metadata;});
 const {detail,state,cleanup}=await harness(content);
 try{
  const result=await detail('owned-search','10001',actor);
  assert.equal(result.property,undefined);assert.equal(contentCalls,0);
  assert.equal(state.calls,1);
  await assert.rejects(detail('owned-search','99999',actor),/Hotel not part of this search/);
  state.expires=new Date(Date.now()-1).toISOString();
  await assert.rejects(detail('owned-search','10001',actor),/expired/);
  state.owned=false;
  await assert.rejects(detail('not-owned-search','10001',actor),/Record not found/);
  assert.equal(state.calls,1);assert.equal(contentCalls,0);
 }finally{cleanup();}
});
