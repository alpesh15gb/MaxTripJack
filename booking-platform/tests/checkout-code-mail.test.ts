import test from "node:test";
import assert from "node:assert/strict";
import { createAccountMailDispatcher } from "../src/lib/account-mail-dispatch";

test("checkout code delivery is deferred and delivery errors never expose recipient or code", async () => {
  const queue: (() => Promise<void>)[] = [];
  const sent: string[][] = [], reports: string[][] = [];
  let fail = false;
  const dispatch = createAccountMailDispatcher({
    schedule: work => queue.push(work),
    send: async (...args) => { sent.push(args); if (fail) throw Error("sensitive SMTP response with 123456 and guest@example.test"); },
    report: (...args) => reports.push(args),
  });
  dispatch("signin-code", "guest@example.test", "123456");
  assert.equal(sent.length, 0);
  assert.equal(queue.length, 1);
  await queue.shift()!();
  assert.equal(sent[0][0], "guest@example.test");
  assert.match(sent[0][2], /123456/);
  assert.match(sent[0][2], /5 minutes/);
  assert.match(sent[0][2], /used once/);
  assert.deepEqual(reports, [["signin-code", "attempt-started"], ["signin-code", "smtp-accepted"]]);
  fail = true;
  dispatch("signin-code", "guest@example.test", "123456");
  await queue.shift()!();
  assert.deepEqual(reports.at(-1), ["signin-code", "delivery-unconfirmed"]);
  assert.doesNotMatch(JSON.stringify(reports), /123456|@|sensitive|SMTP/);
});
