import { z } from "zod";
import { checkoutAccess, shoppingResponse } from "@/lib/guest-shopping";
import { database, transaction } from "@/lib/db";
import type { PoolClient } from "pg";
import { failure, HttpError, json as jsonResponse } from "@/lib/http";
import { razorpayKey } from "@/lib/providers/razorpay";
import { PAYMENT_RESUME_COLUMNS, PAYMENT_RESUME_TABLES, paymentResumeStatus, type PaymentResumeRecord } from "@/lib/payment-resume";
import {synchronizePayGlocalPayment} from '@/lib/payglocal-runtime';
import {validatePayGlocalUrl} from '@/lib/providers/payglocal';

export async function GET(request: Request) {
  try {
    const access = await checkoutAccess(request), actor = access.actor;
    const json = (data: unknown, status?: number) => shoppingResponse(jsonResponse(data, status), access);
    const params = new URL(request.url).searchParams;
    const input = z.object({ bookingId: z.string().uuid().optional(), quoteId: z.string().uuid().optional() })
      .refine(value => Boolean(value.bookingId) !== Boolean(value.quoteId), "Supply one booking or quote reference.")
      .parse({ bookingId: params.get("bookingId") ?? undefined, quoteId: params.get("quoteId") ?? undefined });
    const ownership = [input.quoteId ?? input.bookingId, actor.userId, actor.companyId];
    const read = async (client: Pick<PoolClient, "query">) => (await client.query<PaymentResumeRecord & {provider:string|null; hosted_state:string|null; redirect_url:string|null}>(
      `SELECT ${PAYMENT_RESUME_COLUMNS},a.state AS hosted_state,a.redirect_url
       ${PAYMENT_RESUME_TABLES} LEFT JOIN payglocal_attempts a ON a.order_id=o.id AND a.gid=g.gateway_order_id
       WHERE ${input.quoteId ? "q.id" : "o.id"}=$1 AND o.user_id=$2 AND o.company_id IS NOT DISTINCT FROM $3::uuid`,
      ownership,
    )).rows[0];
    let record = await read(database());
    if (!record && input.quoteId) {
      const outcome = await transaction(async tx => {
        const quote = await tx.query("SELECT id FROM supplier_quotes WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE", ownership);
        if (!quote.rowCount) throw new HttpError(404, "Record not found.");
        const current = await read(tx);
        if (current) return { record: current, expiredWithoutOrder: false };
        // A create which already owns the quote lock finishes before this read.
        // A later create cannot start after expiry. Check for any persisted
        // order, without returning its data if ownership is inconsistent.
        const proof = await tx.query<{resolved:boolean}>(`
          SELECT q.expires_at<=clock_timestamp() AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.quote_id=q.id) AS resolved
          FROM supplier_quotes q WHERE q.id=$1`, [input.quoteId]);
        return { record: undefined, expiredWithoutOrder: proof.rows[0]?.resolved === true };
      });
      if (!outcome.record) return json({
        found: false, quoteId: input.quoteId, canResume: false, checkoutResolved: outcome.expiredWithoutOrder,
        status: outcome.expiredWithoutOrder ? "EXPIRED_WITHOUT_PAYMENT" : "OUTCOME_UNCONFIRMED",
        message: outcome.expiredWithoutOrder
          ? "This quote expired before a payment order was created. Review a fresh price before paying."
          : "No payment order is visible yet. An interrupted request may still be running. Recheck this status or contact MaxTravel; do not start another payment for the same trip.",
      });
      record = outcome.record;
    }
    if (!record) throw new HttpError(404, "Booking not found.");
    if (record.provider === "PAYGLOCAL") {
      if (record.payment_status !== "CAPTURED") {
        try { await synchronizePayGlocalPayment(record.id); } catch { /* Keep the original payment available for reconciliation. */ }
        // Recovery can create the gateway/payment link. Refresh the whole
        // owned record so the status and checkout credentials agree.
        record = await read(database());
        if (!record) throw new HttpError(404, "Booking not found.");
      }
      const base = paymentResumeStatus(record, Date.now(), "PAYGLOCAL");
      let checkoutUrl:string|undefined;
      if (base.canResume && record.hosted_state === "PENDING" && record.redirect_url) {
        try { checkoutUrl = validatePayGlocalUrl(record.redirect_url, "redirect"); } catch { /* The stored URL cannot be resumed. */ }
      }
      return json({found:true,provider:"PAYGLOCAL",bookingId:record.id,status:base.status,paymentStatus:base.paymentStatus,quoteExpiresAt:base.quoteExpiresAt,canResume:Boolean(checkoutUrl),checkoutResolved:base.checkoutResolved,amount:Number(record.total_minor),currency:"INR",...(checkoutUrl?{checkoutUrl}:{}),message:base.checkoutResolved?"Payment has been verified. Check My trips for supplier confirmation.":checkoutUrl?"Resume the same secure checkout. Returning from checkout does not confirm payment.":"Payment is awaiting verification. Check My trips or contact MaxTravel; do not pay again."});
    }
    const result = paymentResumeStatus(record);
    return json({ found: true, ...result, ...(record.provider === "RAZORPAY" ? { provider: "RAZORPAY" } : {}), ...(result.canResume ? { keyId: razorpayKey().id } : {}) });
  } catch (error) { return failure(error); }
}
