import "server-only";
import { createHmac } from "node:crypto";
import { transaction } from "./db";
import { customerEmail } from "./customer-identity";
import type { Actor } from "./supplier-flow";

export const isGuestActor = (actor: Pick<Actor, "userId">) => actor.userId.startsWith("guest:");

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("Guest checkout is not configured.");
  return value;
}

/** Keyed, so a leaked column cannot be matched against a list of emails. */
export function guestContactHash(email: string, key = secret()) {
  return createHmac("sha256", key).update(`guest-contact-v1:${email.trim().toLowerCase()}`).digest("hex");
}

type SessionUser = { id: string; email?: string | null; emailVerified?: boolean | null };

/** After the visitor proves the email by OTP, move their guest bookings (and the
 * quotes/searches behind them) into the signed-in individual account. */
export async function claimGuestBookings(actor: Actor, user: SessionUser | undefined) {
  if (actor.companyId || isGuestActor(actor) || !user?.emailVerified) return 0;
  const email = customerEmail(user);
  if (!email) return 0;
  const hash = guestContactHash(email);
  return transaction(async tx => {
    const claimed = await tx.query<{ id: string; quote_id: string }>(
      "UPDATE orders SET user_id=$1 WHERE guest_contact_hash=$2 AND user_id LIKE 'guest:%' AND company_id IS NULL RETURNING id,quote_id",
      [actor.userId, hash]);
    if (!claimed.rowCount) return 0;
    const quotes = claimed.rows.map(row => row.quote_id);
    await tx.query("UPDATE supplier_searches SET user_id=$1 WHERE id IN (SELECT search_id FROM supplier_quotes WHERE id=ANY($2::uuid[])) AND user_id LIKE 'guest:%'", [actor.userId, quotes]);
    await tx.query("UPDATE supplier_quotes SET user_id=$1 WHERE id=ANY($2::uuid[]) AND user_id LIKE 'guest:%'", [actor.userId, quotes]);
    return claimed.rowCount;
  });
}
