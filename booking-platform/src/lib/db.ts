import "server-only";
import { Pool, PoolClient } from "pg";
import { HttpError } from "./http";
const globalPool = globalThis as unknown as { travelPool?: Pool };
export function database() {
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Database is not configured.");
  return globalPool.travelPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 20000, idle_in_transaction_session_timeout: 30000 });
}
export async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
