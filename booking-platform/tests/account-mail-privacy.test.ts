import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { memoryAdapter } from "better-auth/adapters/memory";

test("real auth routes: SMTP success/failure/timeout cannot change initiation; existing tokens work", async () => {
  const queue: (() => Promise<void>)[] = [], mail: {to:string;url:string}[] = [];
  const database = memoryAdapter({user:[],account:[],session:[],verification:[],rateLimit:[],twoFactor:[]});
  let delivery = "success", configured = true, release: (()=>void) | undefined;
  const globals = globalThis as typeof globalThis & { __privacy?: unknown };
  globals.__privacy = { database, after: (task:()=>Promise<void>)=>queue.push(task), ready:()=>configured,
    send:async(to:string,_subject:string,url:string)=>{mail.push({to,url});if(delivery==="failure")throw Error("sensitive SMTP rejection");if(delivery==="timeout"){await new Promise<void>(resolve=>{release=resolve;});throw Error("sensitive SMTP timeout");}} };
  const output = await build({entryPoints:["src/app/api/auth/[...all]/route.ts"],bundle:true,packages:"external",platform:"node",format:"cjs",write:false,
    plugins:[{name:"synthetic-boundaries",setup(plugin){
      plugin.onResolve({filter:/^(server-only|next\/server|better-auth\/next-js|\.\/db|\.\/mail|@\/lib\/mail)$/},args=>({path:args.path,namespace:"fixture"}));
      plugin.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"js",contents:args.path==="server-only"?"":args.path==="next/server"?"export const after=globalThis.__privacy.after;":args.path==="better-auth/next-js"?'export const nextCookies=()=>({id:"test-cookie-context"});':args.path==="./db"?"export const database=()=>globalThis.__privacy.database;":"export const sendAccountMail=globalThis.__privacy.send;export const mailReady=globalThis.__privacy.ready;"}));
    }}]});
  const env={...process.env}, info=console.info, error=console.error;
  const logs: unknown[][]=[];console.info=(...args)=>{logs.push(args);};console.error=(...args)=>{logs.push(args);};
  try {
    process.env.BETTER_AUTH_SECRET="synthetic-test-secret-not-real-credential-123456";process.env.BETTER_AUTH_URL="https://example.test";
    const compiled={exports:{} as {POST:(r:Request)=>Promise<Response>;GET:(r:Request)=>Promise<Response>}};
    new Function("module","exports","require",output.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
    let ip=0;
    const call=(path:string,body?:object,cookie="")=>compiled.exports[body?"POST":"GET"](new Request(`https://example.test/api/auth/${path}`,{method:body?"POST":"GET",headers:{...(cookie?{cookie}:{}),origin:"https://example.test","content-type":"application/json","x-forwarded-for":`192.0.2.${++ip}`},...(body?{body:JSON.stringify(body)}:{})}));
    const signupBody={name:"Synthetic",password:"Synthetic-password-123!"};
    assert.equal((await call("sign-up/email",{...signupBody,email:"known@example.test"})).status,200);
    assert.equal(mail.length,0);assert.equal(queue.length,1);await queue.shift()!();
    const verificationURL=mail[0].url;
    for(const state of ["success","failure","timeout"]){
      delivery=state;
      for(const endpoint of ["request-password-reset","send-verification-email","sign-up/email"]){
        const responses: unknown[]=[];
        for(const email of ["known@example.test",`unknown-${state}-${endpoint.replaceAll("/","-")}@example.test`]){
          const before: number=mail.length;
          const response=await call(endpoint,{...signupBody,email});
          assert.equal(response.status,200,`${state} ${endpoint}: ${await response.clone().text()}`);
          const body=await response.json();
          responses.push(endpoint==="sign-up/email"?{...body,user:{...body.user,image:body.user.image??null,id:"opaque",email:"submitted",createdAt:"time",updatedAt:"time"}}:body);
          assert.equal(mail.length,before,"SMTP cannot start before response");
        }
        assert.deepEqual(responses[0],responses[1]);
        while(queue.length){const pending=queue.shift()!();if(state==="timeout"){await Promise.resolve();assert.ok(release);release();release=undefined;}await pending;}
      }
    }
    const accountLogs=logs.filter(args=>args[0]==="Account mail");
    assert.ok(accountLogs.some(args=>JSON.stringify(args).includes("delivery-unconfirmed")));
    assert.doesNotMatch(JSON.stringify(accountLogs),/@|https:|token|secret|sensitive/);
    delivery="success";
    await call("request-password-reset",{email:"known@example.test"});await queue.shift()!();
    const token=new URL(mail.at(-1)!.url).pathname.split("/").at(-1)!;
    configured=false;
    assert.equal((await call("request-password-reset",{email:"known@example.test"})).status,503);
    assert.equal((await call("request-password-reset",{email:"missing@example.test"})).status,503);
    assert.equal((await call(`verify-email${new URL(verificationURL).search}`)).status,302);
    const reset=await call("reset-password",{token,newPassword:"Replacement-password-123!"});
    assert.equal(reset.status,200);assert.deepEqual(await reset.json(),{status:true});
    assert.equal((await call("reset-password",{token,newPassword:"Another-password-123!"})).status,400);
    const signin=await call("sign-in/email",{email:"known@example.test",password:"Replacement-password-123!"});
    assert.equal(signin.status,200);
    configured=true;
    const queued=queue.length;
    assert.equal((await call("send-verification-email",{email:"known@example.test"})).status,200,"verified anonymous account remains generic");
    const cookie=signin.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");assert.ok(cookie);
    assert.equal((await call("send-verification-email",{email:"known@example.test"},cookie)).status,400,"authenticated verified account keeps explicit rejection");
    assert.equal(queue.length,queued,"verified accounts must not schedule verification mail");
  } finally {process.env=env;console.info=info;console.error=error;delete globals.__privacy;}
});
