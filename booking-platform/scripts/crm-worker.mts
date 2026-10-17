import { bookingDocument } from "../src/lib/booking-document";
import { createHash } from "node:crypto";
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
      let payload=event.delivery_payload as string|null;
      if(!payload){const snapshot=await crmSnapshot(event.aggregate_id);let document:unknown;
      if(["TICKETED","CONFIRMED"].includes(snapshot.status)&&!snapshot.cancellations.length&&!snapshot.replacementBookings.length){const response=await bookingDocument(event.aggregate_id);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>524288)throw Error("Generated CRM PDF exceeds transport limit");const current=await pool.query("SELECT revision FROM orders WHERE id=$1",[event.aggregate_id]);if(current.rows[0]?.revision!==snapshot.revision)throw Error("Booking changed during document generation");document={filename:`${snapshot.reference}.pdf`,sha256:createHash("sha256").update(bytes).digest("hex"),base64:bytes.toString("base64")};}
      payload=JSON.stringify({ schemaVersion: event.schema_version, eventId: event.id, eventType: event.event_type, aggregateId: event.aggregate_id, occurredAt: event.created_at, revision:snapshot.revision,payload: {...snapshot,...(document?{document}:{})} });const saved=await pool.query("UPDATE outbox_events SET delivery_payload=$3 WHERE id=$1 AND lease_token=$2 AND delivery_payload IS NULL RETURNING delivery_payload",[event.id,lease,payload]);if(!saved.rowCount)throw new Error("Delivery lease lost");}
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
