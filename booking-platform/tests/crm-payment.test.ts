import test from "node:test";
import assert from "node:assert/strict";
import { crmPayment } from "../src/lib/crm-payment";

for (const provider of ["RAZORPAY", "PAYGLOCAL"] as const) {
  test(`CRM payment projection preserves ${provider} without private provider metadata`, () => {
    const created = new Date("2026-10-20T00:00:00Z");
    const payment = {
      id: "payment-fixture", gateway_payment_id: "provider-reference", provider,
      method: null, amount_minor: "12345", status: "CAPTURED", created_at: created,
      private_provider_payload: { credential: "must-not-be-forwarded" },
    };
    assert.deepEqual(crmPayment(payment), {
      id: "payment-fixture", reference: "provider-reference", provider,
      method: null, amountMinor: 12345, status: "CAPTURED", createdAt: created,
    });
    assert.equal(crmPayment({ ...payment, method: "card" }).method, "card");
  });
}
