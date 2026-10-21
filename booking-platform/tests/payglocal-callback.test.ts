import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/payments/payglocal/return/route";
import { POST as webhook } from "../src/app/api/webhooks/payglocal/route";

test("browser return is an untrusted hint, not payment verification", async () => {
  for (const handler of [GET, POST]) {
    const response = await handler();
    assert.equal(response.status, 202);
    assert.equal((await response.json()).status, "OUTCOME_UNCONFIRMED");
  }
});
test("unsigned PayGlocal webhook fails closed without an adapter or database", async () => {
  const response = await webhook();
  assert.equal(response!.status, 503);
  assert.match((await response!.json()).error, /not enabled/);
});
