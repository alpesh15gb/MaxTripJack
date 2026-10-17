import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { boundedText, HttpError, failure, json } from "@/lib/http";
import { verifySignature } from "@/lib/signatures";
import { transaction } from "@/lib/db";
const eventSchema = z.object({ event: z.string(), payload: z.object({ refund:z.object({entity:z.object({id:z.string().regex(/^rfnd_[A-Za-z0-9]+$/),payment_id:z.string().regex(/^pay_[A-Za-z0-9]+$/),amount:z.number().int().positive(),currency:z.literal("INR"),status:z.string(),receipt:z.string().nullable().optional(),notes:z.record(z.string(),z.unknown()).optional()})}).optional(), payment: z.object({ entity: z.object({ id: z.string().min(1), order_id: z.string().min(1), amount: z.number().int().positive(), currency: z.literal("INR"),method:z.string().max(40).optional(), status: z.string() }) }).optional() }) });
export async function POST(request: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "Payment webhook is not configured.");
    const raw = await boundedText(request, 262144);
    if (!verifySignature(raw, request.headers.get("x-razorpay-signature"), secret)) throw new HttpError(401, "Invalid webhook signature.");
    const eventId = request.headers.get("x-razorpay-event-id");
    if (!eventId || eventId.length > 200) throw new HttpError(400, "Missing event identifier.");
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, "Malformed event."); }
    const event = eventSchema.parse(parsed);
    if (!["payment.captured", "payment.authorized", "payment.failed","refund.processed","refund.failed"].includes(event.event)) return json({ ignored: true });
    const refundEvent=event.event.startsWith("refund.");
    const payment = event.payload.payment?.entity;
    if (!refundEvent&&!payment) throw new HttpError(400, "Missing payment entity.");
    const expectedStatus = event.event.split(".")[1];
    if ((refundEvent?event.payload.refund?.entity.status:payment?.status) !== expectedStatus) throw new HttpError(400, "Event status mismatch.");
    const hash = createHash("sha256").update(raw).digest("hex");
    const outcome = await transaction(async tx => {
      // Conflict waits for concurrent event processing to commit before duplicate inspection.
      const inbox = await tx.query("INSERT INTO webhook_inbox(provider,event_id,body_hash) VALUES('RAZORPAY',$1,$2) ON CONFLICT DO NOTHING RETURNING event_id", [eventId, hash]);
      if (!inbox.rowCount) {
        const prior = await tx.query("SELECT body_hash FROM webhook_inbox WHERE provider='RAZORPAY' AND event_id=$1", [eventId]);
        if (prior.rows[0]?.body_hash !== hash) throw new HttpError(409, "Event identifier collision.");
        return { duplicate: true };
      }
      if(refundEvent){
       const refund=event.payload.refund!.entity;const candidate=refund.receipt??refund.notes?.refundId;const localId=z.string().uuid().safeParse(candidate);
       const found=await tx.query("SELECT r.*,p.gateway_payment_id,p.order_id FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.gateway_refund_id=$1 OR r.id=$2::uuid FOR UPDATE OF r,p",[refund.id,localId.success?localId.data:null]);const record=found.rows[0];
       if(!record||!record.operation_started_at||record.gateway_payment_id!==refund.payment_id||Number(record.amount_minor)!==refund.amount||(record.gateway_refund_id&&record.gateway_refund_id!==refund.id))throw new HttpError(409,"Refund requires reconciliation before accepting this event.");
       if(record.status==="COMPLETED")return {accepted:true};
       const status=refund.status==="processed"?"COMPLETED":"FAILED";
       await tx.query("UPDATE refunds SET status=$1,gateway_refund_id=$2 WHERE id=$3",[status,refund.id,record.id]);await tx.query("UPDATE orders SET revision=revision+1,updated_at=now() WHERE id=$1",[record.order_id]);
       await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'refund.updated',$3)",[randomUUID(),record.order_id,{bookingId:record.order_id,refundId:record.id,status,amountMinor:refund.amount}]);
       if(status==="COMPLETED")await tx.query("INSERT INTO customer_notifications(id,order_id,revision,status) SELECT $1,id,revision,'REFUND_COMPLETED' FROM orders WHERE id=$2 ON CONFLICT DO NOTHING",[randomUUID(),record.order_id]);
       await tx.query("INSERT INTO audit_events(id,action,entity_id,detail) VALUES($1,'REFUND_WEBHOOK_UPDATE',$2,$3)",[randomUUID(),record.id,{status}]);return {accepted:true};
      }
      if(!payment)throw new HttpError(400,"Missing payment entity.");
      const found = await tx.query("SELECT id,order_id,amount_minor::text,currency,status,method,gateway_payment_id FROM payments WHERE gateway_order_id=$1 FOR UPDATE", [payment.order_id]);
      const record = found.rows[0];
      if (!record) throw new HttpError(409, "Payment order is not yet available. Retry delivery.");
      if (record.amount_minor !== String(payment.amount) || record.currency !== payment.currency) throw new HttpError(409, "Payment amount mismatch.");
      if (record.gateway_payment_id && record.gateway_payment_id !== payment.id) {if(record.status==="CAPTURED"&&event.event!=="payment.captured")return {accepted:true};throw new HttpError(409, "Payment attempt requires reconciliation.");}
      // A late failure/authorisation cannot reverse a captured payment.
      if (record.status === "CAPTURED") {if(payment.method&&!record.method){await tx.query("UPDATE payments SET method=$1 WHERE id=$2",[payment.method,record.id]);await tx.query("UPDATE orders SET revision=revision+1 WHERE id=$1",[record.order_id]);await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'payment.details_updated',$3)",[randomUUID(),record.order_id,{bookingId:record.order_id}]);}return { accepted: true };}
      if (event.event === "payment.captured") {
        await tx.query("UPDATE payments SET status='CAPTURED',gateway_payment_id=$1,method=$3 WHERE id=$2", [payment.id, record.id,payment.method||null]);
        // Capture is recorded even if the order has an unexpected state; staff must resolve it.
        await tx.query("UPDATE orders SET status=CASE WHEN status='PAYMENT_PENDING' THEN 'PAID' ELSE 'MANUAL_REVIEW' END,revision=revision+1,updated_at=now() WHERE id=$1", [record.order_id]);
        await tx.query("INSERT INTO booking_jobs(order_id) SELECT id FROM orders WHERE id=$1 AND status='PAID' AND quote_id IS NOT NULL ON CONFLICT DO NOTHING", [record.order_id]);
        await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'payment.captured',$3)", [randomUUID(), record.order_id, JSON.stringify({ bookingId: record.order_id, paymentId: payment.id, amountMinor: payment.amount, currency: "INR" })]);
        await tx.query("INSERT INTO audit_events(id,action,entity_id) VALUES($1,'PAYMENT_CAPTURED',$2)", [randomUUID(), record.order_id]);
      } else if (event.event === "payment.authorized" && record.status === "CREATED") {
        await tx.query("UPDATE payments SET status='AUTHORIZED' WHERE id=$1", [record.id]);
      } else if (event.event === "payment.failed" && record.status === "CREATED") {
        // A failed attempt must not close the gateway order; a customer can retry payment.
        await tx.query("INSERT INTO audit_events(id,action,entity_id,detail) VALUES($1,'PAYMENT_ATTEMPT_FAILED',$2,$3)", [randomUUID(), record.order_id, JSON.stringify({ gatewayPaymentId: payment.id })]);
      }
      return { accepted: true };
    });
    return json(outcome);
  } catch (e) { return failure(e); }
}
