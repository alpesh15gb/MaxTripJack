import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const bookingMigrations = ["001-booking-platform", "002-provider-integration", "003-booking-details", "004-operations", "005-cancellation-offers", "006-flight-amendments", "007-delivery", "008-catalogue", "009-security-operations", "010-cancellation-polling", "011-payment-method", "012-partial-cancellation", "013-flight-services", "014-crm-commands", "015-fare-validation", "016-payglocal", "017-payglocal-recovery", "018-payglocal-webhooks", "019-cancellation-reconciliation", "020-whatsapp-verification", "021-company-settings", "022-pricing-promos", "023-promo-discovery", "024-travel-enquiries", "025-safar-enquiry-destination", "026-hotel-catalogue", "027-flight-route-catalogue", "028-hotel-catalogue-priority", "029-hotel-catalogue-search", "030-flight-fare-calendar", "031-guest-checkout", "032-flight-fare-calendar-verified", "033-office-enquiries", "034-hotel-catalogue-photo-order"];

/** @typedef {{query:(sql:string,values?:string[])=>Promise<{rowCount?:number|null}>,release:()=>void}} MigrationClient */
/** @typedef {{connect:()=>Promise<MigrationClient>,end:()=>Promise<void>}} MigrationPool */
/** @param {{environment?:Record<string,string|undefined>,createPool?:(connectionString:string)=>MigrationPool,readMigration?:(name:string)=>Promise<string>,report?:(message:string)=>void,reportError?:(message:string)=>void}} [dependencies] */
export async function migrateBookingSchema(dependencies = {}) {
  const {environment = process.env,
    createPool = connectionString => new Pool({connectionString, max:1, connectionTimeoutMillis:15_000, lock_timeout:30_000, statement_timeout:240_000, query_timeout:250_000}),
    readMigration = name => readFile(new URL(`../db/${name}.sql`, import.meta.url), "utf8"),
    report = message => console.log(message), reportError = message => console.error(message),
  } = dependencies;
  /** @type {MigrationPool|undefined} */ let pool;
  /** @type {MigrationClient|undefined} */ let client;
  let exitCode = 0;
  try {
    const connectionString = environment.MIGRATION_DATABASE_URL || environment.DATABASE_URL;
    if (!connectionString) throw Error();
    // Construction and connection errors may contain a URL or credentials. Keep
    // every database operation inside this sanitized boundary, including cleanup.
    pool = createPool(connectionString);
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(71266301)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of bookingMigrations) {
      const existing = await client.query("SELECT name FROM schema_migrations WHERE name=$1", [name]);
      if (!existing.rowCount) {
        await client.query(await readMigration(name));
        await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      }
    }
    await client.query("COMMIT");
    report("Booking schema is up to date.");
  } catch {
    if (client) try { await client.query("ROLLBACK"); } catch { /* A disconnected transaction rolls back server-side. */ }
    reportError("Migration did not complete. Verify schema status before retrying; check database connectivity/schema compatibility.");
    exitCode = 1;
  } finally {
    try { client?.release(); await pool?.end(); }
    catch { reportError("Migration connection cleanup failed. Verify schema status before retrying."); exitCode = 1; }
  }
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void migrateBookingSchema().then(exitCode => { process.exitCode = exitCode; });
}
