import { betterAuth } from "better-auth";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { checkoutPhoneSchema } from "../src/lib/phone-auth";
if ((!process.env.DATABASE_URL&&!process.env.MIGRATION_DATABASE_URL) || !process.env.BETTER_AUTH_SECRET) throw new Error("Configure auth environment first.");
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL });
try {
 const auth = betterAuth({ secret: process.env.BETTER_AUTH_SECRET, baseURL: process.env.BETTER_AUTH_URL, database: pool,
   emailAndPassword: { enabled: true }, rateLimit: { enabled: true, storage: "database" }, plugins: [twoFactor(),{...phoneNumber({sendOTP:async()=>{}}),schema:checkoutPhoneSchema()}] });
 const migrations = await getMigrations(auth.options);
 await migrations.runMigrations();
 console.log("Authentication schema is up to date.");
} finally { await pool.end(); }

