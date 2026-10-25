import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { authTrustedOrigins, accountMailOriginAllowed } from '../src/lib/auth-origin';
const base='https://example.test';
const request=(headers:Record<string,string>)=>new Request(base,{headers});
test('account origin policy accepts configured web, native scheme and headerless clients',()=>{
 assert.deepEqual(authTrustedOrigins(`${base}/account`),[base,'maxtravel://']);
 for(const headers of ([{},{origin:base},{origin:'maxtravel://'},{origin:'maxtravel://account'},{referer:`${base}/account?return=1`},{referer:'maxtravel://account'}] as Record<string,string>[])) assert.equal(accountMailOriginAllowed(request(headers),base),true,JSON.stringify(headers));
 assert.equal(accountMailOriginAllowed(request({'sec-fetch-site':'cross-site'}),base),false);
});
test('account origin policy rejects malformed, ambiguous and untrusted browser headers',()=>{
 for(const origin of ['', 'null','https://evil.test',`${base}/`,`${base}/path`,`${base}:443`, 'https://EXAMPLE.test','https://user@example.test','https://example.test.evil.test','https://example.test\\@evil.test',`${base} https://evil.test`,'maxtravel-evil://','maxtravel://user:secret@account']) assert.equal(accountMailOriginAllowed(request({origin,referer:base}),base),false,origin);
 for(const referer of ['', 'null','https://evil.test/account','https://user:secret@example.test/account','https://example.test\\evil','javascript:alert(1)']) assert.equal(accountMailOriginAllowed(request({referer}),base),false,referer);
 // Fetch Headers trims boundary whitespace; exercise the raw policy boundary too.
 for(const origin of [` ${base}`,`${base}\t`,`${base}\u0001`,`${base}\u007f`]) assert.equal(accountMailOriginAllowed({headers:{get:(key:string)=>key==='origin'?origin:null}} as unknown as Request,base),false);
 assert.equal(accountMailOriginAllowed(request({origin:base}),undefined),false);
});
test('all exact mail initiation POST routes reject untrusted origins before mail or auth lookup',async()=>{
 const state={configured:true,mailCalls:0,authCalls:0};
 const globals=globalThis as unknown as {__originState:typeof state};globals.__originState=state;
 const old=process.env.BETTER_AUTH_URL;process.env.BETTER_AUTH_URL=base;
 try {
  const output=await build({entryPoints:['src/app/api/auth/[...all]/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'boundaries',setup(p){
   p.onResolve({filter:/^@\/lib\/(auth|mail|http)$/},a=>({path:a.path,namespace:'mock'}));
   p.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path.endsWith('/auth')?'export function getAuth(){globalThis.__originState.authCalls++;return {handler:async()=>Response.json({delegated:true})}}':a.path.endsWith('/mail')?'export function mailReady(){globalThis.__originState.mailCalls++;return globalThis.__originState.configured}':'export class HttpError extends Error{constructor(status,message){super(message);this.status=status}} export function failure(e){return Response.json({error:e.message},{status:e.status||500})}'}));
  }}]});
  const compiled={exports:{} as {POST:(r:Request)=>Promise<Response>;GET:(r:Request)=>Promise<Response>}};new Function('module','exports',output.outputFiles[0].text)(compiled,compiled.exports);
  for(const configured of [true,false]){state.configured=configured;
   for(const endpoint of ['sign-up/email','request-password-reset','send-verification-email']) for(const suffix of ['','/']) {
    for(const email of ['known@example.test','unknown@example.test']) {
     const before={...state};const denied=await compiled.exports.POST(new Request(`${base}/api/auth/${endpoint}${suffix}`,{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({email})}));
     assert.equal(denied.status,403);assert.equal(state.mailCalls,before.mailCalls);assert.equal(state.authCalls,before.authCalls);
    }
    for(const headers of ([{},{origin:base},{origin:'maxtravel://'},{origin:'maxtravel://account'},{referer:`${base}/account`}] as Record<string,string>[])) {
     const res=await compiled.exports.POST(new Request(`${base}/api/auth/${endpoint}${suffix}`,{method:'POST',headers}));assert.equal(res.status,configured?200:503);
    }
   }
  }
  for(const [method,path] of [['POST','reset-password'],['GET','verify-email?token=synthetic'],['POST','sign-in/email'],['GET','callback/google'],['POST','prefix/request-password-reset']] as const){
   state.configured=true;const res=await compiled.exports[method](new Request(`${base}/api/auth/${path}`,{method,headers:{origin:'https://evil.test'}}));assert.equal(res.status,200);
  }
 } finally {if(old===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=old;delete (globals as Partial<typeof globals>).__originState;}
});
