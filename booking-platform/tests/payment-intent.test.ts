import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { assertRecoverablePaymentIntent, markGatewayIntentUnknown, PAYMENT_INTENT_STALE_MS, persistGatewayOrder, type PaymentIntent } from "../src/lib/payment-intent";

const bookingId = "9225bc6c-30c5-4a3c-a506-59c3d4e20001";
const gateway = { id: "order_existing", amount: 10000, currency: "INR", receipt: bookingId };
const now = Date.now();
function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return { provider: "RAZORPAY", total_minor: "10000", status: "PAYMENT_PENDING", state: "STARTED", gateway_order_id: null, created_at: new Date(now - PAYMENT_INTENT_STALE_MS - 1000), ...overrides };
}

// In-memory SQL boundary: no database, auth service or provider network traffic.
// Each invocation represents the state seen AFTER the production row lock.
function fixture(current = intent()) {
  const queries: string[] = [];
  const payments: { order_id: string; gateway_order_id: string; amount_minor: string; currency: string }[] = [];
  const query = async (sql: string, values: unknown[] = []) => {
    queries.push(sql);
    if (sql.startsWith("SELECT g.provider,o.total_minor")) {
      assert.match(sql, /FOR UPDATE OF o,g$/);
      return { rows: [{ ...current }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT order_id,gateway_order_id")) return { rows: payments.map(row => ({ ...row })), rowCount: payments.length };
    if (sql.startsWith("INSERT INTO payments")) payments.push({ order_id: String(values[1]), gateway_order_id: String(values[2]), amount_minor: String(values[3]), currency: "INR" });
    else if (sql.startsWith("UPDATE gateway_intents SET state='CREATED'")) { current.state = "CREATED"; current.gateway_order_id = String(values[1]); }
    else if (sql.startsWith("UPDATE gateway_intents SET state='UNKNOWN'")) current.state = "UNKNOWN";
    else if (sql.startsWith("UPDATE orders SET status='PAYMENT_PENDING'")) current.status = "PAYMENT_PENDING";
    else if (sql.startsWith("UPDATE orders SET status='MANUAL_REVIEW'")) current.status = "MANUAL_REVIEW";
    else throw Error(`Unexpected query: ${sql}`);
    return { rows: [], rowCount: 1 };
  };
  return { tx: { query } as unknown as Pick<PoolClient, "query">, current, payments, queries, writes: () => queries.filter(sql => !sql.startsWith("SELECT")) };
}

test("only stale STARTED intents or known uncertain creations can be recovered", () => {
  assert.doesNotThrow(() => assertRecoverablePaymentIntent(intent(), gateway.id, now));
  assert.doesNotThrow(() => assertRecoverablePaymentIntent(intent({ state: "UNKNOWN", status: "MANUAL_REVIEW", created_at: new Date(now) }), gateway.id, now));
  assert.doesNotThrow(() => assertRecoverablePaymentIntent(intent({ state: "UNKNOWN" }), gateway.id, now));
  for (const row of [undefined, intent({ created_at: new Date(now - PAYMENT_INTENT_STALE_MS + 1) }), intent({ created_at: "invalid" }), intent({ gateway_order_id: "order_other" }), intent({ status: "PAID" }), intent({ status: "TICKETED" }), intent({ state: "OTHER" })]) {
    assert.throws(() => assertRecoverablePaymentIntent(row, gateway.id, now));
  }
});

test("process-crashed STARTED creation links the verified existing order exactly once", async () => {
  const f = fixture();
  assert.deepEqual(await persistGatewayOrder(f.tx, bookingId, gateway, "RECOVER"), { linked: true });
  assert.equal(f.current.state, "CREATED");
  assert.equal(f.current.status, "PAYMENT_PENDING");
  assert.equal(f.payments.length, 1);
  assert.equal(f.payments[0].gateway_order_id, gateway.id);
  const writes = f.writes().length;
  assert.deepEqual(await persistGatewayOrder(f.tx, bookingId, gateway, "RECOVER"), { linked: false });
  assert.equal(f.writes().length, writes);
});

test("recovery rejects wrong receipt, reference, amount or currency without writes", async () => {
  for (const altered of [{ receipt: "another-booking" }, { receipt: undefined }, { amount: 9999 }, { amount: "10000" }, { currency: "USD" }, { id: "invalid" }]) {
    const f = fixture();
    await assert.rejects(persistGatewayOrder(f.tx, bookingId, { ...gateway, ...altered }, "RECOVER"));
    assert.deepEqual(f.writes(), []);
  }
});

test("locked state is checked again after a stale recovery preflight", async () => {
  assertRecoverablePaymentIntent(intent(), gateway.id, now);
  for (const changed of [intent({ total_minor: "20000" }), intent({ status: "PAID" }), intent({ status: "BOOKING_PENDING" }), intent({ status: "TICKETED" }), intent({ gateway_order_id: "order_other", state: "CREATED" })]) {
    const f = fixture(changed);
    await assert.rejects(persistGatewayOrder(f.tx, bookingId, gateway, "RECOVER"));
    assert.deepEqual(f.writes(), []);
  }
});

test("late creator success, duplicate recovery and late creator failure never downgrade capture", async () => {
  for (const status of ["PAID", "BOOKING_PENDING", "TICKETED", "BOOKING_FAILED", "CANCELLED", "MANUAL_REVIEW"]) {
    const f = fixture(intent({ state: "UNKNOWN", status: "MANUAL_REVIEW" }));
    await persistGatewayOrder(f.tx, bookingId, gateway, "RECOVER");
    f.current.status = status; // Verified capture/supplier worker progressed.
    const writes = f.writes().length;
    assert.deepEqual(await persistGatewayOrder(f.tx, bookingId, gateway, "CREATE"), { linked: false });
    assert.deepEqual(await persistGatewayOrder(f.tx, bookingId, gateway, "RECOVER"), { linked: false });
    await markGatewayIntentUnknown(f.tx, bookingId);
    assert.equal(f.current.status, status);
    assert.equal(f.current.state, "CREATED");
    assert.equal(f.payments.length, 1);
    assert.equal(f.writes().length, writes);
  }
});

test("creation failures mark uncertainty together and never overwrite progressed unlinked state", async () => {
  const f = fixture();
  await markGatewayIntentUnknown(f.tx, bookingId);
  assert.equal(f.current.state, "UNKNOWN");
  assert.equal(f.current.status, "MANUAL_REVIEW");
  assert.equal(f.writes().length, 2);
  for (const status of ["PAID", "BOOKING_PENDING", "TICKETED", "CANCELLED"]) {
    const progressed = fixture(intent({ status }));
    await markGatewayIntentUnknown(progressed.tx, bookingId);
    assert.deepEqual(progressed.writes(), []);
  }
});

test("an existing conflicting payment link is never replaced", async () => {
  const f = fixture();
  f.payments.push({ order_id: "other-booking", gateway_order_id: gateway.id, amount_minor: "10000", currency: "INR" });
  await assert.rejects(persistGatewayOrder(f.tx, bookingId, gateway, "RECOVER"));
  assert.deepEqual(f.writes(), []);
});

 test("Razorpay recovery refuses PayGlocal attempts without mutation", async () => {
  const f = fixture(intent({ provider: "PAYGLOCAL" }));
  assert.throws(() => assertRecoverablePaymentIntent(f.current, gateway.id, now));
  await assert.rejects(persistGatewayOrder(f.tx, bookingId, gateway, "CREATE"));
  assert.equal(f.writes().length, 0);
});
