/** Actual route handlers + Better Auth sessions + disposable PostgreSQL.
 * Only provider HTTP transport is mocked; all unexpected outbound fetches fail.
 * TEST_DATABASE_URL must be a loopback database named payglocal_disposable.
 * node --conditions=react-server --import ./scripts/standalone-server.mjs --import tsx tests/guest-shopping-routes.mts
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {getMigrations} from 'better-auth/db/migration';
import {hashPassword} from 'better-auth/crypto';
const input=process.env.TEST_DATABASE_URL;
if(!input)throw Error('Explicit disposable TEST_DATABASE_URL required.');
const url=new URL(input);
if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/payglocal_disposable'||url.search||url.hash)throw Error('Only loopback payglocal_disposable without URL options is permitted.');
const schema=`shopping_routes_${randomUUID().replaceAll('-','')}`;
const admin=new Pool({connectionString:input});
const pool=new Pool({connectionString:input,options:`-c search_path=${schema},public`,statement_timeout:10000});
const base='http://127.0.0.1:3218';
process.env.DATABASE_URL=input;process.env.BETTER_AUTH_URL=base;process.env.BETTER_AUTH_SECRET=randomBytes(32).toString('hex');
process.env.TRIPJACK_FLIGHT_API_KEY='isolated-fixture-only';process.env.TRIPJACK_HOTEL_API_KEY='isolated-fixture-only';
process.env.PUBLIC_SHOPPING_TRUST_PROXY='false';
(globalThis as typeof globalThis & {travelPool?:Pool}).travelPool=pool;
const previousFetch=globalThis.fetch;
let providerCalls=0,created=false,contentCalls=0;
let releaseContent!:()=>void,contentStarted!:()=>void;
const contentGate=new Promise<void>(resolve=>{releaseContent=resolve;});
const contentStarting=new Promise<void>(resolve=>{contentStarted=resolve;});
const option={optionId:'fixture-room',pricing:{totalPrice:5000,currency:'INR'}};
globalThis.fetch=async(input,init)=>{
 const target=String(input);providerCalls++;
 if(target==='https://apitest.tripjack.com/fms/v1/air-search-all')return Response.json({status:{success:true},searchResult:{tripInfos:{ONWARD:[{sI:[{da:{code:'NMI'},aa:{code:'DEL'},dt:future(30)+'T10:00'}],totalPriceList:[{id:'alternate-airport',fd:{ADULT:{fC:{TF:1}}}}]},{sI:[{da:{code:'BOM'},aa:{code:'DEL'},dt:future(30)+'T10:00'}],totalPriceList:[{id:'public-fare',fareIdentifier:'PUBLISHED',fd:{ADULT:{fC:{TF:5000},bI:{iB:'15 Kg'},rT:1}}}]}]}}});
 if(target==='https://apitest-hms.tripjack.com/hms/v3/hotel/listing')return Response.json({status:{success:true},hotels:[{hotelId:100001,name:'Fixture Hotel',options:[option]},{hotelId:100002,name:'Unrequested Hotel',options:[option]}]});
 if(target==='https://apitest-hms.tripjack.com/hms/v3/content/fetch-hotel-content'){contentCalls++;assert.deepEqual(JSON.parse(String(init?.body)).hotelIds,['100001']);contentStarted();await contentGate;return Response.json({status:{success:true},hotels:[{tjHotelId:'100001',star_rating:'4',amenities:{'0':{name:'Pool'}}},{tjHotelId:'100002',star_rating:'5'}]});}
 if(target==='https://apitest-hms.tripjack.com/hms/v3/hotel/pricing')return Response.json({status:{success:true},options:[option],reviewHash:'fixture-only'});
 throw Error('Unexpected outbound request blocked');
};
const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const flight={product:'FLIGHT',from:'BOM',to:'DEL',date:future(30),adults:1,children:0,infants:0,cabin:'ECONOMY'};
const hotel={product:'HOTEL',hotelIds:['100001'],checkIn:future(30),checkOut:future(31),adults:1,nationality:'106'};
function request(data:unknown,cookie='',headers:Record<string,string>={}){return new Request(base+'/api/travel/search',{method:'POST',headers:{origin:base,'content-type':'application/json',cookie,...headers},body:JSON.stringify(data)});}
try{
 await admin.query(`CREATE SCHEMA ${schema}`);created=true;
 for(const name of (await readdir(new URL('../db/',import.meta.url))).filter(name=>/^\d{3}-.*\.sql$/.test(name)).sort())await pool.query(await readFile(new URL(`../db/${name}`,import.meta.url),'utf8'));
 const {getAuth}=await import('../src/lib/auth');const auth=getAuth();await(await getMigrations(auth.options)).runMigrations();
 const {POST:search}=await import('../src/app/api/travel/search/route');
 const {POST:detail}=await import('../src/app/api/travel/hotel-detail/route');
 const {POST:content}=await import('../src/app/api/travel/hotel-content/route');
 const company=randomUUID();await pool.query("INSERT INTO companies(id,name,status) VALUES($1,'Isolated fixture','APPROVED')",[company]);
 await pool.query("INSERT INTO pricing_rules(id,company_id,product,markup_minor) VALUES($1,NULL,'FLIGHT',1000),($2,$3,'FLIGHT',99999)",[randomUUID(),randomUUID(),company]);
 const response=await search(request(flight));assert.equal(response.status,200);const result=await response.json();
 assert.match(response.headers.get('server-timing')!,/supplier;dur=[\d.]+/);
 assert.ok(!response.headers.get('server-timing')!.includes(result.searchId));
 const guestCookie=response.headers.get('set-cookie')!.split(';')[0];assert.ok(guestCookie.startsWith('maxtravel-shopping='));
 const stored=(await pool.query('SELECT user_id,company_id FROM supplier_searches WHERE id=$1',[result.searchId])).rows[0];assert.match(stored.user_id,/^guest:/);assert.equal(stored.company_id,null);
 assert.equal(result.results.searchResult.tripInfos.ONWARD.length,1);assert.equal(result.results.searchResult.tripInfos.ONWARD[0].totalPriceList[0].id,'public-fare');
 assert.equal(result.results.searchResult.tripInfos.ONWARD[0].totalPriceList[0].customerEstimateMinor,501000);
 assert.equal(result.results.searchResult.tripInfos.ONWARD[0].totalPriceList[0].fD.ADULT.bI.iB,'15 Kg');
 assert.equal(result.results.searchResult.tripInfos.ONWARD[0].totalPriceList[0].fD.ADULT.rT,1);
 console.log('PASS real anonymous search, signed cookie and public-only pricing; company markup not exposed');
 const before=providerCalls;
 assert.equal((await search(request(flight,'',{origin:'https://attacker.invalid'}))).status,403);
 assert.equal((await search(request(flight,'',{'sec-fetch-site':'cross-site'}))).status,403);
 assert.equal(providerCalls,before);
 console.log('PASS cross-site and invalid origin rejected before provider transport');
 const hotelResponse=await search(request(hotel,guestCookie));assert.equal(hotelResponse.status,200);const hotelResult=await hotelResponse.json();
 assert.deepEqual(hotelResult.results.hotels.map((row:{tjHotelId:string})=>row.tjHotelId),['100001']);
 assert.equal(hotelResult.results.hotels[0].customerEstimateMinor,500000);
 assert.equal(contentCalls,0);assert.equal(hotelResult.propertyContentPending,true);
 const contentInput={searchId:hotelResult.searchId};
 const callsBeforeContent=providerCalls;
 assert.equal((await content(request(contentInput))).status,409);
 assert.equal((await content(request({...contentInput,hotelIds:['100002']},guestCookie))).status,400);
 assert.equal((await content(request(contentInput,guestCookie,{origin:'https://attacker.invalid'}))).status,403);
 assert.equal((await content(request({searchId:result.searchId},guestCookie))).status,400);
 assert.equal(providerCalls,callsBeforeContent);
 let contentSettled=false;const contentResponse=content(request(contentInput,guestCookie)).then(value=>{contentSettled=true;return value;});
 await Promise.race([contentStarting,new Promise((_,reject)=>{setTimeout(()=>reject(Error('Content fixture did not start')),1500).unref();})]);
 assert.equal(contentSettled,false);assert.equal(hotelResult.results.hotels[0].customerEstimateMinor,500000);
 releaseContent();const enriched=await contentResponse;assert.equal(enriched.status,200);
 const properties=(await enriched.json()).properties;assert.deepEqual(Object.keys(properties),['100001']);assert.equal(properties['100001'].starRating,4);
 assert.ok(!JSON.stringify(properties).includes('customerEstimateMinor'));assert.equal(contentCalls,1);
 await pool.query("UPDATE supplier_searches SET expires_at=now()-interval '1 minute' WHERE id=$1",[hotelResult.searchId]);
 assert.equal((await content(request(contentInput,guestCookie))).status,409);assert.equal(contentCalls,1);
 await pool.query("UPDATE supplier_searches SET expires_at=now()+interval '14 minutes' WHERE id=$1",[hotelResult.searchId]);
 console.log('PASS rates returned before slow static metadata; enrichment keeps owned subset, freshness and pricing isolation');
 const selection={searchId:hotelResult.searchId,hid:'100001'};
 const subsetBefore=providerCalls;assert.equal((await detail(request({...selection,hid:'100002'},guestCookie))).status,400);assert.equal(providerCalls,subsetBefore);
 assert.equal((await detail(request(selection,guestCookie))).status,200);
 const detailBefore=providerCalls;assert.equal((await detail(request(selection))).status,409);assert.equal(providerCalls,detailBefore);
 console.log('PASS guest hotel details require matching cookie owner; wrong owner never reaches supplier');
 const context=await auth.$context;const password=randomBytes(24).toString('hex');const email=`runtime-${randomUUID()}@example.test`;
 const user=await context.internalAdapter.createUser({email,name:'Isolated route fixture',emailVerified:true},{method:'email-password'});
 await context.internalAdapter.createAccount({userId:user.id,providerId:'credential',accountId:user.id,password:await hashPassword(password)});
 const login=await auth.api.signInEmail({body:{email,password},headers:new Headers({origin:base}),asResponse:true});assert.equal(login.status,200);
 const authCookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert.ok(authCookie);
 await pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1',[user.id]);
 const restrictedBefore=providerCalls;const unverified=await search(request(flight,authCookie));assert.equal(unverified.status,403);assert.match((await unverified.json()).error,/Verify your email/);
 await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[user.id]);
 await pool.query('INSERT INTO customer_accounts(user_id,active) VALUES($1,false)',[user.id]);
 const suspended=await search(request(flight,authCookie));assert.equal(suspended.status,403);assert.match((await suspended.json()).error,/suspended/);assert.equal(providerCalls,restrictedBefore);
 console.log('PASS real signed sessions: unverified/suspended users get403 and never fall back to guest');
 await pool.query("INSERT INTO request_buckets(user_id,scope,bucket,hits) VALUES('public-shopping:global','search',date_trunc('minute',now()),120) ON CONFLICT(user_id,scope,bucket) DO UPDATE SET hits=120");
 const rateBefore=providerCalls;assert.equal((await search(request(flight,guestCookie))).status,429);assert.equal(providerCalls,rateBefore);
 console.log('PASS actual PostgreSQL rate bucket exhaustion returns429 before provider call');
 await pool.query('ALTER TABLE request_buckets RENAME TO unavailable_test_buckets');
 const failureBefore=providerCalls;assert.equal((await search(request(flight,guestCookie))).status,500);assert.equal(providerCalls,failureBefore);
 await pool.query('ALTER TABLE unavailable_test_buckets RENAME TO request_buckets');
 console.log('PASS actual missing database table fails closed without provider transport');
 console.log('PASS runtime route/session/rate-limit isolation checks; no live provider requests');
}finally{
 globalThis.fetch=previousFetch;
 await pool.end();try{if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);}finally{await admin.end();}
}
