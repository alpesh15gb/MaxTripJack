/** CI-only real Next/PostgreSQL/SMTP boundary. No mocks, browsers or external mail. */
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { once } from "node:events";

if(process.env.CI!=="true") throw Error("This disposable integration fixture runs only in CI.");
const databaseURL=new URL(process.env.DATABASE_URL||"");
assert.ok(["localhost","127.0.0.1"].includes(databaseURL.hostname));
assert.equal(databaseURL.pathname,"/maxtravel_ci","Use only the disposable CI database");
const pool=new Pool({connectionString:databaseURL.toString(),connectionTimeoutMillis:5000,statement_timeout:10000});
const sockets=new Set<Socket>();let mode="success",accepted=0,closed=0;
const messages:string[]=[];const marker="synthetic-smtp-rejection-private-detail";
const smtp=createServer(socket=>{
 sockets.add(socket);socket.on("close",()=>{sockets.delete(socket);closed++;});socket.on("error",()=>{});
 socket.write("220 fixture ESMTP\r\n");let buffer="",data=false,body="";
 socket.on("data",chunk=>{
  buffer+=chunk.toString();let index;
  while((index=buffer.indexOf("\r\n"))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
   if(data){if(line!=="."){body+=line+"\r\n";continue;}data=false;messages.push(body);
    if(mode==="success"){accepted++;socket.write("250 accepted\r\n");}
    else if(mode==="reject")socket.write(`550 ${marker}\r\n`);
    // hold: omit DATA acknowledgement; production Nodemailer must time out/close.
   } else if(/^EHLO|^HELO/.test(line))socket.write("250 fixture\r\n");
   else if(/^DATA/.test(line)){data=true;body="";socket.write("354 send data\r\n");}
   else if(/^QUIT/.test(line))socket.end("221 bye\r\n");
   else socket.write("250 OK\r\n");
  }
 });
});
let next:ChildProcess|undefined;let logs="";const ids:string[]=[];const emails:string[]=[];
async function until(check:()=>boolean,timeout=35000){const deadline=Date.now()+timeout;while(!check()){if(Date.now()>deadline)throw Error("Fixture condition deadline exceeded");await new Promise(r=>setTimeout(r,50));}}
try {
 smtp.listen(0,"127.0.0.1");await once(smtp,"listening");const smtpAddress=smtp.address();assert.ok(smtpAddress&&typeof smtpAddress!=="string");
 const portProbe=createServer();portProbe.listen(0,"127.0.0.1");await once(portProbe,"listening");const address=portProbe.address();assert.ok(address&&typeof address!=="string");await new Promise<void>(resolve=>portProbe.close(()=>resolve()));
 const base=`http://127.0.0.1:${address.port}`;
 next=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(address.port)],{env:{...process.env,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),SMTP_HOST:"127.0.0.1",SMTP_PORT:String(smtpAddress.port),SMTP_SECURE:"false",SMTP_USER:"",SMTP_PASSWORD:"",MAIL_FROM:"fixture@example.test"},stdio:["ignore","pipe","pipe"]});
 next.stdout!.on("data",chunk=>{logs+=chunk;});next.stderr!.on("data",chunk=>{logs+=chunk;});
 await until(()=>logs.includes("Ready"));
 async function call(endpoint:string,body:object,origin=base){const response=await fetch(`${base}/api/auth/${endpoint}`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});return {status:response.status,body:await response.json()};}
 const password=randomBytes(24).toString("hex"),known=`lifecycle-known-${randomUUID()}@example.test`;emails.push(known);
 const signupBody={name:"Synthetic Lifecycle",password};
 const initial=await call("sign-up/email",{...signupBody,email:known});assert.equal(initial.status,200);ids.push(initial.body.user.id);
 await until(()=>accepted===1&&sockets.size===0);
 for(const endpoint of ["request-password-reset","send-verification-email","sign-up/email"]){
  for(const email of [known,`lifecycle-untrusted-${randomUUID()}@example.test`]){
   assert.equal((await call(endpoint,{...signupBody,email},"https://untrusted.example.test")).status,403);
  }
 }
 // Preserve real DB-backed per-IP limits; independent scenarios wait their full window.
 await new Promise(r=>setTimeout(r,61_000));
 for(const scenario of ["success","reject","hold"]){
  mode=scenario;const before=messages.length,priorClosed=closed,priorAccepted=accepted;
  for(const endpoint of ["request-password-reset","send-verification-email","sign-up/email"]){
   const unknown=`lifecycle-${randomUUID()}@example.test`;emails.push(unknown);
   const existing=await call(endpoint,{...signupBody,email:known});
   const missing=await call(endpoint,{...signupBody,email:unknown});
   assert.equal(existing.status,200);assert.equal(missing.status,200);
   if(endpoint==="sign-up/email"){
    ids.push(missing.body.user.id);
    // Real PostgreSQL must match synthetic duplicate response structure, including nullable fields.
    const normalize=(value:typeof existing.body)=>({...value,user:{...value.user,id:"opaque",email:"submitted",createdAt:"time",updatedAt:"time"}});
    assert.deepEqual(normalize(existing.body),normalize(missing.body));
   } else assert.deepEqual(existing.body,missing.body);
  }
  await until(()=>messages.length===before+3);
  if(scenario==="hold"){
   assert.equal(closed,priorClosed,"HTTP responses must arrive while SMTP DATA acknowledgements are still held");
   assert.equal(sockets.size,3);
  }
  await until(()=>sockets.size===0);
  assert.equal(accepted,priorAccepted+(scenario==="success"?3:0));
  if(scenario!=="success")await until(()=>(logs.match(/delivery-unconfirmed/g)||[]).length>=(scenario==="reject"?3:6));
  assert.ok(!logs.includes(marker),"transport error details must not enter logs");
  for(const email of emails)assert.ok(!logs.includes(email),"synthetic recipient must not enter logs");
  assert.ok(!logs.includes(password),"password must not enter logs");
  for(const message of messages){
   const decoded=message.replace(/=\r\n/g,"").replace(/=([0-9a-f]{2})/gi,(_,hex:string)=>String.fromCharCode(parseInt(hex,16)));
   for(const url of decoded.match(/https?:\/\/[^\s<>]+/g)||[]){
    assert.ok(!logs.includes(url),"account URL must not enter logs");
    const parsed=new URL(url),token=parsed.searchParams.get("token")||(parsed.pathname.includes("/reset-password/")?parsed.pathname.split("/").at(-1):null);
    if(token)assert.ok(!logs.includes(token),"verification/reset token must not enter logs");
   }
  }
  if(scenario!=="hold")await new Promise(r=>setTimeout(r,61_000));
 }
 console.log("PASS: real Next after lifecycle, PostgreSQL known/unknown response shapes, SMTP accept/reject/held timeout, origin guard, sanitized outcomes.");
} finally {
 for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>smtp.close(()=>resolve()));
 if(next&&next.exitCode===null){next.kill("SIGTERM");const timer=setTimeout(()=>next?.kill("SIGKILL"),5000);await once(next,"exit");clearTimeout(timer);}
 // Delete only this run's synthetic rows. No global rate-limit/schema cleanup.
 if(ids.length)await pool.query('DELETE FROM verification WHERE value=ANY($1::text[])',[ids]);
 if(emails.length)await pool.query('DELETE FROM "user" WHERE email=ANY($1::text[])',[emails]);
 await pool.end();
}
