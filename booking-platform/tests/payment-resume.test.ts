import test from "node:test";
import assert from "node:assert/strict";
import { paymentResumeStatus, type PaymentResumeRecord } from "../src/lib/payment-resume";
const now = Date.now();
const record: PaymentResumeRecord = { id: "booking", status: "PAYMENT_PENDING", total_minor: "10000", quote_expires_at: new Date(now + 1000), fare_validation_state:null,booking_validation_state:null,intent_state: "CREATED", gateway_order_id: "order_existing", payment_status: "CREATED", amount_minor: "10000", currency: "INR" };
test("only a fresh matching existing unpaid order can resume without a new payment", () => {
  const result = paymentResumeStatus(record, now);
  assert.equal(result.canResume, true);
  assert.equal(result.orderId, "order_existing");
  assert.equal(result.amount, 10000);
});
test("expired, unknown, authorized, captured and terminal checkouts never reopen", () => {
  for (const changed of [{ quote_expires_at: new Date(now) }, { quote_expires_at: "invalid" }, { quote_expires_at: null }, { fare_validation_state:"BLOCKED" }, { fare_validation_state:"STARTED" }, { booking_validation_state:"SUCCEEDED" }, { booking_validation_state:"BLOCKED" }, { intent_state: "STARTED" }, { intent_state: "UNKNOWN" }, { payment_status: "CAPTURED" }, { payment_status: "AUTHORIZED" }, { status: "PAID" }, { status: "BOOKING_PENDING" }, { status: "MANUAL_REVIEW" }, { status: "TICKETED" }, { status: "CANCELLED" }, { amount_minor: "9999" }, { currency: "USD" }, { gateway_order_id: null }]) {
    const result = paymentResumeStatus({ ...record, ...changed }, now);
    assert.equal(result.canResume, false);
    assert.equal("orderId" in result, false);
    assert.equal("amount" in result, false);
  }
});
