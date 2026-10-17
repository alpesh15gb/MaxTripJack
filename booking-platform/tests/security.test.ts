import test from "node:test";
import assert from "node:assert/strict";
import { canReadOrder, refundableAmount, cancellationAllowed } from "../src/lib/booking-policy";
import { signature, verifySignature, crmSignature } from "../src/lib/signatures";
import { boundedText, sameOrigin } from "../src/lib/http";

test("customer/company isolation denies guessed booking IDs and cross-account access", () => {
  const personal = { user_id: "alice", company_id: null };
  assert.equal(canReadOrder("alice", null, personal), true);
  assert.equal(canReadOrder("bob", null, personal), false);
  assert.equal(canReadOrder("alice", "company-a", personal), false);
  assert.equal(canReadOrder("bob", "company-b", { user_id: "alice", company_id: "company-a" }), false);
  assert.equal(canReadOrder("alice", null, { user_id: "alice", company_id: "company-a" }), false);
  assert.equal(canReadOrder("alice", "company-a", { user_id: "alice", company_id: "company-a" }), true);
});
test("refund reservations cannot promise the same money twice", () => {
  assert.equal(refundableAmount(10000, 2000, 3000, 5000), 5000);
  assert.throws(() => refundableAmount(10000, 2000, 3000, 5001));
  assert.throws(() => refundableAmount(10000, 0, 0, 0));
  assert.throws(() => refundableAmount(10000, 0, 0, 1.5));
});
test("pending payment and unconfirmed supplier bookings cannot be cancelled as confirmed travel", () => {
  for (const state of ["DRAFT", "PAID", "BOOKING_PENDING", "CANCELLED"]) assert.throws(() => cancellationAllowed(state));
  assert.doesNotThrow(() => cancellationAllowed("TICKETED"));
});
test("webhook verification rejects modified bodies, malformed signatures, and wrong secrets", () => {
  const raw = '{"event":"payment.captured"}'; const key = "test-secret"; const signed = signature(raw, key);
  assert.equal(verifySignature(raw, signed, key), true);
  assert.equal(verifySignature(`${raw} `, signed, key), false);
  assert.equal(verifySignature(raw, signed, "other"), false);
  assert.equal(verifySignature(raw, "aa", key), false);
  assert.equal(verifySignature(raw, null, key), false);
  assert.notEqual(crmSignature("1", "event", raw, key), crmSignature("2", "event", raw, key));
});
test("request size limit counts streamed bytes instead of trusting Content-Length", async () => {
  await assert.rejects(boundedText(new Request("http://localhost", { method: "POST", body: "123456" }), 5));
  assert.equal(await boundedText(new Request("http://localhost", { method: "POST", body: "123" }), 5), "123");
});
test("browser mutations reject absent or foreign origins", () => {
  const before = process.env.BETTER_AUTH_URL; process.env.BETTER_AUTH_URL = "https://travel.example";
  try {
    assert.throws(() => sameOrigin(new Request("https://travel.example")));
    assert.throws(() => sameOrigin(new Request("https://travel.example", { headers: { origin: "https://evil.example" } })));
    assert.doesNotThrow(() => sameOrigin(new Request("https://travel.example", { headers: { origin: "https://travel.example" } })));
  } finally { if (before === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = before; }
});
