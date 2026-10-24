import { bookingDocument } from "../src/lib/booking-document";
import { crmDeliveryPayload } from "../src/lib/crm-delivery";
import { heartbeat } from "../src/lib/worker-health";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { crmSignature } from "../src/lib/signatures";
import { crmSnapshot } from "../src/lib/crm-snapshot";
import { database } from "../src/lib/db";

const url = process.env.CRM_EVENTS_URL;
const key = process.env.CRM_SIGNING_KEY;
const keyId = process.env.CRM_KEY_ID;
if (!process.env.DATABASE_URL || !url || !key || key.length < 32 || !keyId) throw new Error("Configure database and CRM URL/signing key/key ID.");
if (new URL(url).protocol !== "https:" && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("CRM transport requires HTTPS.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let stopping = false;
process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
try {
  while (!stopping) {
    await heartbeat("crm");
    const lease = randomUUID();
    const claimed = await pool.query(`UPDATE outbox_events SET lease_token=$1,lease_until=now()+interval '60 seconds'
      WHERE id=(SELECT id FROM outbox_events WHERE delivered_at IS NULL AND attempts<12 AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [lease]);
    const event = claimed.rows[0];
    if (!event) { await new Promise(r => setTimeout(r, 2000)); continue; }
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const payload = await crmDeliveryPayload(event, {
        snapshot: crmSnapshot,
        document: bookingDocument,
        revision: async id => (await pool.query("SELECT revision FROM orders WHERE id=$1", [id])).rows[0]?.revision,
        persist: async (body, documentRevision) => Boolean((await pool.query(`UPDATE outbox_events SET delivery_payload=$3
          WHERE id=$1 AND lease_token=$2 AND delivery_payload IS NULL
          AND ($4::integer IS NULL OR EXISTS (SELECT 1 FROM orders WHERE id=outbox_events.aggregate_id AND revision=$4))
          RETURNING delivery_payload`, [event.id, lease, body, documentRevision])).rowCount),
        omitted: reason => console.warn("CRM optional document omitted", { eventId: event.id, reason }),
      });
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-MaxTravel-Key-Id": keyId, "X-MaxTravel-Timestamp": timestamp, "X-MaxTravel-Event-Id": event.id, "X-MaxTravel-Signature": crmSignature(timestamp, event.id, payload, key) }, body: payload, signal: AbortSignal.timeout(15000), redirect: "error" });
      if (!response.ok) throw new Error("Delivery rejected");
      await pool.query("UPDATE outbox_events SET delivered_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2", [event.id, lease]);
    } catch {
      const backoffSeconds = Math.min(3600, 2 ** Math.min(event.attempts + 1, 12) * 10);
      await pool.query("UPDATE outbox_events SET attempts=attempts+1,next_attempt=now()+($3 * interval '1 second'),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2", [event.id, lease, backoffSeconds]);
      console.error("CRM delivery deferred", { eventId: event.id });
    }
  }
} finally { await pool.end(); await database().end(); }
