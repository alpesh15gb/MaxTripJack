import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database, transaction } from "./db";
import { HttpError } from "./http";
import { tripjack, paths, type Product } from "./providers/tripjack";
import { cancellationBody } from "./cancellation-scope";
import { cancellationReconciliation } from "./cancellation-reconciliation";

const message = (status: string) => status === "CONFIRMED"
  ? "Supplier cancellation confirmed. Customer refund is a separate workflow."
  : status === "REJECTED" ? "Supplier rejected the cancellation. The booking remains active."
    : "Supplier confirmation is pending. The next status check is scheduled; do not repeat the cancellation submission.";
const safeStatus = (value: unknown): string | null => typeof value === "string" && /^[A-Z_0-9]{1,64}$/.test(value) ? value : null;

export async function executeCancellation(cancellationId: string, actorId: string | null, allowSubmission = true) {
  const id = z.string().uuid().parse(cancellationId), lease = randomUUID();
  const cancellation = await transaction(async tx => {
    const row = (await tx.query("SELECT c.*,o.product,o.supplier_booking_id,o.status AS booking_status,now() AS checked_now FROM cancellation_requests c JOIN orders o ON o.id=c.order_id WHERE c.id=$1 FOR UPDATE OF c,o", [id])).rows[0];
    if (!row || !row.supplier_booking_id) throw new HttpError(404, "Supplier booking not found.");
    if (["CONFIRMED", "REJECTED"].includes(row.status)) return row;
    if (!["AWAITING_ACCEPTANCE", "SUPPLIER_PENDING"].includes(row.status)) throw new HttpError(409, "Cancellation is not ready for submission.");
    if (!process.env[row.product === "FLIGHT" ? "TRIPJACK_FLIGHT_API_KEY" : "TRIPJACK_HOTEL_API_KEY"]) throw new HttpError(503, "Cancellation is temporarily unavailable. Please contact MaxTravel.");
    if (!allowSubmission && !row.supplier_attempted_at) throw new HttpError(409, "Cancellation has not been submitted by staff.");
    const now = new Date(row.checked_now).getTime();
    if ((row.lease_until && new Date(row.lease_until).getTime() > now) || (row.next_check && new Date(row.next_check).getTime() > now)) {
      throw new HttpError(409, "A supplier status check is in progress or scheduled. Check the next check time before trying again.");
    }
    if (!row.supplier_attempted_at && !["TICKETED", "CONFIRMED"].includes(row.booking_status)) throw new HttpError(409, "Only confirmed travel can be submitted for cancellation.");
    if (!row.supplier_attempted_at && (!row.accepted_at || new Date(row.offer_expires_at).getTime() <= now)) throw new HttpError(409, "A current customer-accepted offer is required.");
    // Claim a lease longer than both bounded provider calls. Persist submission
    // BEFORE HTTP: recovery only checks status, even after a lost response/crash.
    await tx.query("UPDATE cancellation_requests SET status='SUPPLIER_PENDING',supplier_attempted_at=COALESCE(supplier_attempted_at,now()),lease_token=$2,lease_until=now()+interval '180 seconds',next_check=now()+interval '180 seconds',poll_attempts=LEAST(poll_attempts,2147483646)+1 WHERE id=$1", [id, lease]);
    return row;
  });
  if (["CONFIRMED", "REJECTED"].includes(cancellation.status)) return { status: cancellation.status, message: message(cancellation.status) };

  let amendmentId = cancellation.supplier_amendment_id as string | null;
  let supplierStatus: string | null = null, checkError: string | null = null;
  let confirmed = false, rejected = false;
  const product = cancellation.product as Product;
  if (!cancellation.supplier_attempted_at) {
    try {
      if (product === "HOTEL") await tripjack("HOTEL", `/oms/v3/hotel/cancel-booking/${encodeURIComponent(cancellation.supplier_booking_id)}`, undefined, true);
      else {
        const submitted = await tripjack("FLIGHT", "/oms/v1/air/amendment/submit-amendment", cancellationBody(cancellation), true);
        if (typeof submitted.amendmentId === "string" && submitted.amendmentId.length <= 200) {
          amendmentId = submitted.amendmentId;
          await database().query("UPDATE cancellation_requests SET supplier_amendment_id=$2 WHERE id=$1 AND lease_token=$3 AND status='SUPPLIER_PENDING'", [id, amendmentId, lease]);
        }
      }
    } catch { /* Uncertain submission is resolved only through status queries. */ }
  }
  try {
    if (product === "FLIGHT" && amendmentId) {
      const details = await tripjack("FLIGHT", "/oms/v1/air/amendment/amendment-details", { amendmentId }, true);
      supplierStatus = safeStatus(details.amendmentStatus);
      confirmed = supplierStatus === "SUCCESS";
      rejected = supplierStatus === "REJECTED";
    } else {
      const details = await tripjack(product, paths[product].details, { bookingId: cancellation.supplier_booking_id }, true);
      supplierStatus = safeStatus(details.order?.status);
      confirmed = !cancellation.is_partial && supplierStatus === "CANCELLED";
      if (product === "FLIGHT" && !amendmentId && !confirmed) checkError = "AMENDMENT_REFERENCE_UNAVAILABLE";
    }
    if (!supplierStatus) checkError = "UNKNOWN_STATUS";
  } catch { checkError = "SUPPLIER_UNAVAILABLE"; }

  return transaction(async tx => {
    const current = (await tx.query("SELECT c.*,now() AS checked_now FROM cancellation_requests c WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (current?.lease_token !== lease || current.status !== "SUPPLIER_PENDING") {
      const status = current?.status ?? "SUPPLIER_PENDING";
      return { status, message: message(status) };
    }
    const schedule = cancellationReconciliation({ product, supplierStatus, attempts: Number(current.poll_attempts), submittedAt: new Date(current.supplier_attempted_at), now: new Date(current.checked_now), error: checkError });
    const status = confirmed ? "CONFIRMED" : rejected ? "REJECTED" : "SUPPLIER_PENDING";
    const newFollowUp = status === "SUPPLIER_PENDING" && schedule.followUpRequired && !current.follow_up_required_at;
    await tx.query("UPDATE cancellation_requests SET status=$2,supplier_status=$3,check_error=$4,last_checked_at=now(),next_check=CASE WHEN $2='SUPPLIER_PENDING' THEN now()+($5 * interval '1 second') ELSE NULL END,follow_up_required_at=CASE WHEN $2<>'SUPPLIER_PENDING' THEN NULL WHEN $6 THEN COALESCE(follow_up_required_at,now()) ELSE follow_up_required_at END,lease_token=NULL,lease_until=NULL WHERE id=$1", [id, status, supplierStatus, checkError, schedule.delaySeconds, schedule.followUpRequired]);
    if (confirmed) {
      await tx.query("UPDATE orders SET status=CASE WHEN $2 THEN status ELSE 'CANCELLED' END,supplier_status=CASE WHEN $2 THEN supplier_status ELSE 'CANCELLED' END,updated_at=now(),revision=revision+1 WHERE id=$1", [cancellation.order_id, cancellation.is_partial]);
      await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'booking.cancelled',$3)", [randomUUID(), cancellation.order_id, { bookingId: cancellation.order_id, cancellationId: id, partial: cancellation.is_partial, refundOfferMinor: Number(cancellation.refund_offer_minor) }]);
    } else {
      await tx.query("UPDATE orders SET revision=revision+1,updated_at=now() WHERE id=$1", [cancellation.order_id]);
      await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,$3,$4)", [randomUUID(), cancellation.order_id, newFollowUp ? "cancellation.follow_up_required" : "cancellation.status_updated", { bookingId: cancellation.order_id, cancellationId: id }]);
    }
    await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'SUPPLIER_CANCELLATION_CHECKED',$3,$4)", [randomUUID(), actorId, id, { confirmed, supplierStatus, checkError, followUpRequired: status === "SUPPLIER_PENDING" && Boolean(current.follow_up_required_at || schedule.followUpRequired) }]);
    return { status, message: message(status) };
  });
}

/** One bounded batch. No attempt ceiling: pending work stays recoverable. */
export async function runCancellationJobs(progress: () => Promise<void> = async () => {}) {
  const due = await database().query("SELECT id FROM cancellation_requests WHERE status='SUPPLIER_PENDING' AND supplier_attempted_at IS NOT NULL AND (next_check IS NULL OR next_check<=now()) AND (lease_until IS NULL OR lease_until<=now()) ORDER BY next_check NULLS FIRST LIMIT 10");
  for (const row of due.rows) {
    await progress();
    try { await executeCancellation(row.id, null, false); }
    catch { /* A concurrent lease or unavailable configuration leaves work due. */ }
  }
}
