import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {CheckoutTripRecord} from '../src/lib/checkout-trip-comparison';

const require=createRequire(import.meta.url);
const quoteId='30cf55a8-7c40-42e2-a7b9-0499667a556a',previousId='a0cf55a8-7c40-42e2-a7b9-0499667a556b';
const trip=(date='2030-01-10'):CheckoutTripRecord=>({product:'FLIGHT',search_product:'FLIGHT',criteria:{product:'FLIGHT',from:'BOM',to:'DEL',date,adults:1},selection:{priceIds:['synthetic-fare']},service_kind:null,search_service_kind:null,parent_order_id:null});
let serial=0;
async function harness(){
  const guests={travellers:[{ti:'Mr',pt:'ADULT',fN:'Synthetic',lN:'Guest'}],email:'synthetic@example.test',phone:'9000000000'};
  const state={actor:{userId:'synthetic-owner',companyId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as string|null},current:trip(),
    previous:[{record:{...trip(),id:previousId},quoteOwner:'synthetic-owner',searchOwner:'synthetic-owner',quoteCompany:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as string|null,searchCompany:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as string|null}],
    scopeQueries:[] as {sql:string;values:unknown[]}[],providerChecks:0,writes:0,existing:false};
  const key=`__interrupted_payment_test_${++serial}`,globals=globalThis as unknown as Record<string,unknown>;globals[key]=state;
  const scope=`const state=globalThis[${JSON.stringify(key)}];`;
  const mocks:Record<string,string>={
    'server-only':'',
    '@/lib/quote-promo':'export class PromoReviewRequired extends Error{}; export function validateQuotePromo(){throw Error("Unexpected promo mutation");}',
    '@/lib/service-conditions':'export const serviceDisclosure=()=>({blocked:false});',
    '@/lib/payment-provider':`${scope} import {HttpError} from '@/lib/http';export const checkoutPaymentProvider=()=>"RAZORPAY";export function assertNewPaymentProviderReady(){state.providerChecks++;throw new HttpError(418,'Guard passed; test stopped before provider work.');}`,
    '@/lib/payglocal-travel-runtime':'export function payGlocalTravelForQuote(){throw Error("Unexpected provider work");}',
    '@/lib/payglocal-runtime':'export function createPayGlocalCheckout(){throw Error("Unexpected provider mutation");} export function payGlocalPayload(){throw Error("Unexpected provider work");}',
    '@/lib/providers/payglocal-config':'export function payGlocalConfig(){throw Error("Unexpected provider work");}',
    '@/lib/checkout-extras':'export function validateInitialExtras(){throw Error("Unexpected fare mutation");}',
    '@/lib/access':`${scope} export const principal=async()=>state.actor;`,
    '@/lib/http':'export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}} export const json=(data,status=200)=>Response.json(data,{status});export const failure=e=>json({error:e.message},e.status||(e.name==="ZodError"?400:500));export const body=async(request,schema)=>schema.parse(await request.json());export function sameOrigin(){}',
    '@/lib/supplier-flow':`${scope} export const owned=async(table)=>table==='supplier_quotes'?{id:${JSON.stringify(quoteId)},search_id:'synthetic-search',product:state.current.product,total_minor:10000,supplier_minor:9000,expires_at:new Date(Date.now()+60000).toISOString(),selection:state.current.selection,review:{},service_kind:state.current.service_kind}:{product:state.current.search_product,criteria:state.current.criteria,service_kind:state.current.search_service_kind,parent_order_id:state.current.parent_order_id};export function assertFresh(){}`,
    '@/lib/guest-validation':'export function validateParty(){} export function validateGuestReview(){}',
    '@/lib/vault':'export function seal(){throw Error("Unexpected encryption");}export function unseal(){throw Error("Unexpected stored guest access");}',
    '@/lib/fare-validation':'export class FareValidationBlockedError extends Error{}',
    '@/lib/providers/tripjack':'export function tripjack(){throw Error("Unexpected supplier call");}',
    '@/lib/providers/razorpay':'export function razorpayKey(){throw Error("Unexpected gateway config");}export function razorpay(){throw Error("Unexpected gateway mutation");}',
    '@/lib/payment-intent':'export function persistGatewayOrder(){throw Error("Unexpected gateway persistence");}export function markGatewayIntentUnknown(){throw Error("Unexpected intent mutation");}',
    '@/lib/db':`${scope}
      async function query(sql,values){
        if(sql.includes('JOIN supplier_searches')){
          state.scopeQueries.push({sql,values});
          if(!/q\\.user_id=\\$2/.test(sql)||!/s\\.user_id=\\$2/.test(sql)||!/q\\.company_id IS NOT DISTINCT FROM \\$3::uuid/.test(sql)||!/s\\.company_id IS NOT DISTINCT FROM \\$3::uuid/.test(sql))throw Error('Missing account ownership boundary');
          const rows=state.previous.filter(row=>values[0].includes(row.record.id)&&row.quoteOwner===values[1]&&row.searchOwner===values[1]&&row.quoteCompany===values[2]&&row.searchCompany===values[2]).map(row=>row.record);return {rows,rowCount:rows.length};
        }
        if(sql.includes('JOIN gateway_intents'))return {rows:state.existing?[{id:'original',provider:'RAZORPAY'}]:[],rowCount:state.existing?1:0};
        throw Error('Unexpected database query');
      }
      export const database=()=>({query});export async function transaction(){state.writes++;throw Error('Unexpected transaction');}`,
  };
  try{
    const result=await build({entryPoints:[resolve('src/app/api/payments/create/route.ts')],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,logLevel:'silent',plugins:[{name:'interrupted-payment-boundaries',setup(plugin){plugin.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}));}}]});
    const compiled={exports:{} as {POST:(request:Request)=>Promise<Response>}};
    new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);
    return {state,send:(interruptedQuoteIds?:unknown)=>compiled.exports.POST(new Request('http://127.0.0.1/api/payments/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quoteId,guests,acceptedTotalMinor:10000,...(interruptedQuoteIds!==undefined?{interruptedQuoteIds}:{})})})),close:()=>{delete globals[key];}};
  }catch(error){delete globals[key];throw error;}
}

test('same trip across old quotes blocks before any provider work, without exposing the old ID',async()=>{
  const h=await harness();try{
    const response=await h.send([previousId]),body=await response.json();
    assert.equal(response.status,409);assert.equal(body.code,'CHECKOUT_TRIP_CONFLICT');assert.match(body.error,/No new payment was started/);
    assert.doesNotMatch(JSON.stringify(body),new RegExp(previousId));assert.equal(h.state.providerChecks,0);assert.equal(h.state.writes,0);
    assert.deepEqual(h.state.scopeQueries[0].values,[[previousId],h.state.actor.userId,h.state.actor.companyId]);
  }finally{h.close();}
});

test('unowned quote, unowned search and either different company fail closed identically',async()=>{
  const h=await harness();try{
    const original={...h.state.previous[0]};
    for(const change of [{quoteOwner:'another-user'},{searchOwner:'another-user'},{quoteCompany:null},{searchCompany:null}]){
      h.state.previous[0]={...original,...change};const response=await h.send([previousId]),body=await response.json();
      assert.equal(response.status,409);assert.equal(body.code,'CHECKOUT_TRIP_UNVERIFIED');assert.doesNotMatch(JSON.stringify(body),/another-user|a0cf55a8/);
    }
    assert.equal(h.state.providerChecks,0);assert.equal(h.state.writes,0);
  }finally{h.close();}
});

test('self, missing and malformed references do not start provider work',async()=>{
  const h=await harness();try{
    let response=await h.send([quoteId.toUpperCase()]);assert.equal(response.status,409);assert.equal((await response.json()).code,'CHECKOUT_TRIP_CONFLICT');assert.equal(h.state.scopeQueries.length,0);
    response=await h.send(['cccccccc-cccc-4ccc-8ccc-cccccccccccc']);assert.equal(response.status,409);assert.equal((await response.json()).code,'CHECKOUT_TRIP_UNVERIFIED');
    h.state.previous[0].record={...trip(),id:previousId,criteria:{product:'FLIGHT',from:'BOM'}};
    response=await h.send([previousId]);assert.equal(response.status,409);assert.equal((await response.json()).code,'CHECKOUT_TRIP_UNVERIFIED');
    for(const input of [['not-a-uuid'],Array.from({length:21},()=>previousId),'unexpected-object'])assert.equal((await h.send(input)).status,400);
    assert.equal(h.state.providerChecks,0);assert.equal(h.state.writes,0);
  }finally{h.close();}
});

test('confirmed distinct dates and products proceed while duplicate UUID casing resolves once',async()=>{
  const h=await harness();try{
    h.state.previous[0].record={...trip('2030-01-11'),id:previousId};
    assert.equal((await h.send([previousId,previousId.toUpperCase()])).status,418);assert.deepEqual(h.state.scopeQueries[0].values[0],[previousId]);
    h.state.current={product:'HOTEL',search_product:'HOTEL',criteria:{product:'HOTEL',hotelIds:['10001'],checkIn:'2030-01-10',checkOut:'2030-01-12'},selection:{hid:'10001'}};
    h.state.previous[0].record={...trip(),id:previousId,service_kind:'ANCILLARY',search_service_kind:'ANCILLARY',parent_order_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
    assert.equal((await h.send([previousId])).status,418);assert.equal(h.state.providerChecks,2);assert.equal(h.state.writes,0);
  }finally{h.close();}
});

test('every interrupted reference must be verified and distinct before proceeding',async()=>{
  const h=await harness();try{
    const secondId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const original={...h.state.previous[0]};
    h.state.previous[0].record={...trip('2030-01-11'),id:previousId};
    h.state.previous.push({...original,record:{...trip(),id:secondId}});
    let response=await h.send([previousId,secondId]);assert.equal(response.status,409);assert.equal((await response.json()).code,'CHECKOUT_TRIP_CONFLICT');
    h.state.previous[1].record={...trip('2030-01-12'),id:secondId};
    h.state.previous[1].searchOwner='other-owner';
    response=await h.send([previousId,secondId]);assert.equal(response.status,409);assert.equal((await response.json()).code,'CHECKOUT_TRIP_UNVERIFIED');
    assert.equal(h.state.providerChecks,0);assert.equal(h.state.writes,0);
    h.state.previous[1].searchOwner=original.searchOwner;
    assert.equal((await h.send([previousId,secondId])).status,418);assert.equal(h.state.providerChecks,1);
  }finally{h.close();}
});

test('no references leave existing checkout validation and reuse pathway unchanged',async()=>{
  const h=await harness();try{
    assert.equal((await h.send()).status,418);h.state.existing=true;assert.equal((await h.send([])).status,418);
    assert.equal(h.state.scopeQueries.length,0);assert.equal(h.state.providerChecks,2);assert.equal(h.state.writes,0);
  }finally{h.close();}
});
