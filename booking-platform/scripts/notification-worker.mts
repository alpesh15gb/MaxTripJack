import { heartbeat } from "../src/lib/worker-health";
import { randomUUID } from "node:crypto";
import { database } from "../src/lib/db";
import { unseal } from "../src/lib/vault";
import { sendMail, mailReady } from "../src/lib/mail";
import { deliverNotification } from "../src/lib/notification-delivery";

if (!mailReady() || !process.env.BETTER_AUTH_URL) throw Error("Configure email delivery and the public application URL.");
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
try {
  while (!stopping) {
    await heartbeat("notifications");
    const lease = randomUUID();
    const result = await database().query("UPDATE customer_notifications SET lease_token=$1,lease_until=now()+interval '90 seconds' WHERE id=(SELECT id FROM customer_notifications WHERE delivered_at IS NULL AND attempts<12 AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *", [lease]);
    const item = result.rows[0];
    if (!item) { await new Promise(resolve => setTimeout(resolve, 2000)); continue; }
    let attemptReserved = false;
    try {
      const outcome = await deliverNotification({
        prepare: async () => {
          const result = await database().query("SELECT reference,guests_encrypted FROM orders WHERE id=$1", [item.order_id]);
          const order = result.rows[0];
          const guests = unseal(order.guests_encrypted, item.order_id);
          const status = item.status.replaceAll("_", " ");
          return () => sendMail(guests.email, `Max Travel ${order.reference}: ${status}`, `Your booking ${order.reference} has an update: ${status}.\n\nView your latest booking status, documents and cancellation/refund updates:\n${new URL("/my-trips", process.env.BETTER_AUTH_URL).toString()}\n\nSupplier confirmation and customer refund are separate steps. Contact Max Travel if you need help.\n\nMax Travel`);
        },
        renewLease: async () => {
          if (stopping) return false;
          // Count before SMTP, so crashes and lost acknowledgements cannot cause
          // unlimited delivery attempts. An uncertain reservation never sends.
          attemptReserved = Boolean((await database().query("UPDATE customer_notifications SET attempts=attempts+1,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=$1 AND lease_token=$2 AND delivered_at IS NULL AND attempts<12 AND lease_until>clock_timestamp()", [item.id, lease])).rowCount);
          // SIGTERM may arrive while the renewal query is in flight. Keep the
          // reservation counted, but never start a new SMTP send after shutdown.
          return attemptReserved && !stopping;
        },
        acknowledge: async () => Boolean((await database().query("UPDATE customer_notifications SET delivered_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND delivered_at IS NULL", [item.id, lease])).rowCount),
        defer: async () => {
          await database().query("UPDATE customer_notifications SET attempts=attempts+$4,next_attempt=now()+($3*interval '1 second'),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND delivered_at IS NULL", [item.id, lease, Math.min(3600, 2 ** Math.min(item.attempts + 1, 12) * 10), attemptReserved ? 0 : 1]);
        },
      });
      if (outcome !== "delivered") console.error("Customer notification delivery incomplete", { id: item.id, outcome });
    } catch {
      // An uncertain DB operation must not trigger an unfenced send or immediate
      // requeue. Let the lease expire; do not log recipient, content or secrets.
      console.error("Customer notification database operation failed", { id: item.id });
    }
  }
} finally { await database().end(); }
