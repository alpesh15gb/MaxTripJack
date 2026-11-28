/** Isolated PostgreSQL with a synthetic sender. No supplier or SMTP calls. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {hashPassword} from 'better-auth/crypto';
import {getMigrations} from 'better-auth/db/migration';
import {Pool} from 'pg';
import {bookingMigrations} from '../scripts/booking-migrations.mjs';
import {dispatchObservedPriceAlert,flightPriceAlertSchema,listFlightPriceAlerts,removeFlightPriceAlert,
  reservePriceAlertSearch,subscribeFlightPriceAlert} from '../src/lib/flight-price-alerts';
import {addDays} from '../src/lib/fare-calendar-core';

const url = new URL(process.env.TEST_PRICE_ALERT_DATABASE_URL||'');
assert.equal(url.protocol,'postgresql:');
assert.equal(url.hostname,'127.0.0.1');
assert.equal(url.username,'price_alert_fixture');
assert.equal(url.pathname,'/postgres');
assert(!url.search&&!url.hash);
const schema = `flight_alert_test_${randomUUID().replaceAll('-','')}`;
const admin = new Pool({connectionString:url.href});
const pool = new Pool({connectionString:url.href,options:`-c search_path=${schema},public`});
const globals = globalThis as typeof globalThis & {travelPool?:Pool};
const prior = globals.travelPool;
const base = 'http://127.0.0.1:3218';
const environment = {
  DATABASE_URL:url.href,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),
  SMTP_HOST:'127.0.0.1',MAIL_FROM:'price-alert-fixture@example.test',FLIGHT_PRICE_ALERTS_ENABLED:'false',
  TRIPJACK_PRICE_ALERT_SEARCH_URL:'https://fixture-air.tripjack.com/fms/v1/air-search-all',
  TRIPJACK_PRICE_ALERT_API_KEY:'synthetic-alert-only',
};
const previousEnvironment = Object.fromEntries(Object.keys(environment).map(key=>[key,process.env[key]]));
const previousFetch = globalThis.fetch;
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const route = flightPriceAlertSchema.parse({from:'BOM',to:'DEL',date:addDays(today,15),cabin:'ECONOMY'});
const sent:string[] = [];
const send = async (item:{email:string}) => {sent.push(item.email);};
async function observed(environment:'uat'|'production',minor:number,date=route.date) {
  await pool.query(`INSERT INTO flight_fare_calendar_verified(origin_code,destination_code,departure_date,cabin,lowest_adult_minor,provider_environment,observed_at)
    VALUES('BOM','DEL',$1,'ECONOMY',$2,$3,clock_timestamp())
    ON CONFLICT(origin_code,destination_code,departure_date,cabin,provider_environment)
    DO UPDATE SET lowest_adult_minor=EXCLUDED.lowest_adult_minor,observed_at=EXCLUDED.observed_at`,[date,minor,environment]);
}

try {
  Object.assign(process.env,environment);
  globals.travelPool=pool;
  globalThis.fetch=async()=>{throw Error('Unexpected outbound fixture request');};
  await admin.query(`CREATE SCHEMA ${schema}`);
  for (const name of bookingMigrations) await pool.query(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
  const {getAuth} = await import('../src/lib/auth');
  const auth = getAuth();
  await (await getMigrations(auth.options)).runMigrations();
  const context = await auth.$context;
  async function createUser(email:string,emailVerified=true) {
    return context.internalAdapter.createUser({email,emailVerified,name:'Flight alert fixture'},{method:'email-password'});
  }
  const first = await createUser('one@example.test');
  const second = await createUser('two@example.test');
  const unverified = await createUser('unverified@example.test',false);
  const alias = await createUser('1@phone.maxtravel.invalid');
  await assert.rejects(()=>subscribeFlightPriceAlert(unverified.id,route),{status:403});
  await assert.rejects(()=>subscribeFlightPriceAlert(alias.id,route),{status:403});
  await assert.rejects(()=>subscribeFlightPriceAlert(first.id,{...route,date:today}),{status:400});
  await observed('uat',200);
  const [one,retried,two] = await Promise.all([
    subscribeFlightPriceAlert(first.id,route),subscribeFlightPriceAlert(first.id,route),subscribeFlightPriceAlert(second.id,route),
  ]);
  assert.equal(one.id,retried.id);
  assert.equal(one.baselineMinor,null);
  assert.equal(one.status,'waiting');
  await removeFlightPriceAlert(second.id,one.id);
  assert.deepEqual((await listFlightPriceAlerts(first.id)).map(a=>a.id),[one.id]);
  assert.deepEqual((await listFlightPriceAlerts(second.id)).map(a=>a.id),[two.id]);
  const reservations = await Promise.all([reservePriceAlertSearch(),reservePriceAlertSearch(),reservePriceAlertSearch()]);
  assert.equal(reservations.filter(Boolean).length,1);
  assert.equal(reservations.find(Boolean)?.from,route.from);
  assert.equal(await reservePriceAlertSearch(),undefined);

  await observed('production',180000);
  await dispatchObservedPriceAlert(send);
  assert.equal((await listFlightPriceAlerts(first.id))[0]?.baselineMinor,180000);
  assert.deepEqual(sent,[]);
  await pool.query(`UPDATE "user" SET email='new@example.test' WHERE id=$1`,[second.id]);
  await observed('uat',100);
  await dispatchObservedPriceAlert(send);
  assert.deepEqual(sent,[]);
  await observed('production',150000);
  await Promise.all([dispatchObservedPriceAlert(send),dispatchObservedPriceAlert(send)]);
  await dispatchObservedPriceAlert(send);
  assert.deepEqual(sent,['one@example.test']);
  assert.equal((await listFlightPriceAlerts(first.id))[0]?.status,'notified');
  assert.deepEqual(await listFlightPriceAlerts(second.id),[]);
  const newlyConsented = await subscribeFlightPriceAlert(second.id,route);
  assert.equal(newlyConsented.baselineMinor,150000);
  assert.notEqual(newlyConsented.id,two.id);
  await observed('production',140000);
  await assert.rejects(()=>dispatchObservedPriceAlert(async()=>{throw Error('Synthetic SMTP acknowledgement loss');}));
  await dispatchObservedPriceAlert(send);
  assert.equal((await listFlightPriceAlerts(second.id))[0]?.status,'delivery_unknown');
  assert.deepEqual(sent,['one@example.test']);
  await removeFlightPriceAlert(second.id,newlyConsented.id);
  assert.deepEqual(await listFlightPriceAlerts(second.id),[]);
  const password = randomBytes(24).toString('hex');
  await context.internalAdapter.createAccount({userId:first.id,accountId:first.id,providerId:'credential',password:await hashPassword(password)});
  const login = await auth.api.signInEmail({body:{email:first.email,password},headers:new Headers({origin:base}),asResponse:true});
  assert.equal(login.status,200);
  const cookie = login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const {GET,POST} = await import('../src/app/api/travel/price-alerts/route');
  const {DELETE} = await import('../src/app/api/travel/price-alerts/[id]/route');
  const endpoint = base+'/api/travel/price-alerts';
  const post = (origin=base,cookieValue=cookie)=>POST(new Request(endpoint,{method:'POST',
    headers:{origin,cookie:cookieValue,'content-type':'application/json'},body:JSON.stringify({...route,date:addDays(today,16)})}));
  assert.deepEqual(await (await GET(new Request(endpoint))).json(),{available:false,alerts:[]});
  assert.equal((await post(base,'')).status,401);
  assert.equal((await post('https://example.test')).status,403);
  assert.equal((await post()).status,503);
  process.env.FLIGHT_PRICE_ALERTS_ENABLED='true';
  assert.equal((await post()).status,503);
  await pool.query("INSERT INTO worker_heartbeats(name) VALUES ('notifications')");
  assert.equal((await post()).status,503,'A generic notifications heartbeat never activates price alerts');
  await pool.query("INSERT INTO worker_heartbeats(name) VALUES ('flight-price-alerts')");
  assert.deepEqual(await (await GET(new Request(endpoint))).json(),{available:true,alerts:[]});
  const saved = await post();
  assert.equal(saved.status,200);
  const {alert:savedAlert} = await saved.json();
  assert.equal(savedAlert.status,'waiting');
  const authenticated = await GET(new Request(endpoint,{headers:{cookie}}));
  assert.deepEqual((await authenticated.json()).alerts.map((alert:{id:string})=>alert.id).sort(),[one.id,savedAlert.id].sort());
  assert.equal((await DELETE(new Request(endpoint+'/'+savedAlert.id,{method:'DELETE',headers:{origin:base,cookie}}),
    {params:Promise.resolve({id:savedAlert.id})})).status,200);
  assert.deepEqual((await listFlightPriceAlerts(first.id)).map(alert=>alert.id),[one.id]);
  console.log('PASS price-alert migrations, verified ownership, UAT exclusion, route deduplication, baseline and single delivery');
} finally {
  globals.travelPool=prior;
  globalThis.fetch=previousFetch;
  for (const [key,value] of Object.entries(previousEnvironment)) {
    if (value===undefined) delete process.env[key];
    else process.env[key]=value;
  }
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
