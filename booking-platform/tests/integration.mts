import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
const base = process.env.BETTER_AUTH_URL!;
if (!base || !process.env.DATABASE_URL || !["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Run only against the configured local development environment.");
const email = `integration-${randomUUID()}@example.test`;
const password = randomBytes(24).toString("hex");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let cookie = ""; let userId = "";
const ownOrder = randomUUID(); const otherOrder = randomUUID();
async function api(path: string, data?: unknown) {
 const response = await fetch(`${base}${path}`, { method: data ? "POST" : "GET", headers: { origin: base, "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
 return { response, data: await response.json() };
}
try {
 assert.equal((await api("/api/bookings")).response.status, 401);
 const signup = await api("/api/auth/sign-up/email", { email, password, name: "Integration Traveller", callbackURL: "/account" });
 assert.equal(signup.response.status, 200, "registration failed"); userId = signup.data.user.id;
 const beforeVerification = await api("/api/auth/sign-in/email", { email, password });
 assert.equal(beforeVerification.response.status, 403, "unverified email must not sign in");
 const mailList = await (await fetch("http://127.0.0.1:18025/api/v1/messages")).json();
 const message = mailList.messages.find((m: { To: { Address: string }[] }) => m.To.some(to => to.Address === email));
 assert.ok(message, "verification email must reach local Mailpit");
 const mail = await (await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();
 const verificationURL = mail.Text.match(/https?:\/\/[^\s]+/)?.[0];
 assert.ok(verificationURL);
 assert.equal(new URL(verificationURL).origin, base);
 await fetch(verificationURL, { redirect: "manual" });
 const signin = await api("/api/auth/sign-in/email", { email, password });
 assert.equal(signin.response.status, 200, "verified sign-in failed");
 cookie = signin.response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
 assert.ok(cookie);
 assert.equal((await api("/api/admin/overview")).response.status, 403, "ordinary customer must not access admin");
 await pool.query("INSERT INTO orders(id,reference,user_id,product,status,total_minor,supplier_minor) VALUES($1,$2,$3,'FLIGHT','TICKETED',10000,9000),($4,$5,'another-test-user','FLIGHT','TICKETED',10000,9000)", [ownOrder, `TEST-${ownOrder}`, userId, otherOrder, `TEST-${otherOrder}`]);
 const bookings = await api("/api/bookings"); assert.equal(bookings.response.status, 200);
 assert.equal(bookings.data.bookings.some((b: { id: string }) => b.id === ownOrder), true);
 assert.equal(bookings.data.bookings.some((b: { id: string }) => b.id === otherOrder), false);
 const requestKey = randomUUID();
 assert.equal((await api(`/api/bookings/${otherOrder}/cancellation`, { reason: "Isolation test", requestKey })).response.status, 404);
 const cancellation = await api(`/api/bookings/${ownOrder}/cancellation`, { reason: "Integration test request", requestKey });
 assert.equal(cancellation.response.status, 202);
 const duplicate = await api(`/api/bookings/${ownOrder}/cancellation`, { reason: "Integration test request", requestKey });
 assert.equal(duplicate.response.status, 202); assert.equal(duplicate.data.cancellation.id, cancellation.data.cancellation.id);
 assert.equal((await api(`/api/bookings/${ownOrder}/cancellation`, { reason: "A second request", requestKey: randomUUID() })).response.status, 409);
 assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1", [ownOrder])).rows[0].status, "TICKETED");
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1", [ownOrder])).rows[0].n, 1);
 await api("/api/auth/sign-out", {}); cookie = "";
 assert.equal((await api("/api/bookings")).response.status, 401);
 console.log("PASS: registration, local email verification, sign-in/out, admin denial, booking isolation, cancellation idempotency, active-travel preservation and transactional outbox.");
} finally {
 // Remove only synthetic fixtures created by this run; preserve other development data.
 await pool.query("DELETE FROM customer_notifications WHERE order_id=ANY($1::uuid[])", [[ownOrder, otherOrder]]);
 await pool.query("DELETE FROM outbox_events WHERE aggregate_id=ANY($1::uuid[])", [[ownOrder, otherOrder]]);
 await pool.query("DELETE FROM audit_events WHERE entity_id=ANY($1::uuid[])", [[ownOrder, otherOrder]]);
 await pool.query("DELETE FROM cancellation_requests WHERE order_id=ANY($1::uuid[])", [[ownOrder, otherOrder]]);
 await pool.query("DELETE FROM orders WHERE id=ANY($1::uuid[])", [[ownOrder, otherOrder]]);
 if (userId) await pool.query('DELETE FROM "user" WHERE id=$1', [userId]);
 await pool.end();
}
