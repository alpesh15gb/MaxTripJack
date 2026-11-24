import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url),searchId='11111111-1111-4111-8111-111111111111';
const actor={userId:'guest:snapshot-owner',companyId:null as string|null};
const day=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
let serial=0;
async function harness(){
  const segment={dt:day+'T09:00:00',at:day+'T11:00:00',duration:120,da:{code:'BOM'},aa:{code:'DEL'},fD:{fN:'201',aI:{name:'Synthetic Air',code:'6E'}}};
  const state={actor:{...actor},reads:0,pricingReads:0,providerCalls:0,accessCalls:0,limits:[] as string[],
    search:{product:'FLIGHT',service_kind:null as string|null,expires_at:new Date(Date.now()+60000).toISOString(),
      criteria:{product:'FLIGHT',from:'BOM',to:'DEL',date:day,adults:2,children:1,infants:0,cabin:'ECONOMY'},
      results:{supplierToken:'PRIVATE_TOKEN',searchResult:{tripInfos:{ONWARD:[
        {sI:[segment],totalPriceList:[{id:'exact-fare',fareIdentifier:'PUBLISHED',supplierNet:'PRIVATE_COST',fD:{ADULT:{fC:{TF:1000},bI:{cB:'7 Kg'},rT:1},CHILD:{fC:{TF:600}}}}]},
        {sI:[{...segment,da:{code:'NMI'}}],totalPriceList:[{id:'wrong-airport',fareIdentifier:'PUBLISHED',fD:{ADULT:{fC:{TF:1}},CHILD:{fC:{TF:1}}}}]},
      ]}}},
    }};
  const key=`__flight_snapshot_${++serial}`,globals=globalThis as unknown as Record<string,unknown>;globals[key]=state;
  const stateCode=`const state=globalThis[${JSON.stringify(key)}];`;
  const mocks:Record<string,string>={
    'server-only':'','next/navigation':'export function unstable_rethrow(){}',
    '@/lib/guest-shopping':`${stateCode} export async function shoppingAccess(request,scope){if(scope!=='detail')throw Error('Wrong scope');state.accessCalls++;return {actor:state.actor};}`,
    './request-limit':`${stateCode} export async function requestLimit(user,scope){state.limits.push(scope);}`,
    './db':`${stateCode} export function transaction(){throw Error("Unexpected quote refresh transaction");} export function database(){return {async query(sql,args){
      if(sql.includes('FROM supplier_searches')){state.reads++;if(!sql.includes('user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid'))throw Error('Missing ownership');return {rows:args[0]===${JSON.stringify(searchId)}&&args[1]===${JSON.stringify(actor.userId)}&&args[2]===null?[state.search]:[]};}
      if(sql.includes('FROM pricing_rules')){state.pricingReads++;return {rows:[{markup_minor:100,markup_basis_points:100,service_fee_minor:50}]};}
      throw Error('Unexpected database operation');}}}`,
    './providers/tripjack':`${stateCode} export const paths={};export async function tripjack(){state.providerCalls++;throw Error('Supplier calls forbidden');}`,
    './hotel-content':'export const hotelContentForSearch=Object.assign(async()=>{throw Error("Not hotel")},{peek:()=>({}),statuses:()=>({})});',
  };
  const output=await build({entryPoints:[resolve('src/app/api/travel/flight-search-snapshot/route.ts')],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'snapshot-boundaries',setup(p){
    p.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);
    p.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}]});
  const compiled={exports:{} as {POST:(request:Request)=>Promise<Response>}};new Function('module','exports','require',output.outputFiles[0].text)(compiled,compiled.exports,require);
  const before=process.env.BETTER_AUTH_URL;process.env.BETTER_AUTH_URL='https://maxtravel.test';
  return {state,call:(data:unknown={searchId},origin='https://maxtravel.test')=>compiled.exports.POST(new Request('https://maxtravel.test/api/travel/flight-search-snapshot',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)})),cleanup(){delete globals[key];if(before===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=before;}};
}

test('flight snapshot restores exact owned criteria, airport scope and current customer margin without new supplier work',async()=>{
  const h=await harness();try{
    const response=await h.call();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
    const result=await response.json();assert.equal(result.searchId,searchId);assert.equal(result.expiresAt,h.state.search.expires_at);
    assert.deepEqual(result.criteria,{product:'FLIGHT',from:'BOM',to:'DEL',date:day,adults:'2',children:'1',infants:'0',cabin:'ECONOMY'});
    const flights=result.results.searchResult.tripInfos.ONWARD;assert.equal(flights.length,1);assert.equal(flights[0].totalPriceList[0].id,'exact-fare');
    assert.equal(flights[0].totalPriceList[0].customerEstimateMinor,262750);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|supplierNet|wrong-airport|guest:snapshot-owner|"fC"|correlation/);
    assert.equal(h.state.providerCalls,0);assert.equal(h.state.reads,1);assert.deepEqual(h.state.limits,['flight-search-snapshot']);
  }finally{h.cleanup();}
});

test('flight snapshot rejects foreign ownership, company, expiry and invalid source before pricing',async()=>{
  const h=await harness();try{
    for(const mutate of [()=>{h.state.actor.userId='foreign';},()=>{h.state.actor.companyId='22222222-2222-4222-8222-222222222222';},()=>{h.state.search.expires_at='bad-date';},()=>{h.state.search.expires_at=new Date(Date.now()-1).toISOString();}]){
      h.state.actor={...actor};h.state.search.expires_at=new Date(Date.now()+60000).toISOString();h.state.pricingReads=0;mutate();
      const response=await h.call();assert.equal(response.status,409);assert.equal(h.state.pricingReads,0);assert.doesNotMatch(await response.text(),/PRIVATE_|exact-fare/);
    }
    h.state.actor={...actor};h.state.search.expires_at=new Date(Date.now()+60000).toISOString();
    h.state.search.product='HOTEL';assert.equal((await h.call()).status,400);
    h.state.search.product='FLIGHT';h.state.search.service_kind='REISSUE';assert.equal((await h.call()).status,400);
    h.state.search.service_kind=null;h.state.search.criteria.from='invalid';assert.equal((await h.call()).status,409);
    assert.equal(h.state.providerCalls,0);
  }finally{h.cleanup();}
});

test('flight snapshot rejects foreign origin, malformed IDs and extra fields before shopping access',async()=>{
  const h=await harness();try{
    assert.equal((await h.call({searchId},'https://foreign.test')).status,403);
    assert.equal((await h.call({searchId,actor:'other'})).status,400);
    assert.equal((await h.call({searchId:'../bad'})).status,400);
    assert.equal(h.state.accessCalls,0);assert.equal(h.state.reads,0);
  }finally{h.cleanup();}
});
