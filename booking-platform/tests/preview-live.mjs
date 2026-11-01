import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {chromium} from '@playwright/test';

assert(new URL(process.env.DATABASE_URL).pathname.endsWith('/maxtravel_booking_preview'),'An isolated preview database is required');
const local='http://127.0.0.1:3410',out=path.resolve('test-results/preview-live');fs.mkdirSync(out,{recursive:true});
const accessPath=path.resolve('.env.codex-preview-users.local');
const access=fs.existsSync(accessPath)?JSON.parse(fs.readFileSync(accessPath,'utf8')):{password:randomBytes(24).toString('hex')+'!7',users:{}};
const save=()=>fs.writeFileSync(accessPath,JSON.stringify(access,null,2));save();
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const browser=await chromium.launch({headless:true,...(process.env.PREVIEW_CHROME_PATH?{executablePath:process.env.PREVIEW_CHROME_PATH}:{})});
const report={origin:access.cloudBase??local,checks:[],screens:[],errors:[]};
function totp(secret){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret].map(c=>a.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const m=createHmac('sha1',key).update(counter).digest(),i=m[19]&15;return String((m.readUInt32BE(i)&0x7fffffff)%1000000).padStart(6,'0');}
async function api(c,base,url,data){const r=await c.request[ data?'post':'get'](base+url,{headers:{origin:base},...(data?{data}:{})}),b=await r.json();assert(r.ok(),`${url}: ${r.status()} ${b.message??b.error??''}`);return b;}
const permissions={admin:['bookings:read','bookings:reconcile','companies:manage','pricing:manage','cancellations:manage','cancellations:execute','integrations:manage','payments:manage','finance:read','refunds:manage','refunds:execute','audit:read'],staff:['bookings:read','bookings:reconcile','companies:manage','pricing:manage','cancellations:manage','cancellations:execute','integrations:manage','audit:read'],viewer:['bookings:read']};
async function signedIn(c,base,person){const d=await api(c,base,'/api/auth/sign-in/email',{email:person.email,password:access.password});if(d.twoFactorRedirect){const code=person.backupCodes?.shift();save();if(code)await api(c,base,'/api/auth/two-factor/verify-backup-code',{code});else await api(c,base,'/api/auth/two-factor/verify-totp',{code:totp(person.secret)});}}
try{
 for(const[role,grants]of Object.entries(permissions)){
  const person=access.users[role]??={email:`ux-preview-${role}@example.test`};save();const c=await browser.newContext();
  let u=(await pool.query('SELECT id,"emailVerified","twoFactorEnabled" FROM "user" WHERE email=$1',[person.email])).rows[0];
  if(!u){const signup=await api(c,local,'/api/auth/sign-up/email',{email:person.email,password:access.password,name:`Preview ${role}`,callbackURL:'/account'});person.userId=signup.user.id;save();}
  u=(await pool.query('SELECT id,"emailVerified","twoFactorEnabled" FROM "user" WHERE email=$1',[person.email])).rows[0];
  if(!u.emailVerified){let mail;const until=Date.now()+35000;do{const list=await(await fetch('http://127.0.0.1:18025/api/v1/messages')).json(),m=list.messages.find(m=>m.Subject==='Verify your Max Travel email'&&m.To.some(t=>t.Address===person.email));if(m){mail=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+m.ID)).json();break;}await new Promise(r=>setTimeout(r,250));}while(Date.now()<until);assert(mail,'Local verification email was not delivered');const url=mail.Text.match(/https?:\/\/[^\s]+/)?.[0];assert.equal(new URL(url).origin,local);await c.request.get(url);}
  if(!u.twoFactorEnabled){await signedIn(c,local,person);const enrol=await api(c,local,'/api/auth/two-factor/enable',{password:access.password});person.secret=new URL(enrol.totpURI).searchParams.get('secret');person.backupCodes=enrol.backupCodes;save();await api(c,local,'/api/auth/two-factor/verify-totp',{code:totp(person.secret)});}
  const verified=(await pool.query('SELECT id,"emailVerified","twoFactorEnabled" FROM "user" WHERE email=$1',[person.email])).rows[0];assert(verified.emailVerified&&verified.twoFactorEnabled);
  await pool.query('INSERT INTO admin_grants(user_id,permissions,active) VALUES($1,$2,true) ON CONFLICT(user_id) DO UPDATE SET permissions=excluded.permissions,active=true',[verified.id,grants]);person.userId=verified.id;save();await c.close();
 }
 report.checks.push('Synthetic staff accounts are email-verified and authenticator-protected before scoped grants');
 const base=access.cloudBase??local;
 for(const role of Object.keys(permissions)){
  const c=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),p=await c.newPage();if(access.shareableUrl)await p.goto(access.shareableUrl);await signedIn(c,base,access.users[role]);const context=await api(c,base,'/api/admin/context');assert.deepEqual([...context.permissions].sort(),[...permissions[role]].sort());
  if(role!=='admin'){const denied=await c.request.get(base+'/api/admin/payments',{headers:{origin:base}});assert.equal(denied.status(),403);const settlement=await c.request.post(base+'/api/admin/refunds/00000000-0000-4000-8000-000000000001/settlement',{headers:{origin:base},data:{}});assert.equal(settlement.status(),403);}
  const pricing={id:'00000000-0000-4000-8000-00000000c0de',companyId:null,product:'FLIGHT',markupMinor:0,basisPoints:0,serviceFeeMinor:0};
  if(role==='admin'){
   const saved=await api(c,base,'/api/admin/pricing',pricing),replayed=await api(c,base,'/api/admin/pricing',pricing);assert.equal(saved.id,pricing.id);assert.equal(replayed.id,saved.id);assert.equal((await pool.query('SELECT count(*)::int AS count FROM pricing_rules WHERE id=$1',[saved.id])).rows[0].count,1);
   const foreign=await c.request.post(base+'/api/admin/pricing',{headers:{origin:'https://untrusted.example.test'},data:pricing});assert.equal(foreign.status(),403);report.checks.push('Real preview admin write and exact replay succeed; foreign-origin write is denied');
  }else if(role==='viewer'){const denied=await c.request.post(base+'/api/admin/pricing',{headers:{origin:base},data:pricing});assert.equal(denied.status(),403);}
  p.on('pageerror',e=>report.errors.push(e.message));
  const desks=role==='admin'?['bookings','companies','pricing','payments','refunds','sync','audit']:role==='staff'?['bookings','companies','pricing','sync']:['bookings'];
  for(const width of[1440,390]){await p.setViewportSize({width,height:width===390?844:1000});for(const desk of desks){const r=await p.goto(base+'/operations?desk='+desk,{waitUntil:'networkidle'});assert.equal(r.status(),200);await p.getByRole('heading',{level:1}).waitFor();assert(!(await p.getByText('Unable to load operations access',{exact:true}).count()));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role} ${desk}: overflow ${width}`);const name=`${role}-${width}-${desk}.png`;await p.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});report.screens.push({role,width,desk,file:name});}}
  if(role==='admin'){for(const route of['/','/book?product=FLIGHT','/book?product=HOTEL','/flights','/hotels','/account']){await p.goto(base+route,{waitUntil:'networkidle'});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Customer route: ${route}`);const name='customer-'+report.screens.length+'.png';await p.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});report.screens.push({role:'customer',width:390,route,file:name});}}
  await c.close();
 }
 const guest=await browser.newContext(),publicPage=await guest.newPage();if(access.shareableUrl)await publicPage.goto(access.shareableUrl);const catalogue=await guest.request.get(base+'/api/travel/destinations?q=Goa',{headers:{origin:base}});assert.equal(catalogue.status(),200);assert(Array.isArray((await catalogue.json()).destinations));await guest.close();report.checks.push('Anonymous catalogue requests accept the deployment origin without an explicit URL override');
 assert.deepEqual(report.errors,[]);report.passed=true;report.checks.push('Protected cloud admin, operations staff and viewer registers use real PostgreSQL and deny unauthorized finance reads');report.checks.push('Customer and staff screens fit desktop and phone without browser runtime errors');console.log(JSON.stringify({passed:true,checks:report.checks,screens:report.screens.length}));
}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await pool.end();await browser.close();}
