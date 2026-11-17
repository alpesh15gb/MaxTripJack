import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let serial=0;
const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const criteria={product:'HOTEL',hotelIds:['101'],checkIn:future(10),checkOut:future(12),adults:2,childrenAges:[7],rooms:[{adults:2,children:1,childAge:[7]}],nationality:'106'};
async function harness(){
 const state={actor:{userId:'guest:actual-owner',companyId:null as string|null},warmActor:null as {userId:string;companyId:string|null}|null,
  calls:[] as {product:string;payload:Record<string,unknown>}[],queries:[] as {sql:string;values:unknown[]}[],limits:[] as string[],markup:0,blocked:false,fail:false,gate:null as Promise<void>|null};
 const global=globalThis as unknown as Record<string,unknown>,key=`__warm_routes_${++serial}`;global[key]=state;delete global.maxtravelSearchWarmV1;delete global.maxtravelFlightSearchCacheV1;
 const prelude=`const state=globalThis[${JSON.stringify(key)}];`;
 const mocks:Record<string,string>={
  'server-only':'','next/navigation':'export function unstable_rethrow(){}',
  '@/lib/guest-shopping':`${prelude} export async function warmShoppingActor(){return state.warmActor;} export async function shoppingAccess(){return{actor:state.actor,cookie:'maxtravel-shopping=actual-only'};} export function shoppingResponse(response,access){response.headers.set('Set-Cookie',access.cookie);return response;}`,
  '@/lib/search-warm-identity':`${prelude} export function readSearchWarmScope(request,actor){return {actor:actor??state.warmActor,peer:'fixture-peer'};}`,
  './request-limit':`${prelude} export async function requestLimit(id,scope){state.limits.push(scope);if(state.blocked&&scope==='search-warm')throw Error('limited');}`,
  './db':`${prelude} export function database(){return{async query(sql,values){state.queries.push({sql,values});if(sql.includes('FROM pricing_rules'))return{rows:[{markup_minor:state.markup,markup_basis_points:0,service_fee_minor:0}]};if(sql.startsWith('INSERT INTO supplier_searches'))return{rows:[]};throw Error('Unexpected DB work');}};}`,
  './providers/tripjack':`${prelude} export const paths={HOTEL:{search:'/hotel/listing'},FLIGHT:{search:'/flight/listing'}};export async function tripjack(product,path,payload){state.calls.push({product,payload});if(state.gate)await state.gate;if(state.fail)throw Error('private supplier failure');return product==='HOTEL'?{status:{success:true},hotels:[{tjHotelId:'101',name:'Supplier hotel',options:[{optionId:'listing-room',pricing:{currency:'INR',totalPrice:1000}}]}]}:{status:{success:true},searchResult:{tripInfos:{ONWARD:[]}}};}`,
  './hotel-content':`export const hotelContentForSearch=Object.assign(async()=>({}),{peek:()=>({}),statuses:ids=>Object.fromEntries(ids.map(id=>[id,'pending']))});`,
 };
 const compile=async(path:string)=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'boundaries',setup(p){p.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);p.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));}}]});const compiled={exports:{} as {POST:(request:Request)=>Promise<Response>}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports.POST;};
 const warm=await compile('src/app/api/travel/search/warm/route.ts'),search=await compile('src/app/api/travel/search/route.ts');
 const before=process.env.BETTER_AUTH_URL;process.env.BETTER_AUTH_URL='https://booking.example.test';
 const call=(handler:typeof warm,body:unknown,intent:string,origin='https://booking.example.test')=>handler(new Request('https://booking.example.test/api/travel/search',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Search-Intent':intent},body:JSON.stringify(body)}));
 return {state,warm:(body:unknown,intent:string,origin?:string)=>call(warm,body,intent,origin),search:(body:unknown,intent:string)=>call(search,body,intent),cleanup(){delete global[key];delete global.maxtravelSearchWarmV1;delete global.maxtravelFlightSearchCacheV1;if(before===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=before;}};
}

test('separate real handlers share warm hotel correlation, emit no warm cookies/writes and apply current markup on actual submit',async()=>{
 const h=await harness(),intent=randomUUID();try{
  const warm=await h.warm(criteria,intent);assert.equal(warm.status,200);assert.equal(warm.headers.get('Set-Cookie'),null);assert.deepEqual(await warm.json(),{status:'ready'});
  assert.equal(h.state.calls.length,1);assert.equal(h.state.queries.length,0);
  h.state.markup=1234;const actual=await h.search(criteria,intent);assert.equal(actual.status,200);assert.match(actual.headers.get('Server-Timing')??'',/search_warm;desc="hit"/);
  const data=await actual.json();assert.equal(data.results.hotels[0].customerEstimateMinor,101234);assert.equal(h.state.calls.length,1);
  const saved=h.state.queries.find(row=>row.sql.startsWith('INSERT INTO supplier_searches'))!;assert.equal(saved.values[6],h.state.calls[0].payload.correlationId);assert.equal(saved.values[1],h.state.actor.userId);
  assert.deepEqual(h.state.calls[0].payload.rooms,criteria.rooms);assert.equal(h.state.calls[0].payload.nationality,'106');assert.ok(actual.headers.get('Set-Cookie'));
 }finally{h.cleanup();}
});

test('actual hotel submit joins in-progress warm and an out-of-order late warm makes no extra supplier request',async()=>{
 const h=await harness(),intent=randomUUID();let release!:()=>void;h.state.gate=new Promise<void>(resolve=>{release=resolve;});
 try{
  const warming=h.warm(criteria,intent);for(let attempt=0;attempt<100&&!h.state.calls.length;attempt++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.state.calls.length,1,'Warm supplier work should start within the bounded test deadline');
  const submitting=h.search(criteria,intent);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.state.calls.length,1);release();
  assert.equal((await warming).status,200);const submitted=await submitting;assert.equal(submitted.status,200);assert.match(submitted.headers.get('Server-Timing')??'',/search_warm;desc="joined"/);
  h.state.gate=null;const late=randomUUID();await h.search(criteria,late);const before=h.state.calls.length;
  assert.deepEqual(await(await h.warm(criteria,late)).json(),{status:'skipped'});assert.equal(h.state.calls.length,before);
 }finally{release();h.cleanup();}
});

test('mismatched occupancy/owner and failed speculative budget fall back to normal search',async()=>{
 const h=await harness();try{
  let intent=randomUUID();await h.warm(criteria,intent);await h.search({...criteria,rooms:[{adults:2,children:1,childAge:[8]}]},intent);assert.equal(h.state.calls.length,2);
  intent=randomUUID();h.state.warmActor={userId:'account-a',companyId:null};await h.warm(criteria,intent);await h.search(criteria,intent);assert.equal(h.state.calls.length,4);
  h.state.blocked=true;intent=randomUUID();assert.deepEqual(await(await h.warm(criteria,intent)).json(),{status:'skipped'});const count=h.state.calls.length;
  assert.equal((await h.search(criteria,intent)).status,200);assert.equal(h.state.calls.length,count+1);
  assert.equal((await h.warm(criteria,randomUUID(),'https://other.example')).status,204);assert.equal((await h.warm(criteria,'invalid')).status,204);
 }finally{h.cleanup();}
});

test('flight warm adopts the same prepared listing without bypassing normal search persistence',async()=>{
 const h=await harness(),intent=randomUUID();const flight={product:'FLIGHT',from:'HYD',to:'DEL',date:future(30),adults:1,children:0,infants:0,cabin:'ECONOMY'};
 try{assert.equal((await h.warm(flight,intent)).status,200);assert.equal(h.state.calls.length,1);assert.equal(h.state.queries.length,0);assert.equal((await h.search(flight,intent)).status,200);assert.equal(h.state.calls.length,1);assert.equal(h.state.queries.filter(row=>row.sql.startsWith('INSERT INTO supplier_searches')).length,1);}finally{h.cleanup();}
});
