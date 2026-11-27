import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {customerTotal} from '../src/lib/pricing-calculation';
import type {reviewSupplier} from '../src/lib/supplier-flow';

test('flight refresh persists rechecked paid seats and requires explicit removal when unavailable', async () => {
 const actor={userId:'test-customer',companyId:null};
 const rule={markup_minor:0,markup_basis_points:1500,service_fee_minor:0};
 const leg={
  id:'old-leg',da:{code:'HYD'},aa:{code:'DEL'},dt:'2026-12-04T08:30',at:'2026-12-04T10:50',
  fD:{fN:'889',aI:{name:'Test airline',code:'6E'}},
 };
 const selection={priceIds:['chosen-fare'],checkoutExtras:{
  choices:[{segmentId:leg.id,travellerIndex:0,kind:'SEAT',code:'old-seat-code'}],
  summary:[{kind:'SEAT',travellerIndex:0,label:'Seat 10A'}],
 }};
 const state={
  available:true, inserts:[] as unknown[][], retired:[] as unknown[],
  search:{
   product:'FLIGHT',expires_at:new Date(Date.now()+90_000),
   criteria:{product:'FLIGHT',from:'HYD',to:'DEL',date:'2026-12-04',adults:1,children:0,infants:0},
   results:{searchResult:{tripInfos:{ONWARD:[{sI:[leg],totalPriceList:[{id:'chosen-fare'}]}]}}},
  },
  previous:{id:'old-quote',product:'FLIGHT',search_id:'owned-search',selection,review:{tripInfos:[{sI:[leg]}]}},
  fresh:{bookingId:'new-review',conditions:{st:120,isa:true},tripInfos:[{sI:[{...leg,id:'new-leg'}]}],
   totalPriceInfo:{totalFareDetail:{fC:{BF:6000,TAF:540,TF:6540}}}},
  rule,
 };
 const scope='__booking_flight_extras_refresh_test__';
 const globals=globalThis as Record<string,unknown>;
 globals[scope]=state;
 const declaration=`const state=globalThis[${JSON.stringify(scope)}];`;
 const mocks:Record<string,string>={
  'server-only':'',
  'next/navigation':'export function unstable_rethrow(){}',
  './request-limit':'export async function requestLimit(){}',
  './public-supplier-review':'export function publicSupplierReview(){return {}}',
  './hotel-content':'export const hotelContentForSearch={};',
  './fare-calendar':'export function observeSearchFare(){}',
  './db':`${declaration}
   export function database(){return {async query(sql,args){
    if(sql.includes('FROM supplier_searches'))return {rows:[state.search]};
    if(sql.includes('FROM supplier_quotes'))return {rows:[state.previous]};
    if(sql.includes('FROM pricing_rules'))return {rows:[state.rule]};
    if(sql.includes('FROM orders'))return {rows:[],rowCount:0};
    if(sql.startsWith('INSERT INTO supplier_quotes')){state.inserts.push(args);return {rowCount:1,rows:[]};}
    if(sql.startsWith('UPDATE supplier_quotes SET expires_at=LEAST')){state.retired.push(args[0]);return {rowCount:1,rows:[]};}
    throw Error('Unexpected query');
   }}}
   export async function transaction(run){return run(database());}`,
  './providers/tripjack':`${declaration}
   export const paths={FLIGHT:{review:'fare-review'}};
   export async function tripjack(product,path){
    if(product!=='FLIGHT')throw Error('Unexpected product');
    if(path==='fare-review')return structuredClone(state.fresh);
    if(path==='/fms/v2/farerule')return {};
    if(path==='/fms/v1/seat')return {tripSeatMap:{'new-leg':{sInfo:[{code:'new-seat-code',seatNo:'10A',amount:630,isBooked:!state.available}]}}};
    throw Error('Unexpected transport');
   }`,
 };
 try{
  const bundled=await build({entryPoints:['src/lib/supplier-flow.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,logLevel:'silent',plugins:[{name:'refresh-boundaries',setup(builder){
   builder.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);
   builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}));
  }}]});
  const compiled={exports:{} as {reviewSupplier:typeof reviewSupplier}};
  new Function('module','exports','require',bundled.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
  const review=compiled.exports.reviewSupplier;
  const input={previousQuoteId:'old-quote',priceIds:['chosen-fare']};
  const kept=await review('owned-search',input,actor);
  assert.equal(kept.extrasRefresh,'kept');
  assert.equal(kept.totalMinor,customerTotal(717000,rule));
  assert.equal(kept.baseTotalMinor,customerTotal(654000,rule));
  assert.equal(kept.totalMinor-kept.baseTotalMinor!,72450);
  assert.deepEqual((state.inserts[0][5] as typeof selection).checkoutExtras.choices,[{segmentId:'new-leg',travellerIndex:0,kind:'SEAT',code:'new-seat-code'}]);
  assert.equal(state.inserts[0][8],717000);
  assert.deepEqual(state.retired,['old-quote']);
  state.available=false;
  await assert.rejects(review('owned-search',input,actor),/saved flight extras could not be verified/);
  assert.equal(state.inserts.length,1,'An unverified refresh must not persist a quote without the seat');
  assert.deepEqual(state.retired,['old-quote'],'A failed refresh must not retire a quote');
  const removed=await review('owned-search',{...input,removeFlightExtras:true},actor);
  assert.equal(removed.extrasRefresh,'removed');
  assert.equal(removed.totalMinor,customerTotal(654000,rule));
  assert.equal((state.inserts[1][5] as typeof selection).checkoutExtras,undefined);
 }finally{delete globals[scope];}
});
