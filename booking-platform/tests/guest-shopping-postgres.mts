/** Real PostgreSQL ownership tests. Never reads DATABASE_URL or contacts providers.
 * Run against an explicitly disposable loopback DB named payglocal_disposable:
 * TEST_DATABASE_URL=postgresql://...@127.0.0.1:PORT/payglocal_disposable node --import tsx tests/guest-shopping-postgres.mts
 * All migrations and fixtures live in a random schema dropped in finally.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { claimShoppingSearch } from "../src/lib/guest-search-claim";
import { issueShoppingToken, shoppingIdentity } from "../src/lib/guest-shopping-identity";

const input = process.env.TEST_DATABASE_URL;
if (!input) throw Error("Explicit disposable TEST_DATABASE_URL required.");
const url = new URL(input);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/payglocal_disposable" || url.search || url.hash) throw Error("Only loopback payglocal_disposable without URL options is permitted.");
const schema = `shopping_test_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: input, max: 12, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
let created = false;
async function tx<T>(run: (client: PoolClient) => Promise<T>) {
 const client = await pool.connect();
 try { await client.query("BEGIN"); await client.query(`SET LOCAL search_path TO ${schema}, public`); const result = await run(client); await client.query("COMMIT"); return result; }
 catch (error) { await client.query("ROLLBACK"); throw error; }
 finally { client.release(); }
}
const secret = "disposable-shopping-test-secret-not-a-real-secret";
const guest = shoppingIdentity(issueShoppingToken(secret), secret)!;
const otherGuest = shoppingIdentity(issueShoppingToken(secret), secret)!;
const actor = { userId: "test-user", companyId: null };
async function seed(owner = guest, company: string | null = null, service: string | null = null, expired = false) {
 const id = randomUUID();
 await tx(client => client.query("INSERT INTO supplier_searches(id,user_id,company_id,product,criteria,results,correlation_id,expires_at,service_kind) VALUES($1,$2,$3,'FLIGHT','{}','{}',$4,now()+$5::interval,$6)", [id, owner, company, randomUUID(), expired ? "-1 minute" : "14 minutes", service]));
 return id;
}
const claim = (id: string, owner = guest, target = actor) => tx(client => claimShoppingSearch(client, id, owner, target));
async function owner(id: string) { return tx(async client => (await client.query("SELECT user_id,company_id FROM supplier_searches WHERE id=$1", [id])).rows[0]); }
try {
 await pool.query(`CREATE SCHEMA ${schema}`); created = true;
 const migrations = (await readdir(new URL("../db/", import.meta.url))).filter(name => /^\d{3}-.*\.sql$/.test(name)).sort();
 assert.ok(migrations.includes("016-payglocal.sql"));
 await tx(async client => { for (const name of migrations) await client.query(await readFile(new URL(`../db/${name}`, import.meta.url), "utf8")); });
 console.log(`PASS ${migrations.length} actual migrations in isolated schema`);

 const raced = await seed();
 const contenders = Array.from({ length: 8 }, (_, index) => ({ userId: `contender-${index}`, companyId: null }));
 const outcomes = await Promise.all(contenders.map(target => claim(raced, guest, target)));
 assert.equal(outcomes.filter(Boolean).length, 1);
 assert.equal((await owner(raced)).user_id, contenders[outcomes.indexOf(true)].userId);
 assert.equal(await claim(raced), false);
 console.log("PASS eight concurrent authenticated actors: exactly one owner; no later transfer");

 const duplicate = await seed();
 assert.equal((await Promise.all(Array.from({ length: 8 }, () => claim(duplicate)))).filter(Boolean).length, 1);
 assert.deepEqual(await owner(duplicate), { user_id: actor.userId, company_id: null });
 console.log("PASS eight duplicate claims by same account: one transfer");

 const company = randomUUID();
 await tx(client => client.query("INSERT INTO companies(id,name,status) VALUES($1,'Disposable test company','APPROVED')", [company]));
 for (const [label, id] of [
  ["other guest", await seed(otherGuest)],
  ["private signed-in search", await seed("private-user")],
  ["company search", await seed(guest, company)],
  ["expired search", await seed(guest, null, null, true)],
  ["ancillary service", await seed(guest, null, "ANCILLARY")],
  ["reissue service", await seed(guest, null, "REISSUE")],
 ] as const) {
  const before = await owner(id); assert.equal(await claim(id), false, label); assert.deepEqual(await owner(id), before, label);
 }
 assert.equal(await claim(randomUUID()), false);
 console.log("PASS wrong cookie owner, signed-in/private/company, expired, both services and missing searches cannot transfer");

 const corporate = await seed();
 assert.equal(await tx(client => claimShoppingSearch(client, corporate, guest, { userId: "corporate-user", companyId: company })), true);
 assert.deepEqual(await owner(corporate), { user_id: "corporate-user", company_id: company });
 assert.equal(await claim(corporate), false);
 console.log("PASS authorized actor company recorded atomically; guest cannot reclaim corporate search");

 const rollback = await seed();
 await assert.rejects(tx(async client => { assert.equal(await claimShoppingSearch(client, rollback, guest, actor), true); throw Error("Injected rollback"); }), /Injected rollback/);
 assert.deepEqual(await owner(rollback), { user_id: guest, company_id: null });
 assert.equal(await claim(rollback), true);
 const counts = await tx(async client => (await client.query("SELECT (SELECT count(*)::int FROM supplier_quotes) quotes,(SELECT count(*)::int FROM orders) orders,(SELECT count(*)::int FROM payments) payments")).rows[0]);
 assert.deepEqual(counts, { quotes: 0, orders: 0, payments: 0 });
 console.log("PASS real transaction rollback preserves guest ownership; claims create no quotes/orders/payments");
 console.log("PASS all guest-shopping PostgreSQL tests; route/session/rate-limit behavior tested separately");
} finally {
 try { if (created) await pool.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await pool.end(); }
}
