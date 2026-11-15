import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { diagnoseCheckout, runCheckoutDiagnostics, DATABASE_DIAGNOSTIC_SQL } from "../scripts/diagnose-checkout.mjs";

const fixture = () => ({
  DATABASE_URL: "postgresql://runtime:private-runtime-secret@synthetic-db:5432/travel",
  MIGRATION_DATABASE_URL: "postgresql://owner:private-owner-secret@owner-db:5432/travel",
  POSTGRES_PASSWORD: "private-owner-password", PAYMENT_PROVIDER: "RAZORPAY", PORT: "3000",
  RAZORPAY_KEY_ID: "rzp_test_synthetic", RAZORPAY_KEY_SECRET: "private-razorpay-secret",
  EVOLUTION_API_URL: "https://private-evolution.example.test", EVOLUTION_API_KEY: "private-evolution-secret", EVOLUTION_INSTANCE: "max travel",
  TRIPJACK_FLIGHT_API_KEY: "  private-flight-key\r\n", TRIPJACK_HOTEL_API_KEY: "\tprivate-hotel-key ",
});
const row = () => ({ expected_runtime_role: true, challenge_table: true,
  challenge_select: true, challenge_insert: true, challenge_update: true, challenge_delete: true,
  phone_column: true, verified_column: true, phone_select: true, phone_insert: true, phone_update: true,
  verified_select: true, verified_insert: true, verified_update: true });
const json = (data: unknown, status = 200) => Response.json(data, { status });
const noSecrets = (result: unknown) => {
  const text = typeof result === "string" ? result : JSON.stringify(result);
  assert.doesNotMatch(text, /private-|https?:|postgresql:|synthetic-db|owner-db|rzp_test_|max travel|919876543210|Traveller Name|order_secret|7654321|Error:|ECONNREFUSED/);
};
const ordinaryFetch: typeof fetch = async input => {
  const url = String(input);
  if (url.endsWith("/api/health")) return json({ status: "ready" });
  if (url.endsWith("/api/auth/channels")) return json({ email: true, whatsapp: true });
  if (url.endsWith("/api/payments/config")) return json({ provider: "RAZORPAY", configured: true });
  if (url.includes("connectionState")) return json({ instance: { state: "open", instanceName: "max travel", owner: "919876543210" } });
  if (url.includes("tripjack")) return json({ status: { success: true }, walletBalance: 7654321, name: "Traveller Name", email: "private-person@example.test" });
  return json({ items: [{ id: "order_secret", receipt: "private-order-receipt" }] });
};

test("diagnostics make only bounded GET requests and use the actual runtime role for read-only schema/privilege checks", async () => {
  const environment = fixture(), calls: { url: string; options: RequestInit }[] = [];
  let ended = 0, queries = 0;
  const result = await diagnoseCheckout({ environment, checkRazorpay: true, fetch: async (input, options) => {
    calls.push({ url: String(input), options: options! }); return ordinaryFetch(input, options);
  }, createPool(configuration) {
    assert.equal(configuration.connectionString, environment.DATABASE_URL);
    assert.notEqual(configuration.connectionString, environment.MIGRATION_DATABASE_URL);
    assert.equal(configuration.options, "-c default_transaction_read_only=on");
    for (const value of [configuration.connectionTimeoutMillis, configuration.statement_timeout, configuration.query_timeout]) assert.ok(typeof value === "number" && value > 0 && value <= 7_000);
    return { async query(sql) { queries++; assert.equal(sql, DATABASE_DIAGNOSTIC_SQL); return { rows: [row()] }; }, async end() { ended++; } };
  } });
  assert.equal(calls.length, 7); assert.equal(queries, 1); assert.equal(ended, 1);
  for (const { url, options } of calls) {
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "manual"); assert.equal(options.body, undefined); assert.ok(options.signal instanceof AbortSignal);
    assert.doesNotMatch(url, /sendText|create|book|sign-in|send-otp/);
  }
  const connection = calls.find(call => call.url.includes("connectionState"))!;
  assert.equal(connection.url, "https://private-evolution.example.test/instance/connectionState/max%20travel");
  assert.equal(new Headers(connection.options.headers).get("apikey"), environment.EVOLUTION_API_KEY);
  const tripjack = calls.filter(call => call.url.includes("tripjack"));
  assert.equal(tripjack.length, 2);
  assert.deepEqual(tripjack.map(call => new Headers(call.options.headers).get("apikey")), ["private-flight-key", "private-hotel-key"]);
  assert.ok(tripjack.every(call => call.url === "https://apitest.tripjack.com/ums/v1/user-detail"));
  const razorpay = calls.find(call => call.url.includes("razorpay"))!;
  assert.equal(razorpay.url, "https://api.razorpay.com/v1/orders?count=1");
  assert.equal(new Headers(razorpay.options.headers).get("Authorization"), `Basic ${Buffer.from(`${environment.RAZORPAY_KEY_ID}:${environment.RAZORPAY_KEY_SECRET}`).toString("base64")}`);
  assert.equal(result.local.health.status, "ready"); assert.equal(result.local.authChannels.whatsapp, true);
  assert.equal(result.evolution.state, "open"); assert.equal(result.configuration.evolutionExpectedInstanceMatch, true);
  assert.equal(result.database.runtimeRoleExpected, true); assert.equal(result.database.challengePrivileges.insert, true);
  assert.deepEqual(result.tripjack.flight, { outcome: "ok", httpStatus: 200, success: true, walletBalanceFinite: true });
  assert.equal(result.razorpayCredentialCheck.authentication, "accepted");
  assert.equal(result.diagnostic.timeoutScope, "diagnostic_only"); assert.equal(result.diagnostic.confirmsBookingOrPayment, false);
  noSecrets(result);
});

test("missing configuration stays explicit, missing schema/permissions remain individual booleans, and no owner fallback occurs", async () => {
  const calls: string[] = [];
  const result = await diagnoseCheckout({ environment: { MIGRATION_DATABASE_URL: fixture().MIGRATION_DATABASE_URL },
    fetch: async (input, options) => { calls.push(String(input)); return ordinaryFetch(input, options); },
    createPool() { throw Error("must not connect with owner configuration"); }, checkRazorpay: true });
  assert.equal(calls.length, 3); assert.ok(calls.every(url => url.startsWith("http://127.0.0.1:3000/api/")));
  assert.equal(result.database.outcome, "configuration_missing"); assert.equal(result.evolution.outcome, "configuration_missing_or_invalid");
  assert.equal(result.tripjack.flight.outcome, "configuration_missing"); assert.equal(result.razorpayCredentialCheck.outcome, "test_key_required");
  assert.equal(result.configuration.razorpayTestKeyPresent, false); assert.equal(result.configuration.razorpaySecretPresent, false);
  const restricted = await diagnoseCheckout({ environment: fixture(), fetch: ordinaryFetch, createPool: () => ({
    async query() { return { rows: [{ ...row(), expected_runtime_role: false, challenge_table: false, challenge_select: false, challenge_insert: false, challenge_update: false, challenge_delete: false, verified_column: false, verified_select: false, verified_insert: false, verified_update: false }] }; }, async end() {},
  }) });
  assert.equal(restricted.database.outcome, "ok"); assert.equal(restricted.database.runtimeRoleExpected, false);
  assert.equal(restricted.database.challengeTablePresent, false);
  assert.deepEqual(restricted.database.challengePrivileges, { select: false, insert: false, update: false, delete: false });
  assert.deepEqual(restricted.database.phoneNumberVerified, { present: false, select: false, insert: false, update: false });
  assert.equal(restricted.database.phoneNumber.present, true);
  noSecrets(result); noSecrets(restricted);
});

test("Razorpay check is opt-in, refuses live keys, and discards order bodies without reading them", async () => {
  let checks = 0, cancelled = 0;
  const fetcher: typeof fetch = async (input, options) => {
    if (String(input).includes("razorpay")) {
      checks++;
      return new Response(new ReadableStream({ pull() { throw Error("private-order-data must not be read"); }, cancel() { cancelled++; } }), { status: 200 });
    }
    return ordinaryFetch(input, options);
  };
  const environment = { ...fixture(), DATABASE_URL: "" };
  const disabled = await diagnoseCheckout({ environment, fetch: fetcher });
  assert.equal(disabled.razorpayCredentialCheck.outcome, "not_requested"); assert.equal(checks, 0);
  const live = await diagnoseCheckout({ environment: { ...environment, RAZORPAY_KEY_ID: "rzp_live_private" }, fetch: fetcher, checkRazorpay: true });
  assert.equal(live.razorpayCredentialCheck.outcome, "test_key_required"); assert.equal(checks, 0);
  const missingSecret = await diagnoseCheckout({ environment: { ...environment, RAZORPAY_KEY_SECRET: "" }, fetch: fetcher, checkRazorpay: true });
  assert.equal(missingSecret.razorpayCredentialCheck.outcome, "configuration_missing"); assert.equal(checks, 0);
  const checked = await diagnoseCheckout({ environment, fetch: fetcher, checkRazorpay: true });
  assert.equal(checked.razorpayCredentialCheck.authentication, "accepted"); assert.equal(checks, 1); assert.equal(cancelled, 1);
  noSecrets(checked);
});

test("provider redirects, malformed bodies, unexpected states and credential rejection cannot leak response content", async () => {
  const output: string[] = [];
  const result = await runCheckoutDiagnostics({ environment: fixture(), checkRazorpay: true, report: value => output.push(value),
    fetch: async input => {
      const url = String(input);
      if (url.includes("connectionState")) return json({ instance: { state: "private-phone-919876543210", owner: "private-person" } });
      if (url.includes("razorpay")) return json({ error: "private-secret order_secret" }, 401);
      if (url.includes("tripjack")) return new Response("private-provider-error", { status: 302, headers: { location: "https://private-secret.example.test" } });
      if (url.endsWith("/api/health")) return json({ status: "unavailable", error: "private-error" }, 503);
      if (url.endsWith("/api/auth/channels")) return json({ email: "private-secret", whatsapp: "private-secret" });
      return new Response("private-secret", { status: 200, headers: { "content-type": "text/plain" } });
    }, createPool: () => ({ async query() { throw Error("ECONNREFUSED postgresql://private-secret@synthetic-db"); }, async end() {} }),
  });
  assert.equal(result, 0); assert.equal(output.length, 1); noSecrets(output[0]);
  const report = JSON.parse(output[0]);
  assert.equal(report.evolution.state, "unknown"); assert.equal(report.razorpayCredentialCheck.authentication, "rejected");
  assert.equal(report.tripjack.flight.httpStatus, 302); assert.equal(report.tripjack.flight.success, null);
  assert.equal(report.local.health.status, "unavailable"); assert.equal(report.local.authChannels.email, null);
  assert.equal(report.local.paymentsConfig.outcome, "invalid_response"); assert.equal(report.database.outcome, "database_error");
});

test("invalid Evolution configuration never sends a key and product keys never fall back to another product", async () => {
  for (const EVOLUTION_API_URL of ["https://private-user:private-password@example.test", "https://example.test/?private-secret", "file:///private-secret"]) {
    const calls: string[] = [];
    const report = await diagnoseCheckout({ environment: { ...fixture(), DATABASE_URL: "", EVOLUTION_API_URL, TRIPJACK_HOTEL_API_KEY: "  " }, fetch: async (input, options) => { calls.push(String(input)); return ordinaryFetch(input, options); } });
    assert.equal(report.configuration.evolutionConfigurationValid, false); assert.equal(calls.length, 4);
    assert.equal(report.tripjack.hotel.outcome, "configuration_missing"); assert.equal(report.tripjack.flight.outcome, "ok");
    noSecrets(report);
  }
});

test("timeout is bounded even for stalled transport or a stalled body, and reports only diagnostic timeout", async () => {
  const start = Date.now();
  const result = await diagnoseCheckout({ environment: {}, timeoutMs: 20, fetch: async input => {
    if (String(input).endsWith("/api/health")) return new Promise(() => {});
    return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } });
  } });
  assert.ok(Date.now() - start < 1_000);
  for (const value of Object.values(result.local)) assert.equal(value.outcome, "diagnostic_timeout");
  assert.equal(result.diagnostic.timeoutMs, 20); noSecrets(result);
});

test("oversized provider JSON and untrusted SQL result fields become safe fixed metadata", async () => {
  const result = await diagnoseCheckout({ environment: fixture(), fetch: async input => String(input).includes("connectionState")
    ? new Response('"private-secret"', { headers: { "content-type": "application/json", "content-length": "65537" } })
    : ordinaryFetch(input), createPool: () => ({ async query() { return { rows: [{ ...row(), expected_runtime_role: "private-secret", challenge_select: "private-secret" }] }; }, async end() {} }) });
  assert.equal(result.evolution.outcome, "invalid_response"); assert.equal(result.database.runtimeRoleExpected, null);
  assert.equal(result.database.challengePrivileges.select, null); noSecrets(result);
  assert.doesNotMatch(DATABASE_DIAGNOSTIC_SQL, /\b(?:GRANT|ALTER|CREATE|DROP|TRUNCATE|SET|INSERT INTO|UPDATE\s+\"|DELETE FROM)\b/i);
  assert.match(DATABASE_DIAGNOSTIC_SQL, /has_table_privilege\(current_user,challenge,'DELETE'\)/);
  assert.match(DATABASE_DIAGNOSTIC_SQL, /has_column_privilege\(current_user,auth_user,'phoneNumberVerified','UPDATE'\)/);
});

test("supplier wallet metadata accepts numeric strings without coercing empty or nonnumeric values", async () => {
  const environment = { ...fixture(), DATABASE_URL: "" };
  for (const [walletBalance, expected] of [
    [7654321, true], ["7654321.50", true], [" 0 ", true],
    [null, false], [true, false], [false, false], [{}, false], [[], false],
    ["", false], [" \t ", false], ["private-wallet", false], ["Infinity", false], ["1e999", false],
  ] as const) {
    const result = await diagnoseCheckout({ environment, fetch: async (input, options) => String(input).includes("tripjack")
      ? json({ status: { success: true }, walletBalance }) : ordinaryFetch(input, options) });
    assert.equal(result.tripjack.flight.walletBalanceFinite, expected);
    assert.equal(result.tripjack.hotel.walletBalanceFinite, expected);
    noSecrets(result);
  }
  const missing = await diagnoseCheckout({ environment, fetch: async (input, options) => String(input).includes("tripjack")
    ? json({ status: { success: true } }) : ordinaryFetch(input, options) });
  assert.equal(missing.tripjack.flight.walletBalanceFinite, false);
  noSecrets(missing);
});

test("stdin operator invocation executes its guard and prints only synthetic safe output", () => {
  const source = readFileSync(new URL("../scripts/diagnose-checkout.mjs", import.meta.url), "utf8");
  const environment = { ...process.env, DATABASE_URL: "", MIGRATION_DATABASE_URL: "", EVOLUTION_API_URL: "", EVOLUTION_API_KEY: "", EVOLUTION_INSTANCE: "",
    RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", TRIPJACK_FLIGHT_API_KEY: "", TRIPJACK_HOTEL_API_KEY: "", NODE_OPTIONS: "" };
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], { cwd: process.cwd(), env: environment, encoding: "utf8", timeout: 10_000,
    input: `globalThis.fetch=async()=>Response.json({status:'ready',email:true,whatsapp:false,provider:'RAZORPAY',configured:true});\n${source}` });
  assert.equal(child.error, undefined); assert.equal(child.status, 0); assert.equal(child.stderr, "");
  const report = JSON.parse(child.stdout);
  assert.equal(report.local.health.status, "ready"); assert.equal(report.local.authChannels.whatsapp, false);
  assert.equal(report.database.outcome, "configuration_missing"); assert.equal(report.razorpayCredentialCheck.outcome, "not_requested");
  noSecrets(child.stdout);
});
