import { Pool } from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL&&!process.env.MIGRATION_DATABASE_URL) throw new Error("Set DATABASE_URL before running migrations.");
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(71266301)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const name of ["001-booking-platform", "002-provider-integration", "003-booking-details", "004-operations", "005-cancellation-offers", "006-flight-amendments", "007-delivery", "008-catalogue", "009-security-operations", "010-cancellation-polling", "011-payment-method", "012-partial-cancellation", "013-flight-services", "014-crm-commands"]) {
  const existing = await client.query("SELECT name FROM schema_migrations WHERE name=$1", [name]);
  if (!existing.rowCount) {
    await client.query(await readFile(new URL(`../db/${name}.sql`, import.meta.url), "utf8"));
    await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
  }
  }
  await client.query("COMMIT"); console.log("Booking schema is up to date.");
} catch { await client.query("ROLLBACK"); console.error("Migration failed; no changes committed. Check database connectivity/schema compatibility."); process.exitCode = 1; }
finally { client.release(); await pool.end(); }
