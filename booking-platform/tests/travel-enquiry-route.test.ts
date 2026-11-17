import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),origin='https://booking.example.test';
let serial=0;
async function harness(admin=false){
  const state={actor:{userId:'guest:first',companyId:null,permissions:[] as string[]},saves:[] as {actor:{userId:string};input:{requestId:string}}[],reads:[] as string[],dbCalls:0,outboxWrites:0,retryRow:null as null|{crm_event_id:string;version:number;crm_receiver:string|null},limited:false,accessError:0};
  const key='__enquiry_route_'+(++serial),globals=globalThis as unknown as Record<string,unknown>;globals[key]=state;
  const scope=`const state=globalThis[${JSON.stringify(key)}];`;
  const mocks:Record<string,string>={
    'next/navigation':'export function unstable_rethrow(){}',
    '@/lib/guest-shopping':`${scope} import {HttpError} from '@/lib/http'; export async function shoppingAccess(){if(state.accessError)throw new HttpError(state.accessError,'Access restricted.');return {actor:state.actor,cookie:'shopping=opaque; HttpOnly; Path=/api/travel'};} export function shoppingResponse(response,access){response.headers.set('Set-Cookie',access.cookie);return response;}`,
    '@/lib/request-limit':`${scope} import {HttpError} from '@/lib/http'; export async function requestLimit(){if(state.limited)throw new HttpError(429,'Wait before retrying.');}`,
    '@/lib/access':`${scope} import {HttpError} from '@/lib/http'; export async function operationsAccess(){return state.actor;} export async function administrator(request,permission){if(!state.actor.permissions.includes(permission))throw new HttpError(403,'No permission.');return state.actor;}`,
    '@/lib/travel-enquiries':`${scope} export const enquirySelect='SELECT fixture'; export const adminEnquiry=row=>row; const receipt={id:'11111111-1111-4111-8111-111111111111',reference:'ME-111111111111',service:'VISA',status:'NEW',createdAt:'2030-01-01T00:00:00.000Z',crmStatus:'PENDING'}; export async function saveEnquiry(actor,input){state.saves.push({actor:{...actor},input});return receipt;} export async function findEnquiryRequest(actor,id){state.reads.push(actor.userId);return state.saves.some(row=>row.actor.userId===actor.userId&&row.input.requestId===id)?receipt:null;}`,
    '@/lib/db':`${scope} const query=async(sql)=>{state.dbCalls++;if(sql.startsWith('UPDATE outbox_events'))state.outboxWrites++;return {rowCount:0,rows:sql.includes('count(*)')?[{total:'0'}]:sql.startsWith('SELECT crm_event_id')&&state.retryRow?[state.retryRow]:[]};};export const database=()=>({query});export const transaction=run=>run({query});`,
  };
  const prior=process.env.BETTER_AUTH_URL;process.env.BETTER_AUTH_URL=origin;
  const output=await build({entryPoints:[admin?'src/app/api/admin/enquiries/route.ts':'src/app/api/travel/enquiries/route.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'boundaries',setup(plugin){plugin.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'boundary'}:undefined);plugin.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}));}}]});
  const loaded={exports:{} as Record<string,(request:Request)=>Promise<Response>>};new Function('module','exports','require',output.outputFiles[0].text)(loaded,loaded.exports,require);
  return {state,call(method:string,value?:unknown,headers:Record<string,string>={}){return loaded.exports[method](new Request(origin+(admin?'/api/admin/enquiries':'/api/travel/enquiries')+(method==='GET'?'?requestId=11111111-1111-4111-8111-111111111111':''),{method,headers:{origin,'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(value)})}));},close(){delete globals[key];if(prior===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=prior;}};
}
const input={requestId:'11111111-1111-4111-8111-111111111111',consent:true,draft:{service:'VISA',destination:'UAE',travelWindow:'December 2030',adults:1,childAges:[],nationality:'Indian',purpose:'Tourism'},contact:{name:'Synthetic customer',email:'synthetic@example.test',preferredChannel:'EMAIL'}};
test('enquiry submission requires same-origin, explicit consent and validated details before saving',async()=>{
  const h=await harness();try{
    assert.equal((await h.call('POST',input,{origin:'https://other.example'})).status,403);
    assert.equal((await h.call('POST',{...input,consent:false})).status,400);
    assert.equal((await h.call('POST',{...input,crmStatus:'DELIVERED'})).status,400);
    assert.equal(h.state.saves.length,0);
    h.state.limited=true;assert.equal((await h.call('POST',input)).status,429);assert.equal(h.state.saves.length,0);
    h.state.limited=false;h.state.accessError=403;assert.equal((await h.call('POST',input)).status,403);assert.equal(h.state.saves.length,0);
  }finally{h.close();}
});
test('customer confirmation saves a pending receipt; status recovery is actor scoped and does not expose contact',async()=>{
  const h=await harness();try{
    const result=await h.call('POST',input);assert.equal(result.status,201);assert.match(result.headers.get('set-cookie')??'',/HttpOnly/);
    const text=await result.text();assert(!text.includes('synthetic@example.test'));assert.match(text,/PENDING/);assert.equal(h.state.saves.length,1);
    assert.equal((await(await h.call('GET')).json()).enquiry.reference,'ME-111111111111');
    h.state.actor.userId='guest:other';assert.equal((await(await h.call('GET')).json()).enquiry,null);
    assert.deepEqual(h.state.reads,['guest:first','guest:other']);
  }finally{h.close();}
});
test('staff register and mutations enforce distinct existing permissions and stale-edit conflicts',async()=>{
  const h=await harness(true);try{
    assert.equal((await h.call('GET')).status,403);assert.equal(h.state.dbCalls,0);
    h.state.actor.permissions=['bookings:read'];const read=await h.call('GET');assert.equal(read.status,200);assert.equal((await read.json()).canManage,false);
    const edit={id:input.requestId,version:1,status:'CONTACTED',internalNote:'Fixture'};
    assert.equal((await h.call('PATCH',edit)).status,403);
    assert.equal((await h.call('POST',{id:input.requestId,version:1,action:'retry_crm'})).status,403);
    h.state.actor.permissions.push('bookings:reconcile');assert.equal((await h.call('PATCH',edit,{origin:'https://other.example'})).status,403);
    assert.equal((await h.call('PATCH',edit)).status,409,'A missing/stale version cannot overwrite another update');
  }finally{h.close();}
});
test('admin retries cannot transfer or mutate old unclassified enquiries, even with integration permission',async()=>{
  const h=await harness(true);try{
    h.state.actor.permissions=['integrations:manage'];
    h.state.retryRow={crm_event_id:'22222222-2222-4222-8222-222222222222',version:1,crm_receiver:null};
    const retry={id:input.requestId,version:1,action:'retry_crm'};
    assert.equal((await h.call('POST',retry)).status,409);assert.equal(h.state.outboxWrites,0);
    assert.equal((await h.call('POST',{...retry,crm_receiver:'safar',environment:'live'})).status,400);assert.equal(h.state.outboxWrites,0);
  }finally{h.close();}
});
