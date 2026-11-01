/** Seven real worker processes on an explicitly empty disposable database. No provider calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
const url=new URL(process.env.TEST_WORKER_DATABASE_URL||'');
assert(url.protocol==='postgresql:'&&url.hostname==='127.0.0.1'&&url.pathname==='/workers_disposable'&&!url.search&&!url.hash,'Explicit loopback workers_disposable database required');
assert(/^\d{2,5}$/.test(process.env.TEST_SMTP_PORT||''));
for(const f of['.env','.env.local','.env.production','.env.production.local'])assert(!fs.existsSync(f),'Run in a clean fixture checkout');
const workers={'booking-worker':'bookings','crm-worker':'crm','maintenance-worker':'maintenance','cancellation-worker':'cancellations','refund-worker':'refunds','payment-worker':'payments','notification-worker':'notifications'};
for(const name of Object.keys(workers))assert(fs.existsSync('dist/'+name+'.mjs'),'Build all workers first');
fs.mkdirSync(path.resolve('test-artifacts'),{recursive:true});const out=fs.mkdtempSync(path.resolve('test-artifacts','idle-workers-')),network=path.join(out,'network.txt'),preload=path.join(out,'no-network.mjs');fs.writeFileSync(network,'');fs.writeFileSync(preload,`import fs from 'node:fs';globalThis.fetch=async()=>{fs.appendFileSync(${JSON.stringify(network)},'blocked\\n');throw Error('Unexpected network call in idle worker test');};`);
const clean=Object.fromEntries(['PATH','Path','SystemRoot','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const env={...clean,DATABASE_URL:url.href,NODE_ENV:'production',BETTER_AUTH_URL:'http://127.0.0.1:3490',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),TRAVELLER_ENCRYPTION_KEY:randomBytes(32).toString('hex'),PAYMENT_PROVIDER:'PAYGLOCAL',SMTP_HOST:'127.0.0.1',SMTP_PORT:process.env.TEST_SMTP_PORT,SMTP_SECURE:'false',MAIL_FROM:'idle-workers@example.test',CRM_EVENTS_URL:'http://127.0.0.1:3491/api/integrations/booking-platform/events',CRM_SIGNING_KEY:randomBytes(32).toString('hex'),CRM_KEY_ID:'idle-fixture'};
const pool=new Pool({connectionString:url.href}),children=[],report={scope:'Seven actual compiled workers, empty disposable PostgreSQL, no payment keys and blocked provider HTTP',passed:false};
try{
 assert.equal(Number((await pool.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n),0,'Existing database is never reused');
 for(const args of[['scripts/migrate.mjs'],['--conditions=react-server','--import','./scripts/standalone-server.mjs','--import','tsx','scripts/migrate-auth.mts']]){const r=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);}
 for(const name of Object.keys(workers)){const child=spawn(process.execPath,['--conditions=react-server','--import','./scripts/standalone-server.mjs','--import',pathToFileURL(preload).href,'dist/'+name+'.mjs'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']}),item={name,child,logs:'',error:''};child.stdout.on('data',v=>item.logs+=v);child.stderr.on('data',v=>item.logs+=v);child.on('error',e=>item.error=e.message);children.push(item);}
 let healthy=false;const end=Date.now()+45000;
 while(Date.now()<end){for(const item of children)assert(!item.error&&item.child.exitCode===null&&item.child.signalCode===null,item.name+' exited: '+item.error+item.logs);const seen=(await pool.query("SELECT name FROM worker_heartbeats WHERE last_seen>now()-interval '90 seconds'")).rows.map(x=>x.name);if(Object.values(workers).every(n=>seen.includes(n))){healthy=true;break;}await new Promise(r=>setTimeout(r,250));}
 assert(healthy,'All seven workers must heartbeat');await new Promise(r=>setTimeout(r,5500));
 for(const item of children){assert.equal(item.child.exitCode,null,item.name+' exited');assert(!/deferred|error|failed/i.test(item.logs),item.name+': '+item.logs);fs.writeFileSync(path.join(out,item.name+'.log'),item.logs);}
 assert.equal(fs.readFileSync(network,'utf8'),'','Idle workers must make no provider HTTP request');
 assert.equal(Number((await pool.query('SELECT count(*) AS n FROM orders')).rows[0].n),0);report.passed=true;report.workers=Object.values(workers);console.log('PASS all seven actual workers heartbeat without errors, provider HTTP, orders or merchant payment credentials');
}finally{
 for(const {child}of children)if(child.exitCode===null&&child.signalCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([ended,new Promise(r=>setTimeout(r,2000))]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
 await pool.end();fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify(report,null,2));
}
