import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';

const require = createRequire(import.meta.url);
const quoteId = '30cf55a8-7c40-42e2-a7b9-0499667a556a';
const bookingId = 'a0cf55a8-7c40-42e2-a7b9-0499667a556b';
const companyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('payment status resolves only an owned expired quote with proven order absence', async () => {
  const db = new PGlite();
  const fixture = {
    actor: {userId: 'synthetic-owner', companyId: null as string | null},
    tx: db.transaction.bind(db),
    db,
    beforeTransaction: async () => {},
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.__paymentStatusTest = fixture;
  try {
    await db.exec(`
      CREATE TABLE supplier_quotes (id uuid PRIMARY KEY,user_id text,company_id uuid,expires_at timestamptz,
        fare_validation_state text,booking_validation_state text,review jsonb);
      CREATE TABLE orders (id uuid PRIMARY KEY,quote_id uuid REFERENCES supplier_quotes(id),user_id text,company_id uuid,
        status text,total_minor bigint,service_kind text);
      CREATE TABLE gateway_intents (order_id uuid PRIMARY KEY,provider text,state text,gateway_order_id text);
      CREATE TABLE payments (order_id uuid,provider text,gateway_order_id text,status text,amount_minor bigint,currency text);
      CREATE TABLE payglocal_attempts (order_id uuid PRIMARY KEY,gid text,state text,redirect_url text);
    `);
    await db.query("INSERT INTO supplier_quotes (id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [quoteId, fixture.actor.userId]);
    const mocks: Record<string,string> = {
      '@/lib/db': `const fixture=globalThis.__paymentStatusTest;
        export const database=()=>fixture.db;
        export async function transaction(work){await fixture.beforeTransaction();return fixture.tx(work);}`,
      '@/lib/guest-shopping': `export const checkoutAccess=async()=>({actor:globalThis.__paymentStatusTest.actor}); export const shoppingResponse=r=>r;`,
      '@/lib/http': `export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
        export const json=(data,status=200)=>Response.json(data,{status});
        export const failure=e=>json({error:e.message},e.status||500);`,
      '@/lib/providers/razorpay': 'export function razorpayKey(){throw Error("Unexpected credential request");}',
      '@/lib/payglocal-runtime': 'export function synchronizePayGlocalPayment(){throw Error("Unexpected external payment query");}',
      '@/lib/providers/payglocal': 'export function validatePayGlocalUrl(){throw Error("Unexpected hosted checkout");}',
    };
    const output = await build({
      entryPoints: [resolve('src/app/api/payments/status/route.ts')], bundle: true, packages: 'external',
      platform: 'node', format: 'cjs', write: false, plugins: [{name: 'isolated-payment-status', setup(plugin) {
        plugin.onResolve({filter: /.*/}, ({path}) => Object.hasOwn(mocks, path) ? {path, namespace: 'fixture'} : undefined);
        plugin.onLoad({filter: /.*/, namespace: 'fixture'}, ({path}) => ({contents: mocks[path], loader: 'js'}));
      }}],
    });
    const compiled = {exports: {} as {GET: (request: Request) => Promise<Response>}};
    new Function('module','exports','require',output.outputFiles[0].text)(compiled,compiled.exports,require);
    const request = () => compiled.exports.GET(new Request(`http://127.0.0.1/api/payments/status?quoteId=${quoteId}`));

    let response = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      found: false, quoteId, canResume: false, checkoutResolved: false, status: 'OUTCOME_UNCONFIRMED',
      message: 'No payment order is visible yet. An interrupted request may still be running. Recheck this status or contact MaxTravel; do not start another payment for the same trip.',
    });
    await db.query("UPDATE supplier_quotes SET expires_at=now()-interval '1 hour' WHERE id=$1", [quoteId]);
    response = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      found: false, quoteId, canResume: false, checkoutResolved: true, status: 'EXPIRED_WITHOUT_PAYMENT',
      message: 'This quote expired before a payment order was created. Review a fresh price before paying.',
    });

    fixture.actor.companyId = companyId;
    assert.equal((await request()).status, 404);
    fixture.actor.companyId = null;
    fixture.actor.userId = 'other-owner';
    assert.equal((await request()).status, 404);
    fixture.actor.userId = 'synthetic-owner';

    // An order published between the optimistic read and lock acquisition must
    // disable expiry resolution even if its ownership fields are inconsistent.
    fixture.beforeTransaction = async () => {
      await db.query("INSERT INTO orders VALUES ($1,$2,'other-owner',NULL,'PAYMENT_PENDING',5000,NULL)", [bookingId,quoteId]);
      fixture.beforeTransaction = async () => {};
    };
    const missed = await (await request()).json();
    assert.equal(missed.status, 'OUTCOME_UNCONFIRMED');
    assert.equal(missed.checkoutResolved, false);
    assert.equal(missed.bookingId, undefined);

    await db.query("UPDATE orders SET user_id=$2 WHERE id=$1", [bookingId,fixture.actor.userId]);
    const pending = await (await request()).json();
    assert.equal(pending.found, true);
    assert.equal(pending.bookingId, bookingId);
    assert.equal(pending.checkoutResolved, false);
    assert.equal(pending.canResume, false);
  } finally {
    delete globals.__paymentStatusTest;
    await db.close();
  }
});
