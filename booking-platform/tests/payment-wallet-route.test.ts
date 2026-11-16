import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let serial = 0;
async function harness() {
  const quoteId = '30cf55a8-7c40-42e2-a7b9-0499667a556a';
  const guests = { travellers: [{ ti: 'Mr', pt: 'ADULT', fN: 'Synthetic', lN: 'Guest' }], email: 'synthetic@example.test', phone: '9000000000' };
  const state = { account: {} as unknown, product: 'HOTEL', walletCalls: 0, gatewayCalls: 0, orderWrites: 0, existing: false, guests, promo: null as Record<string,unknown>|null, snapshots:[] as unknown[],
    quote: { id: quoteId, search_id: 'synthetic-search', product: 'HOTEL', total_minor: 200620, supplier_minor: '200620' as unknown, selection: {}, review: {}, promo_code_id:null as string|null,undiscounted_minor:null as number|null,discount_minor:0, expires_at: new Date(Date.now() + 60000).toISOString() } };
  const key = `__wallet_route_test_${++serial}`, globals = globalThis as unknown as Record<string, unknown>;
  globals[key] = state;
  const scope = `const state=globalThis[${JSON.stringify(key)}];`;
  const mocks: Record<string,string> = {
    'server-only': '',
    '@/lib/service-conditions': 'export const serviceDisclosure=()=>({blocked:false});',
    '@/lib/payment-provider': 'export const checkoutPaymentProvider=()=>"RAZORPAY"; export function assertNewPaymentProviderReady(){}',
    '@/lib/payglocal-travel-runtime': 'export function payGlocalTravelForQuote(){throw Error("Unexpected PayGlocal");}',
    '@/lib/payglocal-runtime': 'export function createPayGlocalCheckout(){throw Error("Unexpected PayGlocal");} export function payGlocalPayload(){throw Error("Unexpected PayGlocal");}',
    '@/lib/providers/payglocal-config': 'export function payGlocalConfig(){throw Error("Unexpected PayGlocal");}',
    '@/lib/checkout-extras': 'export function validateInitialExtras(){throw Error("Unexpected extras");}',
    '@/lib/access': 'export const principal=async()=>({userId:"synthetic-user",companyId:null});',
    '@/lib/http': `export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}} export const json=(data,status=200)=>Response.json(data,{status}); export const failure=e=>json({error:e.message},e.status||500); export const body=async(request,schema)=>schema.parse(await request.json()); export function sameOrigin(){}`,
    '@/lib/supplier-flow': `${scope} export const owned=async(table)=>table==='supplier_quotes'?{...state.quote,product:state.product}:{criteria:{},parent_order_id:null}; export function assertFresh(value){if(Date.parse(value)<=Date.now())throw Error('Expired');}`,
    '@/lib/guest-validation': 'export function validateParty(){} export function validateGuestReview(){}',
    '@/lib/vault': `${scope} export const seal=()=>"synthetic-ciphertext";export const unseal=()=>state.guests;`,
    '@/lib/fare-validation': 'export class FareValidationBlockedError extends Error{}',
    '@/lib/providers/tripjack': `${scope} export async function tripjack(product,path,body,flag,method){if(product!==state.product||path!=='/ums/v1/user-detail'||method!=='GET')throw Error('Unexpected account request');state.walletCalls++;return state.account;}`,
    '@/lib/providers/razorpay': `${scope} export const razorpayKey=()=>({id:'rzp_test_synthetic'});export async function razorpay(path,payload){if(path!=='/orders'||payload.amount!==state.quote.total_minor)throw Error('Unexpected gateway request');state.gatewayCalls++;return {id:'order_synthetic',amount:payload.amount,currency:'INR'};}`,
    '@/lib/payment-intent': 'export async function persistGatewayOrder(){} export async function markGatewayIntentUnknown(){throw Error("Unexpected uncertainty");}',
    '@/lib/db': `${scope}
      async function query(sql,values){
        if(sql.includes('SELECT * FROM supplier_quotes'))return {rows:[state.quote],rowCount:1};
        if(sql.includes('JOIN gateway_intents'))return {rows:state.existing?[{id:'existing-booking',provider:'RAZORPAY',guests_encrypted:'synthetic-ciphertext',gateway_order_id:'order_existing'}]:[],rowCount:state.existing?1:0};
        if(sql.startsWith('SELECT * FROM promo_codes'))return {rows:state.promo?[state.promo]:[]};
        if(sql.startsWith('UPDATE orders SET promo_snapshot')){state.snapshots.push(values[1]);return {rowCount:1};}
        if(sql.startsWith('INSERT INTO orders')){state.orderWrites++;return {rows:[],rowCount:1};}
        if(sql.startsWith('INSERT INTO gateway_intents'))return {rows:[],rowCount:1};
        throw Error('Unexpected database query');
      }
      export const database=()=>({query});export const transaction=async action=>action({query});`,
  };
  try {
    const result = await build({ entryPoints: [resolve('src/app/api/payments/create/route.ts')], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, logLevel: 'silent', plugins: [{ name: 'wallet-payment-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks,args.path) ? { path: args.path, namespace: 'mock' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }] });
    const compiled = { exports: {} as { POST: (request:Request)=>Promise<Response> } };
    new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);
    return { state, send: () => compiled.exports.POST(new Request('http://127.0.0.1/api/payments/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId, guests, acceptedTotalMinor: 200620 }) })), cleanup: () => { delete globals[key]; } };
  } catch (error) { delete globals[key]; throw error; }
}

test('real payment route accepts sufficient nested wallet for flight/hotel and creates one priced Razorpay order', async () => {
  const { state, send, cleanup } = await harness();
  try {
    for (const product of ['FLIGHT','HOTEL']) {
      state.product=product;state.walletCalls=0;state.orderWrites=0;state.gatewayCalls=0;
      state.account={user:{userId:'private-account',bs:{walletBalance:2006.2,totalBalance:99999}},status:{success:true}};
      const response=await send(), result=await response.json();
      assert.equal(response.status,200);assert.equal(result.orderId,'order_synthetic');assert.equal(result.amount,200620);
      assert.equal(state.walletCalls,1);assert.equal(state.orderWrites,1);assert.equal(state.gatewayCalls,1);
      assert.doesNotMatch(JSON.stringify(result),/private-account|walletBalance|totalBalance/);
    }
  } finally { cleanup(); }
});

test('real payment route rejects insufficient/malformed wallet before any order write or gateway call', async () => {
  const { state, send, cleanup } = await harness();
  try {
    for (const walletBalance of [0,2006.19,'2006.1999',null,true,'',[],{},'Infinity']) {
      state.account={walletBalance:999999,user:{bs:{walletBalance,totalBalance:999999,creditBalance:999999}}};
      const response=await send();assert.equal(response.status,503);assert.equal(state.orderWrites,0);assert.equal(state.gatewayCalls,0);
      assert.deepEqual(await response.json(),{error:'Booking is temporarily unavailable. Please contact Max Travel before making payment.'});
    }
    state.account={user:{bs:{totalBalance:999999}}};assert.equal((await send()).status,503);
    state.account={user:{bs:{walletBalance:999999}}};state.quote.supplier_minor=null;assert.equal((await send()).status,503);
    assert.equal(state.orderWrites,0);assert.equal(state.gatewayCalls,0);
  } finally { cleanup(); }
});

test('real payment route resumes existing checkout without another wallet probe or gateway order', async () => {
  const { state, send, cleanup } = await harness();
  try {
    state.existing=true;state.account={user:{bs:{walletBalance:null}}};
    const response=await send();assert.equal(response.status,200);assert.equal((await response.json()).orderId,'order_existing');
    assert.equal(state.walletCalls,0);assert.equal(state.gatewayCalls,0);assert.equal(state.orderWrites,0);
  } finally { cleanup(); }
});


test('payment rechecks promo eligibility and records the exact discount without reducing supplier funds',async()=>{
 const {state,send,cleanup}=await harness();
 try{
  state.quote.supplier_minor='190000';state.quote.undiscounted_minor=210620;state.quote.promo_code_id='promo';state.quote.discount_minor=10000;
  state.promo={code:'SAVE100',product:'ALL',active:true,expires_at:new Date(Date.now()+60000),discount_minor:10000,discount_basis_points:0,minimum_minor:0,maximum_discount_minor:null};
  state.account={user:{bs:{walletBalance:1900}}};
  let response=await send();assert.equal(response.status,200);assert.equal(state.orderWrites,1);assert.equal(state.gatewayCalls,1);
  assert.deepEqual(state.snapshots,[{code:'SAVE100',discountMinor:10000,originalTotalMinor:210620}]);
  state.orderWrites=0;state.gatewayCalls=0;state.promo.active=false;
  response=await send();assert.equal(response.status,409);assert.equal((await response.json()).code,'PROMO_REVIEW_REQUIRED');assert.equal(state.orderWrites,0);assert.equal(state.gatewayCalls,0);
  state.promo.active=true;state.promo.discount_minor=9000;
  response=await send();assert.equal(response.status,409);assert.equal(state.orderWrites,0);
  state.promo.discount_minor=10000;state.promo.expires_at=new Date(Date.now()-1000);
  response=await send();assert.equal(response.status,409);assert.equal(state.gatewayCalls,0);
 }finally{cleanup();}
});
