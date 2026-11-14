import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";

/** @typedef {Record<string, string | undefined>} Environment */

/** Keep the existing database target; replace credentials only for this one-off
 * process. Pre-encode percent signs because URL setters otherwise preserve them.
 * @param {Environment} environment
 */
export function migrationDatabaseURL(environment) {
  const explicit = environment.MIGRATION_DATABASE_URL?.trim();
  const supplied = explicit || environment.DATABASE_URL?.trim();
  try {
    if (!supplied || /[\r\n\0]/.test(supplied)) throw Error();
    const url = new URL(supplied);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1) || url.hash) throw Error();
    if (!explicit) {
      if (!environment.POSTGRES_USER?.trim() || !environment.POSTGRES_PASSWORD) throw Error();
      url.username = encodeURIComponent(environment.POSTGRES_USER);
      url.password = encodeURIComponent(environment.POSTGRES_PASSWORD);
      // pg gives these query parameters precedence over URL credentials.
      url.searchParams.delete("user");
      url.searchParams.delete("password");
    }
    if (!url.username && !url.searchParams.get("user")) throw Error();
    return url.toString();
  } catch { throw Error("Migration database configuration is missing or invalid."); }
}

/** @param {URL} script @param {Environment} environment */
function runMigrationScript(script, environment) {
  // Never relay a child stack trace/provider error: it may include credentials.
  // A child exit code also catches scripts that set process.exitCode themselves.
  return spawnSync(process.execPath, [fileURLToPath(script)], {
    env: environment, stdio: "ignore", windowsHide: true, timeout: 300_000,
  });
}

/** @param {string} connectionString
 * @param {(connectionString:string)=>{query:(sql:string)=>Promise<unknown>,end:()=>Promise<unknown>}} [createPool]
 */
export async function grantCheckoutRuntimeAccess(connectionString, createPool = value => new Pool({ connectionString: value, max: 1, connectionTimeoutMillis: 15_000, statement_timeout: 30_000, query_timeout: 45_000 })) {
  const pool = createPool(connectionString);
  try {
    await pool.query(`DO $checkout_identity$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='maxtravel_app') THEN
          GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.auth_phone_challenges TO maxtravel_app;
        END IF;
      END;
      $checkout_identity$;`);
  } finally { await pool.end(); }
}

/** @param {{environment?:Environment,runScript?:(script:URL,environment:Environment)=>{status:number|null,error?:unknown},grantAccess?:(connectionString:string)=>Promise<void>,report?:(message:string)=>void,reportError?:(message:string)=>void}} [dependencies] */
export async function migrateCheckoutIdentity(dependencies = {}) {
  const { environment = process.env, runScript = runMigrationScript, grantAccess = grantCheckoutRuntimeAccess,
    report = message => console.log(message), reportError = message => console.error(message) } = dependencies;
  let stage = "configuration";
  try {
    const connectionString = migrationDatabaseURL(environment);
    if (!environment.BETTER_AUTH_SECRET || environment.BETTER_AUTH_SECRET.length < 32) throw Error();
    /** @type {Environment} */
    const migrationEnvironment = { ...environment, MIGRATION_DATABASE_URL: connectionString };
    delete migrationEnvironment.POSTGRES_PASSWORD;
    delete migrationEnvironment.POSTGRES_USER;
    stage = "booking schema";
    report("Checkout identity migration: booking schema started.");
    const booking = runScript(new URL("./migrate.mjs", import.meta.url), migrationEnvironment);
    if (booking.error || booking.status !== 0) throw Error();
    report("Checkout identity migration: booking schema completed.");
    stage = "authentication schema";
    report("Checkout identity migration: authentication schema started.");
    const authentication = runScript(new URL("../dist/migrate-auth.mjs", import.meta.url), migrationEnvironment);
    if (authentication.error || authentication.status !== 0) throw Error();
    report("Checkout identity migration: authentication schema completed.");
    stage = "runtime permissions";
    await grantAccess(connectionString);
    report("Checkout identity migration: runtime permissions completed.");
    report("Checkout identity migration completed. The application can now be recreated.");
    return 0;
  } catch {
    reportError(`Checkout identity migration: ${stage} failed. Deployment stopped; the application was not restarted by this helper.`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void migrateCheckoutIdentity().then(exitCode => { process.exitCode = exitCode; });
}
