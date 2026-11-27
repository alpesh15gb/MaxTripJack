import assert from "node:assert/strict";
import test from "node:test";
import { checkedPayment, checkedPaymentRecovery } from "../src/payment-recovery.ts";

const bookingId = "48243614-6700-4a32-b5f1-9ad8a98c8a42";
const quoteId = "2c4f45b1-ef93-4037-98eb-d2155a40ef29";
const gateway = { bookingId, orderId: "order_Synthetic", keyId: "rzp_test_Synthetic", amount: 99400, currency: "INR" };
const now = Date.parse("2026-11-27T00:00:00Z");
const status = {
  ...gateway, found: true, canResume: true, checkoutResolved: false, status: "PAYMENT_PENDING",
  quoteExpiresAt: "2026-11-27T00:03:00Z",
};

test("initial gateway launch checks reference, approved provider, amount and currency", () => {
  assert.equal(checkedPayment(gateway, gateway.amount).provider, "RAZORPAY");
  assert.deepEqual(checkedPayment({ bookingId, free: true, amount: 0, currency: "INR" }, 0), {
    bookingId, free: true, amount: 0, currency: "INR",
  });
  for (const patch of [
    { bookingId: "unverified" }, { amount: 99 }, { currency: "USD" },
    { provider: "UNKNOWN" }, { keyId: "rzp_live_Synthetic" }, { free: true },
  ]) assert.throws(() => checkedPayment({ ...gateway, ...patch }, gateway.amount));
});

test("recovery resumes only a fresh existing Razorpay or hosted checkout", () => {
  assert.equal(checkedPaymentRecovery(status, quoteId, now).resumable.orderId, gateway.orderId);
  const hosted = { ...status, provider: "PAYGLOCAL", checkoutUrl: "https://api.uat.payglocal.in/gl/payflow-ui/?token=Synthetic" };
  assert.equal(checkedPaymentRecovery(hosted, quoteId, now).resumable.checkoutUrl, hosted.checkoutUrl);
  assert.equal(checkedPaymentRecovery({ ...status, quoteExpiresAt: new Date(now).toISOString() }, quoteId, now).resumable, null);
  assert.equal(checkedPaymentRecovery({ ...status, canResume: false }, quoteId, now).resumable, null);
  assert.throws(() => checkedPaymentRecovery({ ...hosted, checkoutUrl: "https://booking.example.com/" }, quoteId, now));
});

test("missing orders stay locked except for a matching server-confirmed expiry", () => {
  const expired = { found: false, quoteId, checkoutResolved: true, canResume: false, status: "EXPIRED_WITHOUT_PAYMENT" };
  assert.equal(checkedPaymentRecovery(expired, quoteId, now).state, "expired");
  assert.equal(checkedPaymentRecovery(expired, bookingId, now).state, "outstanding");
  assert.equal(checkedPaymentRecovery({ ...expired, checkoutResolved: false }, quoteId, now).state, "outstanding");
  assert.equal(checkedPaymentRecovery({ ...expired, status: "OUTCOME_UNCONFIRMED" }, quoteId, now).state, "outstanding");
});

test("terminal order recovery requires proof and a valid booking reference", () => {
  const settled = { ...status, status: "BOOKING_PENDING", checkoutResolved: true, canResume: false };
  assert.equal(checkedPaymentRecovery(settled, quoteId, now).state, "resolved");
  assert.equal(checkedPaymentRecovery({ ...settled, status: "PAYMENT_PENDING" }, quoteId, now).state, "outstanding");
  assert.equal(checkedPaymentRecovery({ ...settled, bookingId: "invalid" }, quoteId, now).state, "outstanding");
});
