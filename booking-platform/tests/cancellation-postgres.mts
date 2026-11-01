/** Isolated PostgreSQL + real cancellation runner; upstream is a local fixture.
 * No real provider requests. Explicit loopback disposable database required. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {Pool} from "pg";
import {GET as health} from "../src/app/api/health/route";
import {executeCancellation,runCancellationJobs} from "../src/lib/cancellation-runner";
const input=process.env.TEST_DATABASE_URL;
if(!input)throw Error("Explicit TEST_DATABASE_URL is required");
const url=new URL(input);
if(!["postgres:","postgresql:"].includes(url.protocol)||!["127.0.0.1","[::1]"].includes(url.hostname)||url.pathname!=="/payglocal_disposable"||url.search||url.hash)throw Error("Only the loopback disposable test database is permitted");
const name=`cancellation_test_${randomUUID().replaceAll("-","")}`;
const admin=new Pool({connectionString:input}),pool=new Pool({connectionString:input,options:`-c search_path=${name},public`});
const originalFetch=globalThis.fetch,globals=globalThis as typeof globalThis&{travelPool?:Pool},previousPool=globals.travelPool;
const env={DATABASE_URL:process.env.DATABASE_URL,TRIPJACK_HOTEL_API_KEY:process.env.TRIPJACK_HOTEL_API_KEY};
let created=false,submissions=0,checks=0,status="CANCELLATION_PENDING",fail=false,release:(()=>void)|null=null,entered:(()=>void)|null=null;
async function seed(){const order=randomUUID(),id=randomUUID();await pool.query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor,supplier_booking_id) VALUES($1,$2,'fixture','HOTEL','CONFIRMED',10000,9000,$3)",[order,`TEST-${order}`,`TJ-${order}`]);await pool.query("INSERT INTO cancellation_requests(id,order_id,user_id,reason,request_key,status,supplier_attempted_at,next_check,poll_attempts,refund_offer_minor) VALUES($1,$2,'fixture','Fixture request',$3,'SUPPLIER_PENDING',now()-interval '2 days',now()-interval '1 second',7,9000)",[id,order,randomUUID()]);return {id,order};}
const row=async(id:string)=>(await pool.query("SELECT *,extract(epoch from(next_check-last_checked_at))::int AS delay FROM cancellation_requests WHERE id=$1",[id])).rows[0];
try{
 await admin.query(`CREATE SCHEMA ${name}`);created=true;
 for(const file of (await readdir(new URL("../db/",import.meta.url))).filter(n=>/^\d{3}-.*\.sql$/.test(n)).sort())await pool.query(await readFile(new URL(`../db/${file}`,import.meta.url),"utf8"));
 globals.travelPool=pool;process.env.DATABASE_URL=input;process.env.TRIPJACK_HOTEL_API_KEY="synthetic-provider-only";
 assert.equal((await health()).status,200);await pool.query("ALTER TABLE cancellation_requests RENAME COLUMN lease_token TO fixture_missing_lease");assert.equal((await health()).status,503);await pool.query("ALTER TABLE cancellation_requests RENAME COLUMN fixture_missing_lease TO lease_token");assert.equal((await health()).status,200);
 globalThis.fetch=async(input)=>{const u=String(input);if(u.includes("cancel-booking")){submissions++;throw Error("Unexpected resubmission");}if(!u.startsWith("https://apitest-hotel-booker.tripjack.com/oms/v3/hotel/booking-details"))throw Error("Unexpected external URL");checks++;if(entered)entered();if(release)await new Promise<void>(resolve=>{release=resolve;});if(fail)throw Error("Synthetic transport interruption");return Response.json({status:{success:true},order:{status}});};
 const first=await seed();await runCancellationJobs();let current=await row(first.id);assert.equal(checks,1);assert.equal(submissions,0);assert.equal(current.status,"SUPPLIER_PENDING");assert.equal(current.delay,86400);assert.ok(current.follow_up_required_at);assert.equal(current.lease_token,null);assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[first.order])).rows[0].status,"CONFIRMED");
 await runCancellationJobs();assert.equal(checks,1);await assert.rejects(()=>executeCancellation(first.id,"operator"),{status:409});
 // Recovery of an expired lease must only query status, even with expired/missing consent.
 await pool.query("UPDATE cancellation_requests SET next_check=now()-interval '1 second',lease_token=$2,lease_until=now()-interval '1 second' WHERE id=$1",[first.id,randomUUID()]);
 await runCancellationJobs();assert.equal(checks,2);assert.equal(submissions,0);
 await pool.query("UPDATE cancellation_requests SET next_check=now()-interval '1 second' WHERE id=$1",[first.id]);fail=true;await runCancellationJobs();current=await row(first.id);assert.equal(current.check_error,"SUPPLIER_UNAVAILABLE");assert.equal(current.delay,86400);assert.equal(current.status,"SUPPLIER_PENDING");fail=false;
 // Overlapping workers/staff clicks share the same persisted lease.
 await pool.query("UPDATE cancellation_requests SET next_check=now()-interval '1 second' WHERE id=$1",[first.id]);
 let arrived!:()=>void;const started=new Promise<void>(resolve=>{arrived=resolve;});entered=arrived;release=()=>{};status="CANCELLED";
 const running=executeCancellation(first.id,"operator");await started;await assert.rejects(()=>executeCancellation(first.id,"other"),{status:409});const unblock=release as (()=>void)|null;entered=null;release=null;if(unblock)unblock();await running;
 assert.equal((await row(first.id)).status,"CONFIRMED");assert.equal((await row(first.id)).next_check,null);assert.equal((await row(first.id)).follow_up_required_at,null);
 const before=checks;assert.equal((await executeCancellation(first.id,"operator")).status,"CONFIRMED");assert.equal(checks,before);assert.equal(submissions,0);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1 AND event_type='booking.cancelled'",[first.order])).rows[0].n,1);
 // Final state, revision and CRM event must roll back together if enqueue fails.
 const second=await seed();await pool.query("ALTER TABLE outbox_events ADD CONSTRAINT cancellation_fixture_rollback CHECK(event_type<>'booking.cancelled') NOT VALID");
 await assert.rejects(()=>executeCancellation(second.id,"operator",false));assert.equal((await row(second.id)).status,"SUPPLIER_PENDING");assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[second.order])).rows[0].status,"CONFIRMED");
 await pool.query("ALTER TABLE outbox_events DROP CONSTRAINT cancellation_fixture_rollback");await pool.query("UPDATE cancellation_requests SET lease_until=now()-interval '1 second',next_check=now()-interval '1 second' WHERE id=$1",[second.id]);
 await runCancellationJobs();assert.equal((await row(second.id)).status,"CONFIRMED");assert.equal(submissions,0);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM refunds")).rows[0].n,0);
 console.log("PASS: daily pending checks after five attempts; expired-lease recovery; transport retry; staff escalation; concurrency; exactly-once CRM completion; rollback and no automatic refund.");
}finally{globalThis.fetch=originalFetch;globals.travelPool=previousPool;for(const[k,v]of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await pool.end();if(created)await admin.query(`DROP SCHEMA ${name} CASCADE`);await admin.end();}
