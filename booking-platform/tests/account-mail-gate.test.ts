import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real auth route with only the mail/auth infrastructure replaced.
// No database, credentials, account lookups or emails are used.
test('mail outage gates reset and verification before account lookup, uniformly for any email', async () => {
  const output = await build({entryPoints:['src/app/api/auth/[...all]/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,
    plugins:[{name:'auth-boundaries',setup(plugin){
      plugin.onResolve({filter:/^@\/lib\/(auth|mail|http)$/},args=>({path:args.path,namespace:'mock'}));
      plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents:args.path.endsWith('/auth')?'export function getAuth(){return {handler:async request=>Response.json({delegated:new URL(request.url).pathname})};}':args.path.endsWith('/mail')?'export function mailReady(){return false;}':'export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}} export function failure(e){return Response.json({error:e.message},{status:e.status||500});}'}));
    }}]});
  const compiled={exports:{} as {POST:(request:Request)=>Promise<Response>;GET:(request:Request)=>Promise<Response>}};
  new Function('module','exports',output.outputFiles[0].text)(compiled,compiled.exports);
  for(const endpoint of ['request-password-reset','send-verification-email','sign-up/email','request-password-reset/','send-verification-email/','sign-up/email/']){
    const results=[];
    for(const email of ['existing@example.test','missing@example.test']){
      const response=await compiled.exports.POST(new Request(`https://example.test/api/auth/${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})}));
      assert.equal(response.status,503);results.push(await response.json());
    }
    assert.deepEqual(results[0],results[1]);
    assert.doesNotMatch(JSON.stringify(results),/existing|missing|lookup/);
  }
  // SMTP is needed to initiate email delivery, not to consume an existing token.
  for(const [method,path] of [['POST','reset-password'],['GET','verify-email?token=synthetic-only'],['GET','reset-password/synthetic-only'],['POST','sign-in/email']] as const){
    const response=await compiled.exports[method](new Request(`https://example.test/api/auth/${path}`,{method}));
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.deepEqual(await response.json(),{delegated:`/api/auth/${path.split('?')[0]}`});
  }
});
