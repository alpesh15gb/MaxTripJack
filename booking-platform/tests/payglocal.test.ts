import test from "node:test";
import assert from "node:assert/strict";
import { assertPayGlocalStatusBinding, assertPayGlocalTransportReady, formatPayGlocalAmount, payGlocalPaymentState, payGlocalRefundState, validatePayGlocalUrl, type PayGlocalAttempt, type PayGlocalVerifiedStatus } from "../src/lib/providers/payglocal";

const attempt: PayGlocalAttempt = { merchantTxnId: "MT1234", merchantId: "uatmerchant", gid: "gl_1234", amountMinor: 10001, currency: "INR" };
const status: PayGlocalVerifiedStatus = { source: "SERVER_STATUS", merchantTxnId: "MT1234", merchantId: "uatmerchant", gid: "gl_1234", totalAmount: "100.01", txnCurrency: "INR", status: "SENT_FOR_CAPTURE" };

test("amounts use exact currency units without floating point rounding", () => {
  for (const [minor, amount] of [[1, "0.01"], [10, "0.10"], [100, "1.00"], [10001, "100.01"], [Number.MAX_SAFE_INTEGER, "90071992547409.91"]] as const) {
    assert.equal(formatPayGlocalAmount(minor), amount);
  }
  for (const amount of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => formatPayGlocalAmount(amount));
});

test("server status must bind every stored attempt identity and financial field", () => {
  assert.doesNotThrow(() => assertPayGlocalStatusBinding(attempt, status));
  for (const changed of [{ merchantTxnId: "MT9999" }, { gid: "gl_other" }, { merchantId: "othermid" }, { totalAmount: "100.00" }, { txnCurrency: "USD" }]) {
    assert.throws(() => assertPayGlocalStatusBinding(attempt, { ...status, ...changed }));
  }
  for (const changed of [{ gid: null }, { merchantId: "" }, { merchantTxnId: "" }]) {
    assert.throws(() => assertPayGlocalStatusBinding({ ...attempt, ...changed }, status));
  }
});

test("decimal strings accept equivalent exact representations, reject coercion and precision loss", () => {
  const whole = { ...attempt, amountMinor: 10000 };
  for (const totalAmount of ["100", "100.0", "100.00"]) assert.doesNotThrow(() => assertPayGlocalStatusBinding(whole, { ...status, totalAmount }));
  for (const totalAmount of ["100.001", "1e2", " 100.00", "+100", "0100", "100.", "100,00", "NaN", "-100", "999999999999999999999999"]) {
    assert.throws(() => assertPayGlocalStatusBinding(whole, { ...status, totalAmount }));
  }
  assert.throws(() => assertPayGlocalStatusBinding(whole, { ...status, totalAmount: 100 } as unknown as PayGlocalVerifiedStatus));
});

test("callback/browser payload cannot be used as normalized verified server status", () => {
  for (const source of [undefined, "CALLBACK", "WEBHOOK", "BROWSER"]) {
    assert.throws(() => assertPayGlocalStatusBinding(attempt, { ...status, source } as unknown as PayGlocalVerifiedStatus));
  }
  // The source marker is not a signature. Production's transport remains closed,
  // preventing callers from upgrading an arbitrary shaped object into proof.
  assert.throws(assertPayGlocalTransportReady, { status: 503 });
});

test("only successful sale state maps to capture; authorization/unknown/timeout never does", () => {
  assert.equal(payGlocalPaymentState("SENT_FOR_CAPTURE"), "CAPTURED");
  for (const state of ["INPROGRESS", "AUTHORIZED"]) assert.equal(payGlocalPaymentState(state), "PENDING");
  for (const state of [undefined, null, "TIMEOUT", "FAILED", "SUCCESS", "CAPTURED", "sent_for_capture", "NEW_PROVIDER_STATE"]) {
    assert.equal(payGlocalPaymentState(state), "UNKNOWN");
  }
});

test("refund acceptance never falsely completes a customer refund", () => {
  assert.equal(payGlocalRefundState("SENT_FOR_REFUND"), "PENDING");
  for (const state of ["SUCCESS", "COMPLETED", "REFUNDED", "TIMEOUT", undefined]) assert.equal(payGlocalRefundState(state), "UNKNOWN");
});

test("validated UAT checkout and stored-gid status URLs only", () => {
  const checkout = "https://api.uat.payglocal.in/gl/payflow-ui/?x-gl-token=example";
  const check = "https://api.uat.payglocal.in/gl/v1/payments/gl_1234/status?x-gl-token=example";
  assert.equal(validatePayGlocalUrl(checkout, "redirect"), checkout);
  assert.equal(validatePayGlocalUrl(check, "status", attempt.gid!), check);
  assert.throws(() => validatePayGlocalUrl(check, "status", "gl_other"));
  assert.throws(() => validatePayGlocalUrl(check, "redirect"));
  assert.throws(() => validatePayGlocalUrl(checkout, "status"));
});

test("URLs cannot target private hosts, credentials, alternate ports or lookalike domains", () => {
  for (const url of [
    "http://api.uat.payglocal.in/gl/payflow-ui/", "https://127.0.0.1/gl/payflow-ui/",
    "https://169.254.169.254/gl/payflow-ui/", "https://api.uat.payglocal.in.evil.test/gl/payflow-ui/",
    "https://api.uat.payglocal.in@evil.test/gl/payflow-ui/", "https://user@api.uat.payglocal.in/gl/payflow-ui/",
    "https://api.uat.payglocal.in:444/gl/payflow-ui/", "https://api.uat.payglocal.in/gl/payflow-ui/#hidden",
    "https://api.prod.payglocal.in/gl/payflow-ui/", "https://api.payglocal.in/gl/payflow-ui/",
    "https://api.uat.payglocal.in/gl/other/", "https://api.uat.payglocal.in/gl/payflow-ui/\n",
    "https://api.uat.payglocal.in\\@evil.test/gl/payflow-ui/", "javascript:alert(1)", "//api.uat.payglocal.in/gl/payflow-ui/",
  ]) assert.throws(() => validatePayGlocalUrl(url, "redirect"));
});

test("transport fail-closed guard performs zero network requests", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("Network forbidden in this test"); };
  try { for (let i = 0; i < 3; i++) assert.throws(assertPayGlocalTransportReady, { status: 503 }); }
  finally { globalThis.fetch = original; }
  assert.equal(calls, 0);
});

test("hosted flight payload requires real payer billing and stable IDs without card data", async () => {
  const { buildPayGlocalCheckoutPayload } = await import("../src/lib/providers/payglocal");
  const input = {
    attempt: { ...attempt, merchantTxnId: "0123456789abcdef0123456789abcdef" }, product: "FLIGHT" as const,
    billingData: { firstName: "Test", lastName: "Payer", emailId: "payer@example.test", addressCountry: "IN", addressStreet1: "1 Example Street", addressCity: "Mumbai", addressState: "Maharashtra" },
    merchantCallbackURL: "https://merchant.example.test/api/payments/payglocal/callback", applicationOrigin: "https://merchant.example.test",
  };
  const payload = buildPayGlocalCheckoutPayload(input);
  assert.equal(payload.paymentData.totalAmount, "100.01");
  assert.equal(payload.merchantTxnId, payload.merchantUniqueId);
  assert.equal(payload.paymentData.billingData.addressCountry, "IN");
  assert.deepEqual(Object.keys(payload.paymentData).sort(), ["billingData", "totalAmount", "txnCurrency"]);
  assert.deepEqual(buildPayGlocalCheckoutPayload(input), payload); // repeated preparation is deterministic
  for (const billingData of [undefined, { ...input.billingData, emailId: "bad" }, { ...input.billingData, addressStreet1: "" }, { ...input.billingData, addressCity: "" }, { ...input.billingData, addressState: "" }, { ...input.billingData, addressCountry: "India" }]) {
    assert.throws(() => buildPayGlocalCheckoutPayload({ ...input, billingData } as typeof input));
  }
  for (const merchantCallbackURL of ["http://merchant.example.test/callback", "https://evil.test/callback", "https://user@merchant.example.test/callback", "https://merchant.example.test/callback#x"]) {
    assert.throws(() => buildPayGlocalCheckoutPayload({ ...input, merchantCallbackURL }));
  }
  assert.throws(() => buildPayGlocalCheckoutPayload({ ...input, attempt: { ...input.attempt, merchantTxnId: "hyphen-not-allowed" } }));
});
