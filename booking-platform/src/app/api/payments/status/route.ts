import { z } from "zod";
import { principal } from "@/lib/access";
import { database } from "@/lib/db";
import { failure, HttpError, json } from "@/lib/http";
import { razorpayKey } from "@/lib/providers/razorpay";
import { paymentResumeStatus, type PaymentResumeRecord } from "@/lib/payment-resume";
import { owned } from "@/lib/supplier-flow";
import {synchronizePayGlocalPayment} from '@/lib/payglocal-runtime';
import {validatePayGlocalUrl} from '@/lib/providers/payglocal';

export async function GET(request: Request) {
  try {
    const actor = await principal(request);
    const params = new URL(request.url).searchParams;
    const input = z.object({ bookingId: z.string().uuid().optional(), quoteId: z.string().uuid().optional() })
      .refine(value => Boolean(value.bookingId) !== Boolean(value.quoteId), "Supply one booking or quote reference.")
      .parse({ bookingId: params.get("bookingId") ?? undefined, quoteId: params.get("quoteId") ?? undefined });
    if (input.quoteId) await owned("supplier_quotes", input.quoteId, actor);
    const found = await database().query<PaymentResumeRecord & { provider: string | null }>(
      `SELECT o.id,o.status,o.total_minor,q.expires_at AS quote_expires_at,q.fare_validation_state,q.booking_validation_state,o.service_kind,q.review,
       g.provider,g.state AS intent_state,g.gateway_order_id,p.status AS payment_status,p.amount_minor,p.currency
       FROM orders o LEFT JOIN supplier_quotes q ON q.id=o.quote_id
       LEFT JOIN gateway_intents g ON g.order_id=o.id
       LEFT JOIN payments p ON p.order_id=o.id AND p.gateway_order_id=g.gateway_order_id
       WHERE ${input.quoteId ? "o.quote_id" : "o.id"}=$1 AND o.user_id=$2 AND o.company_id IS NOT DISTINCT FROM $3::uuid`,
      [input.quoteId ?? input.bookingId, actor.userId, actor.companyId],
    );
    if (!found.rows[0] && input.quoteId) return json({
      found: false, quoteId: input.quoteId, canResume: false, checkoutResolved: false, status: "OUTCOME_UNCONFIRMED",
      message: "No payment order is visible yet. An interrupted request may still be running. Recheck this status or contact MaxTravel; do not start another payment for the same trip.",
    });
    if (!found.rows[0]) throw new HttpError(404, "Booking not found.");
    if (found.rows[0].provider === "PAYGLOCAL") {
      const id=found.rows[0].id;
      if(found.rows[0].payment_status!=='CAPTURED'){try{await synchronizePayGlocalPayment(id);}catch{/* Uncertain outcomes preserve the original order. */}}
      const current=(await database().query("SELECT a.state,a.redirect_url,o.status,p.status AS payment_status FROM payglocal_attempts a JOIN orders o ON o.id=a.order_id LEFT JOIN payments p ON p.order_id=o.id AND p.provider='PAYGLOCAL' WHERE a.order_id=$1",[id])).rows[0];
      const base=paymentResumeStatus({...found.rows[0],status:current?.status??found.rows[0].status,payment_status:current?.payment_status??found.rows[0].payment_status},Date.now(),"PAYGLOCAL");
      let checkoutUrl:string|undefined;
      if(base.canResume&&current?.state==='PENDING'&&current.redirect_url){try{checkoutUrl=validatePayGlocalUrl(current.redirect_url,'redirect');}catch{}}
      return json({found:true,provider:'PAYGLOCAL',bookingId:id,status:current?.status??found.rows[0].status,paymentStatus:current?.payment_status??found.rows[0].payment_status,canResume:Boolean(checkoutUrl),checkoutResolved:base.checkoutResolved,amount:Number(found.rows[0].total_minor),currency:'INR',...(checkoutUrl?{checkoutUrl}:{}),message:base.checkoutResolved?'Payment has been verified. Check My trips for supplier confirmation.':checkoutUrl?'Resume the same secure checkout. Returning from checkout does not confirm payment.':'Payment is awaiting verification. Check My trips or contact MaxTravel; do not pay again.'});
    }
    const result = paymentResumeStatus(found.rows[0]);
    return json({ found: true, ...result, ...(result.canResume ? { keyId: razorpayKey().id } : {}) });
  } catch (error) { return failure(error); }
}
