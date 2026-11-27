import { database } from "@/lib/db";
import { bookingMigrations } from "../../../../scripts/booking-migrations.mjs";

const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try {
    const pool = database();
    const { rows } = await pool.query<{count: number}>(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE name=ANY($1::text[])",
      [bookingMigrations],
    );
    if (rows[0]?.count === bookingMigrations.length) {
      await pool.query("SELECT lease_token,lease_until,last_checked_at,next_check,supplier_status,check_error,follow_up_required_at FROM cancellation_requests LIMIT 0");
      await pool.query('SELECT id, "emailVerified" FROM "user" LIMIT 0');
      return Response.json({ status: "ready" }, { headers });
    }
  } catch {
    // Health responses are public. Database details stay private.
  }
  return Response.json({ status: "unavailable" }, { status: 503, headers });
}
