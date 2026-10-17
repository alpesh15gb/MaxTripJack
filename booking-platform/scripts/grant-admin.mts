import { Pool } from "pg";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) throw new Error("Usage: grant-admin <verified email>; DATABASE_URL required.");
const roles:Record<string,string[]>={viewer:["bookings:read"],operations:["bookings:read","bookings:reconcile","companies:manage","pricing:manage","cancellations:manage","cancellations:execute","integrations:manage","audit:read"],finance:["bookings:read","payments:manage","finance:read","refunds:manage","refunds:execute","audit:read"]};
const permissions=roles[process.argv[3]||"viewer"];if(!permissions)throw Error("Choose viewer, operations or finance.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
 const found = await pool.query('SELECT id,"emailVerified","twoFactorEnabled" FROM "user" WHERE lower(email)=$1', [email]);
 const user = found.rows[0];
 if (!user?.emailVerified || !user.twoFactorEnabled) throw new Error("Admin must already have verified email and enabled authenticator protection.");
 await pool.query("INSERT INTO admin_grants(user_id,permissions,active) VALUES($1,$2,true) ON CONFLICT(user_id) DO UPDATE SET permissions=excluded.permissions,active=true", [user.id, permissions]);
 console.log("Requested admin role provisioned. MFA remains mandatory.");
} finally { await pool.end(); }
