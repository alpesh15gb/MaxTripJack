import test from "node:test";
import assert from "node:assert/strict";
import { checkoutPaymentProvider, selectedPaymentProvider, assertNewPaymentProviderReady, assertRazorpayRecord } from "../src/lib/payment-provider";

test("new provider selection preserves historical Razorpay default", () => {
  assert.equal(selectedPaymentProvider(""), "RAZORPAY");
  assert.equal(selectedPaymentProvider("PAYGLOCAL"), "PAYGLOCAL");
  assert.throws(() => selectedPaymentProvider("typo"));
  assert.doesNotThrow(() => assertNewPaymentProviderReady("RAZORPAY"));
});
test("PayGlocal cannot be activated by an environment toggle before UAT contract verification", () => {
  assert.throws(() => assertNewPaymentProviderReady("PAYGLOCAL"));
});
test("historic reconciliation/refunds never cross providers", () => {
  assert.doesNotThrow(() => assertRazorpayRecord("RAZORPAY"));
  assert.throws(() => assertRazorpayRecord("PAYGLOCAL"));
  assert.throws(() => assertRazorpayRecord("UNKNOWN"));
});

test("stored Razorpay checkout survives selection of PayGlocal for new orders", () => {
  const provider = checkoutPaymentProvider("RAZORPAY", "PAYGLOCAL");
  assert.equal(provider, "RAZORPAY");
  assert.doesNotThrow(() => assertNewPaymentProviderReady(provider));
  assert.equal(checkoutPaymentProvider(undefined, "PAYGLOCAL"), "PAYGLOCAL");
  assert.equal(checkoutPaymentProvider("PAYGLOCAL", "RAZORPAY"), "PAYGLOCAL");
  assert.throws(() => checkoutPaymentProvider("UNKNOWN", "RAZORPAY"));
});
