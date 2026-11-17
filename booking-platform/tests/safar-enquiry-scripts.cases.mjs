import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import * as fs from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {parseEnv} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {configureSafarEnquiries,DEFAULT_SAFAR_URL,runConfigureSafarEnquiries,updateEnv} from '../scripts/configure-safar-enquiries.mjs';
import {checkSafarEnquiries,runCheckSafarEnquiries,SAFAR_SCHEMA_SQL,SAFAR_MIGRATION_SQL,SAFAR_QUEUE_SQL} from '../scripts/check-safar-enquiries.mjs';

const SECRET='private-existing-key-'.repeat(3),ID='existing_sender';
const noSecrets=value=>assert.doesNotMatch(typeof value==='string'?value:JSON.stringify(value),/private-|existing_sender|legacy\.invalid|synthetic\.invalid|postgresql:|https?:|Traveller|Customer|[a-f0-9]{64}/);
async function fixture(t,booking='CRM_EVENTS_URL=https://legacy.invalid/events\nCRM_SIGNING_KEY=private-legacy-key\nUNRELATED="keep # comments"\n',safar='SERVICE_ROLE_KEY=private-existing-admin\n'){
  const directory=await fs.mkdtemp(join(tmpdir(),'maxtravel-enquiry-config-'));
  t.after(async()=>{
    const root=resolve(tmpdir())+sep,target=resolve(directory);
    assert.ok(target.startsWith(root)&&target.slice(root.length).startsWith('maxtravel-enquiry-config-'));
    await fs.rm(target,{recursive:true,force:true});
  });
  const bookingEnvPath=join(directory,'booking.env'),safarEnvPath=join(directory,'safar.env');
  await fs.writeFile(bookingEnvPath,booking);await fs.writeFile(safarEnvPath,safar);
  return {directory,bookingEnvPath,safarEnvPath,booking,safar};
}
const contents=async f=>({booking:await fs.readFile(f.bookingEnvPath,'utf8'),safar:await fs.readFile(f.safarEnvPath,'utf8')});
const keyMap=map=>`SAFAR_MAX_AI_SIGNING_KEYS='${JSON.stringify(map).replaceAll("'",'\\u0027')}'\n`;
const bookingPair=(key=SECRET,mode='test')=>`SAFAR_ENQUIRY_URL='${DEFAULT_SAFAR_URL}'\nSAFAR_ENQUIRY_KEY_ID=${ID}\nSAFAR_ENQUIRY_SIGNING_KEY='${key}'\nSAFAR_ENQUIRY_MODE=${mode}\nCRM_EVENTS_URL=https://legacy.invalid/events\n`;

test('offline setup merges receiver keys, preserves unrelated dotenv contents, creates private backups and is idempotent',async t=>{
  const originalReceiverKey="private-other-key-$-apostrophe'-".repeat(2);
  const booking="# Existing configuration\r\nCRM_EVENTS_URL=https://legacy.invalid/events\r\nCRM_SIGNING_KEY=private-legacy-key\r\nUNRELATED_MULTILINE='alpha\r\nSAFAR_ENQUIRY_MODE=live\r\nomega'\r\n";
  const f=await fixture(t,booking,'SERVICE_ROLE_KEY=private-existing-admin\n'+keyMap({other:originalReceiverKey}));
  const result=await configureSafarEnquiries(f),after=await contents(f),b=parseEnv(after.booking),s=parseEnv(after.safar),keys=JSON.parse(s.SAFAR_MAX_AI_SIGNING_KEYS);
  assert.equal(result.mode,'test');assert.equal(result.changed,true);assert.equal(result.privateBackups,2);noSecrets(result);
  assert.equal(b.SAFAR_ENQUIRY_MODE,'test');assert.equal(b.SAFAR_ENQUIRY_URL,DEFAULT_SAFAR_URL);
  assert.match(b.SAFAR_ENQUIRY_SIGNING_KEY,/^[a-f0-9]{64}$/);assert.match(b.SAFAR_ENQUIRY_KEY_ID,/^maxtravel_[a-f0-9]{16}$/);
  assert.equal(keys[b.SAFAR_ENQUIRY_KEY_ID],b.SAFAR_ENQUIRY_SIGNING_KEY);assert.equal(keys.other,originalReceiverKey);
  assert.equal(s.SERVICE_ROLE_KEY,'private-existing-admin');assert.ok(after.booking.startsWith(booking));
  const old=parseEnv(booking);for(const name of Object.keys(old))assert.equal(b[name],old[name]);
  const names=await fs.readdir(f.directory),backups=names.filter(name=>name.includes('.max-ai-backup-'));
  assert.equal(backups.length,2);assert.equal(names.some(name=>name.includes('.max-ai-stage-')),false);
  assert.equal(await fs.readFile(join(f.directory,backups.find(name=>name.startsWith('booking.env'))),'utf8'),f.booking);
  assert.equal(await fs.readFile(join(f.directory,backups.find(name=>name.startsWith('safar.env'))),'utf8'),f.safar);
  if(process.platform!=='win32')for(const name of names)assert.equal((await fs.stat(join(f.directory,name))).mode&0o777,0o600);
  const again=await configureSafarEnquiries(f);assert.equal(again.changed,false);assert.equal(again.signingPairPreserved,true);
  assert.deepEqual(await contents(f),after);assert.deepEqual(await fs.readdir(f.directory),names);noSecrets(again);
});

test('existing matched signing pair and receiver map formatting remain unchanged; an absent receiver entry reuses the booking key',async t=>{
  const f=await fixture(t,bookingPair(),`SAFAR_MAX_AI_SIGNING_KEYS='{
  "${ID}": "${SECRET}",
  "other": "${'private-other-'.repeat(4)}"
}'\nSERVICE_ROLE_KEY=private-existing-admin\n`);
  const before=await contents(f),result=await configureSafarEnquiries(f);
  assert.equal(result.changed,false);assert.deepEqual(await contents(f),before);
  const partial=await fixture(t,bookingPair(),keyMap({other:'private-other-'.repeat(4)}));
  const completed=await configureSafarEnquiries(partial),after=await contents(partial);
  assert.equal(completed.signingPairPreserved,true);assert.equal(completed.filesChanged,1);
  assert.equal(after.booking,partial.booking);assert.equal(JSON.parse(parseEnv(after.safar).SAFAR_MAX_AI_SIGNING_KEYS)[ID],SECRET);
});

test('an existing prototype-like signing identifier stays an own receiver-map property',async t=>{
  const f=await fixture(t,bookingPair().replace(`SAFAR_ENQUIRY_KEY_ID=${ID}`,'SAFAR_ENQUIRY_KEY_ID=__proto__'));
  await configureSafarEnquiries(f);
  const keys=JSON.parse(parseEnv((await contents(f)).safar).SAFAR_MAX_AI_SIGNING_KEYS);
  assert.equal(Object.hasOwn(keys,'__proto__'),true);assert.equal(keys.__proto__,SECRET);
  assert.equal((await configureSafarEnquiries(f)).changed,false);
});

test('unsafe or conflicting setup is rejected before either environment changes',async t=>{
  const cases=[
    {booking:bookingPair(SECRET,'live')},
    {booking:bookingPair(SECRET,'invalid')},
    {booking:bookingPair().replace(DEFAULT_SAFAR_URL,'https://elsewhere.invalid/api/integrations/max-ai/enquiries')},
    {booking:bookingPair(),safar:keyMap({[ID]:'private-different-'.repeat(4)})},
    {booking:'SAFAR_ENQUIRY_KEY_ID=partial\n'},
    {safar:'SAFAR_MAX_AI_SIGNING_KEYS=invalid-private-json\n'},
    {booking:bookingPair()+'SAFAR_ENQUIRY_MODE=test\n',safar:keyMap({[ID]:SECRET})},
    {safar:keyMap(Object.fromEntries(Array.from({length:10},(_,i)=>[`sender_${i}`,SECRET])))},
  ];
  for(const item of cases){
    const f=await fixture(t,item.booking,item.safar),before=await contents(f);
    await assert.rejects(configureSafarEnquiries(f),error=>{noSecrets(error.message);return true;});
    assert.deepEqual(await contents(f),before);assert.deepEqual((await fs.readdir(f.directory)).sort(),['booking.env','safar.env']);
  }
  const f=await fixture(t),before=await contents(f);
  for(const options of [{...f,safarEnvPath:join(f.directory,'missing.env')},{...f,safarEnvPath:f.directory},{...f,safarEnvPath:f.bookingEnvPath},{...f,bookingEnvPath:'relative.env'},{...f,url:'http://external.invalid/api/integrations/max-ai/enquiries'},{...f,url:DEFAULT_SAFAR_URL+'?key=private-secret'}]){
    await assert.rejects(configureSafarEnquiries(options),error=>{noSecrets(error.message);return true;});
    assert.deepEqual(await contents(f),before);assert.deepEqual((await fs.readdir(f.directory)).sort(),['booking.env','safar.env']);
  }
});

test('failed second atomic replacement restores the first file and leaves private recovery backups',async t=>{
  const f=await fixture(t);let calls=0;
  await assert.rejects(configureSafarEnquiries(f,{rename:async(from,to)=>{calls++;if(calls===2)throw Error('private-file-error');await fs.rename(from,to);}}),error=>{
    assert.match(error.message,/Original environment contents were preserved/);noSecrets(error.message);return true;
  });
  assert.equal(calls,2);assert.deepEqual(await contents(f),{booking:f.booking,safar:f.safar});
  const names=await fs.readdir(f.directory);assert.equal(names.filter(name=>name.includes('max-ai-backup')).length,2);
  assert.equal(names.some(name=>/max-ai-(stage|rollback)/.test(name)),false);
});

test('CLI never prints secrets or raw parser/file errors and dotenv validation refuses unintended edits',async t=>{
  const f=await fixture(t),messages=[],output={log:(...args)=>messages.push(args),error:(...args)=>messages.push(args)};
  assert.equal(await runConfigureSafarEnquiries(['--booking-env',f.bookingEnvPath,'--safar-env',f.safarEnvPath],output),0);
  noSecrets(messages);
  assert.equal(await runConfigureSafarEnquiries(['--private-secret-argument'],output),1);noSecrets(messages);
  assert.throws(()=>updateEnv('X="unterminated\n',{SAFAR_ENQUIRY_MODE:'test'}),/unterminated/);
  assert.equal(parseEnv(updateEnv('UNRELATED="line1\\nline2"\n',{SAFAR_ENQUIRY_MODE:'test'})).UNRELATED,'line1\nline2');
});

const environment=()=>({DATABASE_URL:'postgresql://runtime:private-db@synthetic.invalid/booking',MIGRATION_DATABASE_URL:'postgresql://owner:private-owner@synthetic.invalid/booking',SAFAR_ENQUIRY_URL:DEFAULT_SAFAR_URL,SAFAR_ENQUIRY_SIGNING_KEY:SECRET,SAFAR_ENQUIRY_KEY_ID:ID,SAFAR_ENQUIRY_MODE:'test'});
const schema=()=>({runtime_role_expected:true,migrations_present:true,enquiries_present:true,outbox_present:true,migrations_readable:true,enquiries_readable:true,outbox_readable:true,receiver_present:true,environment_present:true});
const queue=()=>({legacy_pending:16,legacy_delivered:0,excluded_enquiries:0,test_pending:0,live_pending:0,safar_delivered:0,action_required:0});
const poolFactory=(queries=[],row=schema())=>options=>{
  assert.equal(options.options,'-c default_transaction_read_only=on');assert.equal(options.connectionString,environment().DATABASE_URL);
  assert.equal(options.max,1);for(const key of ['connectionTimeoutMillis','statement_timeout','query_timeout'])assert.equal(options[key],5000);
  return {query:async sql=>{queries.push(sql);return {rows:[sql===SAFAR_SCHEMA_SQL?row:sql===SAFAR_MIGRATION_SQL?{applied:true}:queue()]};},end:async()=>{}};
};

test('diagnostic uses only runtime read-only SQL and one signed empty object, never a valid enquiry',async()=>{
  const env=environment(),queries=[],calls=[],now=Date.parse('2030-01-01T10:00:00Z');
  const result=await checkSafarEnquiries({environment:env,now:()=>now,createPool:poolFactory(queries),fetch:async(url,options)=>{
    calls.push(options);assert.equal(url,DEFAULT_SAFAR_URL);assert.equal(options.method,'POST');assert.equal(options.body,'{}');
    assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);
    const h=new Headers(options.headers),id=h.get('X-MaxTravel-Event-Id'),timestamp=h.get('X-MaxTravel-Timestamp');
    assert.match(id,/^[a-f0-9-]{36}$/);assert.equal(timestamp,String(now/1000));assert.equal(h.get('X-MaxTravel-Key-Id'),ID);
    assert.equal(h.get('X-MaxTravel-Signature'),createHmac('sha256',SECRET).update(`${timestamp}.${id}.{}`).digest('hex'));
    return Response.json({error:'Check the enquiry details.'},{status:400});
  }});
  assert.equal(calls.length,1);assert.deepEqual(queries,[SAFAR_SCHEMA_SQL,SAFAR_MIGRATION_SQL,SAFAR_QUEUE_SQL]);
  assert.equal(result.ready,true);assert.equal(result.receiver.preIngestRejection,true);assert.equal(result.database.queue.legacyPending,16);
  assert.equal(result.diagnostic.validEnquirySubmitted,false);assert.equal(result.diagnostic.confirmsDelivery,false);noSecrets(result);
});

test('diagnostic rejects every non-exact acknowledgement, does not follow redirects and does not expose response bodies',async()=>{
  const responses=[()=>Response.json({accepted:true,private:'private-secret'},{status:200}),()=>Response.json({error:'private-key-failure'},{status:401}),
    ()=>Response.json({error:'Check the enquiry details.',extra:'private-contact'},{status:400}),()=>new Response('private-html',{status:400}),
    ()=>new Response(null,{status:307,headers:{Location:'https://private.invalid/key'}}),()=>Response.json({error:'x'.repeat(5000)},{status:400}),
    ()=>new Response('{private-invalid-json',{status:400,headers:{'Content-Type':'application/json'}})];
  for(const response of responses){
    let calls=0;const result=await checkSafarEnquiries({environment:environment(),createPool:poolFactory(),fetch:async()=>{calls++;return response();}});
    assert.equal(calls,1);assert.equal(result.ready,false);assert.notEqual(result.receiver.outcome,'authenticated_invalid_body_rejected');noSecrets(result);
  }
});

test('missing settings or schema never use owner credentials, read data tables blindly, or leak failures',async()=>{
  let requests=0;
  const missing=await checkSafarEnquiries({environment:{MIGRATION_DATABASE_URL:'private-owner'},createPool:()=>{throw Error('private-owner must not connect');},fetch:async()=>{requests++;throw Error('not configured');}});
  assert.equal(requests,0);assert.equal(missing.database.outcome,'configuration_missing');assert.equal(missing.ready,false);noSecrets(missing);
  const queries=[];const partial=await checkSafarEnquiries({environment:environment(),createPool:poolFactory(queries,{...schema(),environment_present:false}),fetch:async()=>Response.json({error:'Check the enquiry details.'},{status:400})});
  assert.deepEqual(queries,[SAFAR_SCHEMA_SQL,SAFAR_MIGRATION_SQL]);assert.equal(partial.ready,false);assert.equal(partial.database.outcome,'schema_not_ready');
  const owner=await checkSafarEnquiries({environment:environment(),createPool:poolFactory([],{...schema(),runtime_role_expected:false}),fetch:async()=>Response.json({error:'Check the enquiry details.'},{status:400})});
  assert.equal(owner.database.outcome,'ok');assert.equal(owner.database.runtimeRoleExpected,false);assert.equal(owner.ready,false);
  const messages=[],failed=await runCheckSafarEnquiries({environment:environment(),createPool:()=>{throw Error('private-database-url');},fetch:async()=>{throw Error('private-network-key');}},{log:value=>messages.push(value),error:value=>messages.push(value)});
  assert.equal(failed,1);noSecrets(messages);
});

test('diagnostic SQL executes in isolated PostgreSQL and reports legacy, test, live and excluded queues without changing rows',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec(`CREATE TABLE schema_migrations(name text PRIMARY KEY);INSERT INTO schema_migrations VALUES('025-safar-enquiry-destination');
      CREATE TABLE outbox_events(id uuid PRIMARY KEY,aggregate_id uuid,event_type text,delivered_at timestamptz,attempts integer DEFAULT 0);
      CREATE TABLE travel_enquiries(id uuid PRIMARY KEY,crm_event_id uuid,crm_receiver text,crm_environment text);`);
    const add=async(type,receiver=null,mode=null,delivered=false,attempts=0)=>{
      const event=randomUUID(),id=randomUUID();
      await db.query('INSERT INTO outbox_events VALUES($1,$2,$3,$4,$5)',[event,id,type,delivered?'2030-01-01T00:00:00Z':null,attempts]);
      if(type==='enquiry.created')await db.query('INSERT INTO travel_enquiries VALUES($1,$2,$3,$4)',[id,event,receiver,mode]);
    };
    await add('booking.confirmed');await add('payment.captured');await add('booking.failed',null,null,true);
    await add('enquiry.created');await add('enquiry.created','safar','test');await add('enquiry.created','safar','live');await add('enquiry.created','safar','test',true);await add('enquiry.created','safar','test',false,12);
    const before=(await db.query('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) AS rows FROM outbox_events o')).rows;
    await db.exec('CREATE ROLE maxtravel_app; GRANT SELECT ON ALL TABLES IN SCHEMA public TO maxtravel_app; SET ROLE maxtravel_app; SET default_transaction_read_only=on');
    const result=await checkSafarEnquiries({environment:environment(),createPool:()=>({query:(sql)=>db.query(sql),end:async()=>{}}),fetch:async()=>Response.json({error:'Check the enquiry details.'},{status:400})});
    assert.equal(result.ready,true);assert.equal(result.database.migrationApplied,true);
    assert.deepEqual(result.database.queue,{legacyPending:2,legacyDelivered:1,excludedEnquiries:1,safarTestPending:2,safarLivePending:1,safarDelivered:1,actionRequired:1});
    assert.deepEqual((await db.query('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) AS rows FROM outbox_events o')).rows,before);noSecrets(result);
  }finally{await db.close();}
});
