import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

/** @typedef {Record<string, string | undefined>} Environment */
/** @typedef {{query:(sql:string)=>Promise<{rows:Record<string,unknown>[]}>,end:()=>Promise<unknown>}} DiagnosticPool */
/** @typedef {{environment?:Environment,fetch?:typeof fetch,createPool?:(configuration:import('pg').PoolConfig)=>DiagnosticPool,checkRazorpay?:boolean,timeoutMs?:number}} Dependencies */

const NETWORK_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 65_536;
const bool = value => typeof value === "boolean" ? value : null;
const provider = value => value === "RAZORPAY" || value === "PAYGLOCAL" ? value : "unknown";
const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const present = value => typeof value === "string" && value.trim().length > 0;

// No table contents, account identifiers, usernames or credentials are returned.
// Permission checks use the role from the runtime DATABASE_URL, not the owner URL.
export const DATABASE_DIAGNOSTIC_SQL = `WITH relations AS (
  SELECT to_regclass('public.auth_phone_challenges') AS challenge,
         to_regclass('public."user"') AS auth_user
), fields AS (
  SELECT *,
    EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=auth_user AND attname='phoneNumber' AND attnum>0 AND NOT attisdropped) AS phone_column,
    EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=auth_user AND attname='phoneNumberVerified' AND attnum>0 AND NOT attisdropped) AS verified_column
  FROM relations
)
SELECT current_user='maxtravel_app' AS expected_runtime_role,
  challenge IS NOT NULL AS challenge_table,
  COALESCE(has_table_privilege(current_user,challenge,'SELECT'),false) AS challenge_select,
  COALESCE(has_table_privilege(current_user,challenge,'INSERT'),false) AS challenge_insert,
  COALESCE(has_table_privilege(current_user,challenge,'UPDATE'),false) AS challenge_update,
  COALESCE(has_table_privilege(current_user,challenge,'DELETE'),false) AS challenge_delete,
  phone_column, verified_column,
  CASE WHEN phone_column THEN has_column_privilege(current_user,auth_user,'phoneNumber','SELECT') ELSE false END AS phone_select,
  CASE WHEN phone_column THEN has_column_privilege(current_user,auth_user,'phoneNumber','INSERT') ELSE false END AS phone_insert,
  CASE WHEN phone_column THEN has_column_privilege(current_user,auth_user,'phoneNumber','UPDATE') ELSE false END AS phone_update,
  CASE WHEN verified_column THEN has_column_privilege(current_user,auth_user,'phoneNumberVerified','SELECT') ELSE false END AS verified_select,
  CASE WHEN verified_column THEN has_column_privilege(current_user,auth_user,'phoneNumberVerified','INSERT') ELSE false END AS verified_insert,
  CASE WHEN verified_column THEN has_column_privilege(current_user,auth_user,'phoneNumberVerified','UPDATE') ELSE false END AS verified_update
FROM fields`;

/** @template T @param {Promise<T>} work @param {number} milliseconds */
async function bounded(work, milliseconds) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("diagnostic_timeout")), milliseconds); })]);
  } finally { clearTimeout(timer); }
}

/** @param {Response} response */
async function boundedJSON(response) {
  if (!response.body || !response.headers.get("content-type")?.toLowerCase().includes("application/json") || Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {}); throw Error("invalid_response");
  }
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); throw Error("invalid_response"); }
      chunks.push(value);
    }
    return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally { reader.releaseLock(); }
}

/** All requests are read-only, bounded, and never follow credential-bearing redirects.
 * @param {typeof fetch} fetcher @param {string} url @param {Record<string,string>} headers @param {number} timeoutMs @param {boolean} [discardBody]
 */
async function request(fetcher, url, headers, timeoutMs, discardBody = false) {
  const controller = new AbortController(); let httpStatus = null, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await bounded((async () => {
      const response = await fetcher(url, { method: "GET", headers, redirect: "manual", cache: "no-store", signal: controller.signal });
      httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      if (!response.ok || discardBody) {
        void response.body?.cancel().catch(() => {});
        return { outcome: response.ok ? "ok" : "http_error", httpStatus, data: {} };
      }
      try { return { outcome: "ok", httpStatus, data: await boundedJSON(response) }; }
      catch { return { outcome: timedOut ? "diagnostic_timeout" : "invalid_response", httpStatus, data: {} }; }
    })(), timeoutMs);
  } catch { return { outcome: timedOut ? "diagnostic_timeout" : "network_error", httpStatus, data: {} }; }
  finally { clearTimeout(timer); controller.abort(); }
}

/** @param {Environment} environment */
function evolutionConfiguration(environment) {
  const base = environment.EVOLUTION_API_URL?.trim(), apiKey = environment.EVOLUTION_API_KEY?.trim(), instance = environment.EVOLUTION_INSTANCE?.trim();
  if (!base || !apiKey || !instance || instance.length > 128 || /[\x00-\x1f\x7f-\x9f/\\?#]/.test(instance) || instance === "." || instance === ".." || /[\r\n\0]/.test(apiKey)) return null;
  try {
    const url = new URL(base);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return { url: `${url.toString().replace(/\/+$/, "")}/instance/connectionState/${encodeURIComponent(instance)}`, apiKey };
  } catch { return null; }
}

/** @param {Environment} environment @param {Dependencies['createPool']} createPool */
async function diagnoseDatabase(environment, createPool) {
  const empty = { outcome: "configuration_missing", runtimeRoleExpected: null, challengeTablePresent: null,
    challengePrivileges: { select: null, insert: null, update: null, delete: null },
    phoneNumber: { present: null, select: null, insert: null, update: null },
    phoneNumberVerified: { present: null, select: null, insert: null, update: null } };
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) return empty;
  try { const url = new URL(connectionString); if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error(); }
  catch { return { ...empty, outcome: "configuration_invalid" }; }
  let pool;
  try {
    const configuration = { connectionString, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 5_000,
      query_timeout: 6_000, idleTimeoutMillis: 1_000, allowExitOnIdle: true, options: "-c default_transaction_read_only=on" };
    pool = createPool ? createPool(configuration) : new Pool(configuration);
    // Unexpected idle-client errors must not print a credential-bearing stack.
    if ("on" in pool && typeof pool.on === "function") pool.on("error", () => {});
    const result = await bounded(pool.query(DATABASE_DIAGNOSTIC_SQL), 7_000);
    const row = record(result?.rows?.[0]);
    return { outcome: "ok", runtimeRoleExpected: bool(row.expected_runtime_role), challengeTablePresent: bool(row.challenge_table),
      challengePrivileges: { select: bool(row.challenge_select), insert: bool(row.challenge_insert), update: bool(row.challenge_update), delete: bool(row.challenge_delete) },
      phoneNumber: { present: bool(row.phone_column), select: bool(row.phone_select), insert: bool(row.phone_insert), update: bool(row.phone_update) },
      phoneNumberVerified: { present: bool(row.verified_column), select: bool(row.verified_select), insert: bool(row.verified_insert), update: bool(row.verified_update) } };
  } catch { return { ...empty, outcome: "database_error" }; }
  finally { if (pool) await bounded(pool.end(), 1_000).catch(() => {}); }
}

/** No raw bodies, errors, environment values or URLs may enter the returned report.
 * The timeout is intentionally shorter than normal booking requests: it diagnoses
 * this probe only and does not establish that a supplier or checkout is down.
 * @param {Dependencies} [dependencies]
 */
export async function diagnoseCheckout(dependencies = {}) {
  const { environment = process.env, fetch: fetcher = fetch, createPool, checkRazorpay = false } = dependencies;
  const timeoutMs = Math.max(1, Math.min(Number.isFinite(dependencies.timeoutMs) ? dependencies.timeoutMs : NETWORK_TIMEOUT_MS, NETWORK_TIMEOUT_MS));
  const configuredPort = Number(environment.PORT);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 3000;
  const local = path => request(fetcher, `http://127.0.0.1:${port}${path}`, { Accept: "application/json" }, timeoutMs);
  const evolution = evolutionConfiguration(environment);
  const testKey = /^rzp_test_[A-Za-z0-9]+$/.test(environment.RAZORPAY_KEY_ID ?? "");
  const secretPresent = present(environment.RAZORPAY_KEY_SECRET);
  const skipped = outcome => ({ outcome, httpStatus: null, data: {} });
  // Keep this key selection identical to providers/tripjack-key.ts: no fallback
  // between FLIGHT and HOTEL, and trim each product's own server-side key.
  const tripjack = product => {
    const key = environment[product === "FLIGHT" ? "TRIPJACK_FLIGHT_API_KEY" : "TRIPJACK_HOTEL_API_KEY"]?.trim();
    return key ? request(fetcher, "https://apitest.tripjack.com/ums/v1/user-detail", { apikey: key, Accept: "application/json", "Content-Type": "application/json" }, timeoutMs) : Promise.resolve(skipped("configuration_missing"));
  };
  const [health, channels, payment, connection, database, razorpay, flight, hotel] = await Promise.all([
    local("/api/health"), local("/api/auth/channels"), local("/api/payments/config"),
    evolution ? request(fetcher, evolution.url, { apikey: evolution.apiKey, Accept: "application/json" }, timeoutMs) : Promise.resolve(skipped("configuration_missing_or_invalid")),
    diagnoseDatabase(environment, createPool),
    checkRazorpay && testKey && secretPresent ? request(fetcher, "https://api.razorpay.com/v1/orders?count=1", {
      Authorization: `Basic ${Buffer.from(`${environment.RAZORPAY_KEY_ID}:${environment.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
    }, timeoutMs, true) : Promise.resolve(skipped(!checkRazorpay ? "not_requested" : !testKey ? "test_key_required" : "configuration_missing")),
    tripjack("FLIGHT"), tripjack("HOTEL"),
  ]);
  const status = result => ({ outcome: result.outcome, httpStatus: result.httpStatus });
  const supplier = result => {
    const wallet = result.data.walletBalance;
    const numericWallet = typeof wallet === "number" || (typeof wallet === "string" && wallet.trim().length > 0);
    return { ...status(result), success: bool(record(result.data.status).success), walletBalanceFinite: numericWallet && Number.isFinite(Number(wallet)) };
  };
  const connectionState = record(connection.data.instance).state;
  return {
    diagnostic: { readOnly: true, timeoutMs, timeoutScope: "diagnostic_only", confirmsBookingOrPayment: false },
    configuration: { paymentProvider: provider(environment.PAYMENT_PROVIDER || "PAYGLOCAL"), razorpayTestKeyPresent: testKey, razorpaySecretPresent: secretPresent,
      evolutionUrlPresent: present(environment.EVOLUTION_API_URL), evolutionKeyPresent: present(environment.EVOLUTION_API_KEY), evolutionInstancePresent: present(environment.EVOLUTION_INSTANCE),
      evolutionConfigurationValid: evolution !== null, evolutionExpectedInstanceMatch: environment.EVOLUTION_INSTANCE?.trim() === "max travel",
      tripjackFlightKeyPresent: present(environment.TRIPJACK_FLIGHT_API_KEY), tripjackHotelKeyPresent: present(environment.TRIPJACK_HOTEL_API_KEY) },
    local: { health: { ...status(health), status: health.data.status === "ready" ? "ready" : health.httpStatus === 503 ? "unavailable" : "unknown" },
      authChannels: { ...status(channels), email: bool(channels.data.email), whatsapp: bool(channels.data.whatsapp) },
      paymentsConfig: { ...status(payment), provider: provider(payment.data.provider), configured: bool(payment.data.configured) } },
    evolution: { ...status(connection), state: ["open", "connecting", "close"].includes(connectionState) ? connectionState : "unknown" },
    database,
    tripjack: { flight: supplier(flight), hotel: supplier(hotel) },
    razorpayCredentialCheck: { ...status(razorpay), authentication: razorpay.httpStatus === 200 ? "accepted" : [401, 403].includes(razorpay.httpStatus) ? "rejected" : "unknown" },
  };
}

/** @param {Dependencies & {report?:(message:string)=>void}} [dependencies] */
export async function runCheckoutDiagnostics(dependencies = {}) {
  const report = dependencies.report ?? (message => console.log(message));
  try { report(JSON.stringify(await diagnoseCheckout(dependencies), null, 2)); return 0; }
  catch { report(JSON.stringify({ diagnostic: { outcome: "diagnostic_failed" } })); return 1; }
}

// `node --input-type=module - < scripts/diagnose-checkout.mjs` supports an older
// running image that has not copied this new script yet. Imports remain inert.
if (process.argv[1] === "-" || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  void runCheckoutDiagnostics({ checkRazorpay: process.argv.includes("--check-razorpay") }).then(code => { process.exitCode = code; });
}
