import test from "node:test";
import assert from "node:assert/strict";
import { deliverNotification } from "../src/lib/notification-delivery";

function harness() {
  const calls: string[] = [];
  return { calls, deps: {
    prepare: async () => { calls.push("prepare"); return async () => { calls.push("send"); }; },
    renewLease: async () => { calls.push("renew"); return true; },
    acknowledge: async () => { calls.push("ack"); return true; },
    defer: async () => { calls.push("defer"); },
    now: () => 0,
  } };
}
test("owned lease sends and acknowledges", async () => {
  const { calls, deps } = harness();
  assert.equal(await deliverNotification(deps), "delivered");
  assert.deepEqual(calls, ["prepare", "renew", "send", "ack"]);
});
test("lost lease cannot send or change another worker's retry state", async () => {
  const { calls, deps } = harness(); deps.renewLease = async () => false;
  assert.equal(await deliverNotification(deps), "lease-lost");
  assert.deepEqual(calls, ["prepare"]);
});
test("late renewal response does not send past safe lease budget", async () => {
  const { calls, deps } = harness(); let now = 0; deps.now = () => now;
  deps.renewLease = async () => { now = 46_000; return true; };
  assert.equal(await deliverNotification(deps), "lease-lost");
  assert.deepEqual(calls, ["prepare"]);
});
test("uncertain renewal does not send or eagerly release lease", async () => {
  const { calls, deps } = harness(); deps.renewLease = async () => { throw Error("DB"); };
  await assert.rejects(deliverNotification(deps)); assert.deepEqual(calls, ["prepare"]);
});
test("failed send defers, never acknowledges", async () => {
  const { calls, deps } = harness(); deps.prepare = async () => async () => { throw Error("timeout"); };
  assert.equal(await deliverNotification(deps), "deferred"); assert.deepEqual(calls, ["renew", "defer"]);
});
for (const lostAck of [async () => false, async (): Promise<boolean> => { throw Error("commit response lost"); }]) {
  test("successful SMTP with lost DB acknowledgement never schedules immediate resend", async () => {
    const { calls, deps } = harness(); deps.acknowledge = lostAck;
    assert.equal(await deliverNotification(deps), "acknowledgement-unknown");
    assert.deepEqual(calls, ["prepare", "renew", "send"]);
  });
}
test("concurrent prepared workers: only current lease owner sends", async () => {
  const a = harness(), b = harness(); let owner = "b";
  a.deps.renewLease = async () => owner === "a";
  b.deps.renewLease = async () => owner === "b";
  const results = await Promise.all([deliverNotification(a.deps), deliverNotification(b.deps)]);
  assert.deepEqual(results, ["lease-lost", "delivered"]);
  assert.ok(!a.calls.includes("send")); assert.ok(b.calls.includes("send")); owner = "none";
});
test("preparation failure defers without entering SMTP", async () => {
  const { calls, deps } = harness(); deps.prepare = async () => { throw Error("missing order"); };
  assert.equal(await deliverNotification(deps), "deferred"); assert.deepEqual(calls, ["defer"]);
});
