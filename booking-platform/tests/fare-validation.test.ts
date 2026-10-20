import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { fareValidationHash, FareValidationBlockedError, validateFareOnce } from "../src/lib/fare-validation";

const payload = { bookingId: "supplier-existing", travellerInfo: [{ fN: "Asha", lN: "Shah", pt: "ADULT" }], paymentInfos: [{ amount: 100 }] };
function fixture(state: string | null = null, hash: string | null = null) {
  const row = { fare_validation_state: state, fare_validation_hash: hash };
  const prebook = { fare_validation_state: null as string | null, fare_validation_hash: null as string | null };
  const calls: string[] = [];
  let failCommit = false;
  const query = async (sql: string, values: unknown[] = []) => {
    calls.push(sql);
    const current = sql.includes("booking_validation") ? prebook : row;
    if (sql.startsWith("SELECT ")) { assert.match(sql, /FOR UPDATE$/); return { rows: [{ state: current.fare_validation_state, request_hash: current.fare_validation_hash, prepayment_state: row.fare_validation_state, prepayment_hash: row.fare_validation_hash }], rowCount: 1 }; }
    if (/SET \w+_state='STARTED'/.test(sql)) { current.fare_validation_state = "STARTED"; current.fare_validation_hash = String(values[1]); }
    else if (/SET \w+_state='SUCCEEDED'/.test(sql)) { if (failCommit) throw Error("Simulated lost database commit"); current.fare_validation_state = "SUCCEEDED"; }
    else if (/SET \w+_state='BLOCKED'/.test(sql)) { if (failCommit) throw Error("Database still unavailable"); current.fare_validation_state = "BLOCKED"; }
    else throw Error(`Unexpected query: ${sql}`);
    return { rows: [], rowCount: 1 };
  };
  const transaction = async <T>(run: (tx: Pick<PoolClient, "query">) => Promise<T>) => run({ query } as unknown as Pick<PoolClient, "query">);
  return { row, prebook, calls, transaction, failCommit: () => { failCommit = true; } };
}

test("FareValidate commits its start before dispatch and reuses only identical success", async () => {
  const f = fixture(); let requests = 0;
  const input = { quoteId: "quote", phase: "PREPAYMENT" as const, payload, transaction: f.transaction, validate: async () => { requests++; assert.equal(f.row.fare_validation_state, "STARTED"); } };
  await validateFareOnce(input);
  assert.equal(f.row.fare_validation_state, "SUCCEEDED");
  await validateFareOnce({ ...input, payload: { paymentInfos: payload.paymentInfos, travellerInfo: payload.travellerInfo, bookingId: payload.bookingId } });
  assert.equal(requests, 1);
  for (const changed of [{ ...payload, paymentInfos: [{ amount: 101 }] }, { ...payload, travellerInfo: [{ fN: "Ravi", lN: "Shah", pt: "ADULT" }] }, { ...payload, travellerInfo: [{ ...payload.travellerInfo[0], ssrSeatInfos: [{ key: "segment", code: "2A" }] }] }]) {
    await assert.rejects(validateFareOnce({ ...input, payload: changed }), FareValidationBlockedError);
  }
  assert.equal(requests, 1);
});

test("crash after dispatch marker never reissues FareValidate", async () => {
  const f = fixture("STARTED", fareValidationHash(payload)); let requests = 0;
  await assert.rejects(validateFareOnce({ quoteId: "quote", phase: "PREPAYMENT" as const, payload, transaction: f.transaction, validate: async () => { requests++; } }), FareValidationBlockedError);
  assert.equal(requests, 0);
  assert.equal(f.row.fare_validation_state, "STARTED");
});

test("lost provider response remains blocked on browser and worker retries", async () => {
  const f = fixture(); let requests = 0;
  const input = { quoteId: "quote", phase: "PREPAYMENT" as const, payload, transaction: f.transaction, validate: async () => { requests++; throw Error("Connection lost after validation acceptance"); } };
  await assert.rejects(validateFareOnce(input), FareValidationBlockedError);
  assert.equal(f.row.fare_validation_state, "BLOCKED");
  await assert.rejects(validateFareOnce(input), FareValidationBlockedError);
  assert.equal(requests, 1);
});

test("successful provider response with lost persistence is not safe to repeat", async () => {
  const f = fixture(); let requests = 0;
  const input = { quoteId: "quote", phase: "PREPAYMENT" as const, payload, transaction: f.transaction, validate: async () => { requests++; f.failCommit(); } };
  await assert.rejects(validateFareOnce(input), FareValidationBlockedError);
  assert.equal(f.row.fare_validation_state, "STARTED");
  await assert.rejects(validateFareOnce(input), FareValidationBlockedError);
  assert.equal(requests, 1);
});

test("a concurrent checkout observes STARTED instead of dispatching twice", async () => {
  const f = fixture(); let requests = 0;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const input = { quoteId: "quote", phase: "PREPAYMENT" as const, payload, transaction: f.transaction, validate: async () => { requests++; entered(); await delayed; } };
  const first = validateFareOnce(input);
  await started;
  await assert.rejects(validateFareOnce(input), FareValidationBlockedError);
  release(); await first;
  assert.equal(requests, 1);
});

test("prepayment success never replaces the fresh post-payment fare check", async () => {
  const f = fixture(); const phases: string[] = [];
  await validateFareOnce({ quoteId: "quote", phase: "PREPAYMENT", payload, transaction: f.transaction, validate: async () => { phases.push("before payment"); } });
  // Payment can take time. A later fare change must prevent Book, even though
  // exactly the same passenger/extras payload was valid before payment.
  const prebook = { quoteId: "quote", phase: "PREBOOK" as const, payload, transaction: f.transaction, validate: async () => { phases.push("after payment"); throw Error("Fare changed while payment was open"); } };
  await assert.rejects(validateFareOnce(prebook), FareValidationBlockedError);
  await assert.rejects(validateFareOnce(prebook), FareValidationBlockedError);
  assert.deepEqual(phases, ["before payment", "after payment"]);
  assert.equal(f.row.fare_validation_state, "SUCCEEDED");
  assert.equal(f.prebook.fare_validation_state, "BLOCKED");
});

test("PREBOOK cannot bypass uncertain or mismatched prepayment validation", async () => {
  for (const state of ["STARTED", "BLOCKED", "SUCCEEDED"]) {
    const f = fixture(state, state === "SUCCEEDED" ? "different-payload-hash" : fareValidationHash(payload)); let requests = 0;
    await assert.rejects(validateFareOnce({ quoteId: "quote", phase: "PREBOOK", payload, transaction: f.transaction, validate: async () => { requests++; } }), FareValidationBlockedError);
    assert.equal(requests, 0);
    assert.equal(f.prebook.fare_validation_state, null);
  }
});

test("worker crash after successful PREBOOK validation cannot reuse an old fare", async () => {
  const f = fixture(); let requests = 0;
  const input = { quoteId: "quote", phase: "PREBOOK" as const, payload, transaction: f.transaction, validate: async () => { requests++; } };
  await validateFareOnce(input);
  assert.equal(f.prebook.fare_validation_state, "SUCCEEDED");
  // A replacement worker after lease expiry must require operations, never
  // skip freshness checks or reissue the same provider validation.
  await assert.rejects(validateFareOnce(input), FareValidationBlockedError);
  assert.equal(requests, 1);
});
