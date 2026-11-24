import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHotelContentCache } from '../src/lib/hotel-content-cache';
import { customerHotelOptions, customerHotelResults, type PricingRule } from '../src/lib/customer-pricing';
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
 const state={content,supplier:structuredClone(supplier),rule,calls:0,owned:true,owner:actor,persistAllowed:true,
  results:{hotels:[{tjHotelId:'10001',name:'Test hotel',options:supplier.options}]} as Record<string,unknown>,
  reviewCalls:[] as Record<string,unknown>[],queries:[] as {sql:string;args:unknown[]}[],onDetail:null as null|(()=>void),
  reviewOption:structuredClone(supplier.options[0]),expires:new Date(Date.now()+60_000).toISOString()};
 const key=`__room_first_test_${++serial}`;
 const globals=globalThis as unknown as Record<string,unknown>;globals[key]=state;
 const stateSource=`const state=globalThis[${JSON.stringify(key)}];`;
 const mocks:Record<string,string>={
  'server-only':'',
  './hotel-content':`${stateSource} export const hotelContentForSearch=state.content;`,
  './request-limit':'export async function requestLimit(){}',
  './db':`${stateSource} export function transaction(){throw Error("Unexpected quote refresh transaction");} export function database(){return {async query(sql,args){
   state.queries.push({sql,args});
   const owned=state.owned&&args[0]==='owned-search'&&args[1]===state.owner.userId&&args[2]===state.owner.companyId;
   if(sql.includes('FROM supplier_searches'))return {rows:owned?[{product:'HOTEL',results:structuredClone(state.results),expires_at:state.expires,correlation_id:'owned-correlation',criteria:{product:'HOTEL',hotelIds:['10001','10002'],checkIn:'2027-01-01',checkOut:'2027-01-02',adults:1,nationality:'106'}}]:[]};
   if(sql.startsWith('UPDATE supplier_searches')){
    if(!owned||!state.persistAllowed||new Date(state.expires).getTime()<=Date.now())return {rowCount:0,rows:[]};
    state.results._maxtravelHotelReview={...state.results._maxtravelHotelReview,[args[3]]:JSON.parse(args[4])};
    return {rowCount:1,rows:[]};
   }
   if(sql.includes('FROM pricing_rules'))return {rows:[state.rule]};
   if(sql.startsWith('INSERT INTO supplier_quotes'))return {rowCount:1,rows:[]};
   throw Error('Unexpected DB query');
  }}}`,
  './providers/tripjack':`${stateSource}
   export const paths={HOTEL:{detail:'fixture-hotel-detail',review:'fixture-hotel-review'}};
   export async function tripjack(product,path,input){
    if(product!=='HOTEL'||!['10001','10002'].includes(input.hid)||input.correlationId!=='owned-correlation')throw Error('Unexpected provider request');
    if(path==='fixture-hotel-review'){state.reviewCalls.push(input);return {bookingId:'synthetic-booking',option:structuredClone(state.reviewOption)};}
    if(path!=='fixture-hotel-detail')throw Error('Unexpected provider path');
    state.calls++;state.onDetail?.();return structuredClone(state.supplier);
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
  const review=compiled.exports.reviewSupplier as (searchId:string,selection:{hid:string;optionId:string},actor:Actor)=>Promise<{quoteId:string;review:unknown}>;
  return {detail,review,state,cleanup:()=>{delete globals[key];}};
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
  assert.equal(state.queries.filter(query=>query.sql.includes('FROM supplier_searches')).length,1,'Detail reuses its authorized search instead of reading the full result JSON twice');
  await assert.rejects(detail('owned-search','99999',actor),/Hotel not part of this search/);
  state.expires=new Date(Date.now()-1).toISOString();
  await assert.rejects(detail('owned-search','10001',actor),/expired/);
  state.owned=false;
  await assert.rejects(detail('not-owned-search','10001',actor),/Record not found/);
  assert.equal(state.calls,1);assert.equal(contentCalls,0);
 }finally{cleanup();}
});

test('hotel review uses the displayed detail pair after sign-in even when a new pricing call would rotate IDs',async()=>{
 const {detail,review,state,cleanup}=await harness(createHotelContentCache(async()=>metadata));
 const guest={userId:'guest:synthetic-shopping-identity',companyId:null};
 try{
  state.owner=guest;
  const shown=await detail('owned-search','10001',guest);
  // The existing guest claim transfers this same row; its detail context stays.
  state.owner=actor;
  state.supplier={...structuredClone(supplier),reviewHash:'different-private-hash',options:[{...structuredClone(supplier.options[0]),optionId:'rotated-room-id'}]};
  const quote=await review('owned-search',{hid:'10001',optionId:shown.options[0].optionId},actor);
  assert.equal(state.calls,1,'Review must not issue another pricing call');
  assert.deepEqual(state.reviewCalls,[{hid:'10001',optionId:'original-room-id',reviewHash:'fresh-supplier-review',correlationId:'owned-correlation'}]);
  assert.ok(quote.quoteId);
  for(const publicData of [shown,quote,customerHotelResults(state.results)])assert.doesNotMatch(JSON.stringify(publicData),/reviewHash|fresh-supplier-review|_maxtravelHotelReview/);
  const stored=state.results._maxtravelHotelReview as Record<string,unknown>;
  assert.doesNotMatch(JSON.stringify(stored),/pricing|totalPrice|bookingNotes|cancellation/,'Only bounded review context is persisted');
 }finally{cleanup();}
});

test('per-hotel SQL merge preserves another hotel and latest detail invalidates an older selection without substitution',async()=>{
 const {detail,review,state,cleanup}=await harness(createHotelContentCache(async()=>metadata));
 try{
  await detail('owned-search','10001',actor);
  state.supplier={...structuredClone(supplier),reviewHash:'second-hotel-hash',options:[{...structuredClone(supplier.options[0]),optionId:'second-hotel-room'}]};
  await detail('owned-search','10002',actor);
  await review('owned-search',{hid:'10001',optionId:'original-room-id'},actor);
  assert.equal(state.reviewCalls[0].reviewHash,'fresh-supplier-review');
  const writes=state.queries.filter(({sql})=>sql.startsWith('UPDATE supplier_searches'));
  assert.equal(writes.length,2);
  for(const {sql,args} of writes){
   assert.match(sql,/jsonb_set\(results/);assert.match(sql,/results->'_maxtravelHotelReview'/);assert.match(sql,/jsonb_build_object\(\$4::text,\$5::jsonb\)/);
   assert.match(sql,/id=\$1 AND user_id=\$2 AND company_id IS NOT DISTINCT FROM \$3::uuid/);
   assert.match(sql,/product='HOTEL' AND service_kind IS NULL AND expires_at>now\(\)/);
   assert.match(sql,/criteria->'hotelIds' \? \$4::text/);
   assert.deepEqual(args.slice(0,3),['owned-search',actor.userId,actor.companyId]);
  }
  await detail('owned-search','10001',actor);
  await assert.rejects(review('owned-search',{hid:'10001',optionId:'original-room-id'},actor),/Go back to stays/);
  assert.equal(state.reviewCalls.length,1,'A stale selected room must never silently become another room');
  await review('owned-search',{hid:'10001',optionId:'second-hotel-room'},actor);
  assert.equal(state.reviewCalls[1].reviewHash,'second-hotel-hash');
 }finally{cleanup();}
});

test('review rejects unavailable, missing, stale and foreign context before supplier transport',async()=>{
 const {detail,review,state,cleanup}=await harness(createHotelContentCache(async()=>metadata));
 const selection={hid:'10001',optionId:'original-room-id'};
 try{
  await assert.rejects(review('owned-search',selection,actor),/Go back to stays/);
  assert.equal(state.calls,0,'Missing snapshots must not fall back to fresh pricing');
  await detail('owned-search','10001',actor);
  const original=structuredClone(state.results);
  const snapshot=()=>((state.results._maxtravelHotelReview as Record<string,unknown>)['10001'] as Record<string,unknown>);
  for(const patch of [{fetchedAt:Date.now()-10*60*1000},{fetchedAt:Date.now()+60_000},{fetchedAt:'not-a-time'},{fetchedAt:0},{reviewHash:''},{reviewHash:'x'.repeat(8193)},{options:[]}]){
   state.results=structuredClone(original);Object.assign(snapshot(),patch);
   await assert.rejects(review('owned-search',selection,actor),/Go back to stays/);
  }
  state.results=structuredClone(original);
  await assert.rejects(review('owned-search',{...selection,optionId:'sold-out-room'},actor),/Go back to stays/);
  await assert.rejects(review('owned-search',{...selection,optionId:'forged-room'},actor),/Go back to stays/);
  await assert.rejects(review('owned-search',{...selection,hid:'99999'},actor),/Hotel not part/);
  await assert.rejects(review('owned-search',selection,{userId:'other-user',companyId:null}),/Record not found/);
  await assert.rejects(review('owned-search',selection,{...actor,companyId:'other-company'}),/Record not found/);
  await assert.rejects(review('other-search',selection,actor),/Record not found/);
  state.expires=new Date(Date.now()-1).toISOString();
  await assert.rejects(review('owned-search',selection,actor),/expired/);
  assert.equal(state.calls,1);assert.equal(state.reviewCalls.length,0);
 }finally{cleanup();}
});

test('malformed or excessive detail cannot expose selectable options without persisted review context',async()=>{
 const {detail,state,cleanup}=await harness(createHotelContentCache(async()=>metadata));
 try{
  for(const hash of ['', 'x'.repeat(8193)]){
   state.supplier={...structuredClone(supplier),reviewHash:hash};
   await assert.rejects(detail('owned-search','10001',actor),/Room availability could not be verified/);
  }
  state.supplier={...structuredClone(supplier),options:Array.from({length:2001},(_,index)=>({...structuredClone(supplier.options[0]),optionId:`room-${index}`}))};
  await assert.rejects(detail('owned-search','10001',actor),/Room availability could not be verified/);
  state.supplier={...structuredClone(supplier),options:[structuredClone(supplier.options[0]),structuredClone(supplier.options[0])]};
  await assert.rejects(detail('owned-search','10001',actor),/Room availability could not be verified/);
  assert.equal(state.queries.filter(({sql})=>sql.startsWith('UPDATE supplier_searches')).length,0);
  state.supplier=structuredClone(supplier);state.persistAllowed=false;
  await assert.rejects(detail('owned-search','10001',actor),/search is no longer available/);
  assert.equal(state.results._maxtravelHotelReview,undefined);
  state.persistAllowed=true;state.onDetail=()=>{state.owner={userId:'new-owner',companyId:null};};
  await assert.rejects(detail('owned-search','10001',actor),/search is no longer available/);
  assert.equal(state.results._maxtravelHotelReview,undefined,'Ownership changes during provider fetch must prevent exposing the response');
 }finally{cleanup();}
});
