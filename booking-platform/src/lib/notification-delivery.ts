import { MAIL_DEADLINE_MS } from "./bounded-mail";

export const NOTIFICATION_LEASE_MS = 90_000;
const ACK_MARGIN_MS = 15_000;
export type DeliveryOutcome = "delivered" | "deferred" | "lease-lost" | "acknowledgement-unknown";

/** SMTP and Postgres cannot commit atomically. This is at-least-once delivery,
 * not exactly-once. A send/ack crash can cause a later duplicate notification.
 */
export async function deliverNotification(deps: {
  prepare: () => Promise<() => Promise<void>>;
  renewLease: () => Promise<boolean>;
  acknowledge: () => Promise<boolean>;
  defer: () => Promise<void>;
  now?: () => number;
}): Promise<DeliveryOutcome> {
  let send: () => Promise<void>;
  try { send = await deps.prepare(); }
  catch { await deps.defer(); return "deferred"; }
  const now = deps.now ?? (() => performance.now());
  const renewalStarted = now();
  // DB failures here are uncertain: leave the existing lease intact, never send.
  if (!await deps.renewLease()) return "lease-lost";
  // Include the DB round trip in our lease budget; a late renewal reply must not
  // authorize sending after another worker could have acquired the lease.
  if (now() - renewalStarted >= NOTIFICATION_LEASE_MS - MAIL_DEADLINE_MS - ACK_MARGIN_MS) return "lease-lost";
  try { await send(); }
  catch { await deps.defer(); return "deferred"; }
  // Never funnel an accepted send into the failed-send/retry update. If this
  // acknowledgement is lost, keep the lease as a cooldown; a later retry may
  // still duplicate delivery. Durable ambiguity resolution needs a new state.
  try { return await deps.acknowledge() ? "delivered" : "acknowledgement-unknown"; }
  catch { return "acknowledgement-unknown"; }
}
