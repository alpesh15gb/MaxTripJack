import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "@/lib/db";
import { json, HttpError } from "@/lib/http";
import { cancellationAllowed, canReadOrder } from "@/lib/booking-policy";
import { cancellationSelection,cancellationOptions,selectCancellationScope } from "@/lib/cancellation-scope";
import { unseal } from "@/lib/vault";
export const cancellationRequestSchema = z.object({ reason: z.string().trim().min(3).max(1000), requestKey: z.string().uuid(), selection:cancellationSelection.optional() }).strict();
export async function requestCancellation(id:string,data:z.infer<typeof cancellationRequestSchema>,actor:{userId:string;companyId:string|null},auditActorId=actor.userId){
    const result = await transaction(async tx => {
      const found = await tx.query("SELECT id, user_id, company_id, status,product,service_kind,quote_id,guests_encrypted,itinerary_summary FROM orders WHERE id=$1 FOR UPDATE", [id]);
      const order = found.rows[0];
      if (!order || !canReadOrder(actor.userId, actor.companyId, order)) throw new HttpError(404, "Booking not found.");
      const duplicate = await tx.query("SELECT id,status FROM cancellation_requests WHERE order_id=$1 AND request_key=$2", [id, data.requestKey]);
      if (duplicate.rowCount) return duplicate.rows[0];
      cancellationAllowed(order.status);
      if(order.service_kind==="ANCILLARY")throw new HttpError(409,"Contact operations for ancillary refunds; do not cancel the flight using an extras receipt.");
      const changing=await tx.query("SELECT id FROM orders WHERE parent_order_id=$1 AND status IN ('PAYMENT_PENDING','PAID','BOOKING_PENDING','MANUAL_REVIEW')",[id]);if(changing.rowCount)throw new HttpError(409,"A flight service purchase is still pending. Reconcile it before cancellation.");
      const reissued=await tx.query("SELECT q.service_payload FROM orders o JOIN supplier_quotes q ON q.id=o.quote_id WHERE o.parent_order_id=$1 AND o.service_kind='REISSUE' AND o.status='TICKETED'",[id]);
      if(reissued.rowCount)throw new HttpError(409,"This booking has reissued travel. Contact operations to cancel the correct ticket; the new flight can be cancelled from its own booking.");
      const pending = await tx.query("SELECT id FROM cancellation_requests WHERE order_id=$1 AND status NOT IN ('CONFIRMED','REJECTED')", [id]);
      if (pending.rowCount) throw new HttpError(409, "A cancellation request is already being reviewed.");
      if(data.selection&&order.product!=="FLIGHT")throw new HttpError(400,"Hotel cancellations apply to the complete booking.");
      const history=await tx.query("SELECT scope FROM cancellation_requests WHERE order_id=$1 AND status='CONFIRMED'",[id]);
      const quote=order.quote_id?await tx.query("SELECT review FROM supplier_quotes WHERE id=$1",[order.quote_id]):null;
      let scope;try{scope=selectCancellationScope(cancellationOptions(quote?.rows[0]?.review??{},order.guests_encrypted?unseal(order.guests_encrypted,id):{},order.itinerary_summary),data.selection,history.rows.map(r=>r.scope));}catch(e){throw new HttpError(400,e instanceof Error?e.message:"Invalid cancellation selection.");}
      const requestId = randomUUID();
      await tx.query("INSERT INTO cancellation_requests(id,order_id,user_id,reason,request_key,scope,is_partial) VALUES($1,$2,$3,$4,$5,$6,$7)", [requestId, id, actor.userId, data.reason, data.requestKey,scope.scope,scope.isPartial]);
      await tx.query("UPDATE orders SET revision=revision+1,updated_at=now() WHERE id=$1",[id]);
      await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,'CANCELLATION_REQUESTED',$3)", [randomUUID(), auditActorId, id]);
      await tx.query("INSERT INTO outbox_events(id,aggregate_id,event_type,payload) VALUES($1,$2,'cancellation.requested',$3)", [randomUUID(), id, JSON.stringify({ cancellationId: requestId, bookingId: id })]);
      return { id: requestId, status: "REQUESTED" };
    });
    return json({ cancellation: result, message: "Request received. The booking remains active until supplier cancellation is confirmed." }, 202);
}
