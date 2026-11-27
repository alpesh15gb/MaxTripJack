import { randomUUID } from "node:crypto";
import { z } from "zod";
import { principal } from "@/lib/access";
import { owned } from "@/lib/supplier-flow";
import { database,transaction } from "@/lib/db";
import { body,sameOrigin,json,failure,HttpError } from "@/lib/http";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const actor=await principal(request);const id=z.string().uuid().parse((await context.params).id);await owned("orders",id,actor);const result=await database().query("SELECT id,status,is_partial,scope,review_note,refund_offer_minor::text,penalty_minor::text,offer_version,offer_expires_at,accepted_at FROM cancellation_requests WHERE order_id=$1 ORDER BY created_at DESC",[id]);return json({requests:result.rows});}catch(e){return failure(e);}}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const actor = await principal(request);
    const id = z.string().uuid().parse((await context.params).id);
    await owned("orders", id, actor);
    const {offerVersion} = await body(request, z.object({offerVersion:z.string().uuid()}).strict());
    const status = await transaction(async tx => {
      const offer = (await tx.query<{id:string; status:string; accepted_at:Date|null}>(
        `SELECT c.id,c.status,c.accepted_at FROM cancellation_requests c JOIN orders o ON o.id=c.order_id
         WHERE c.order_id=$1 AND c.offer_version=$2 AND o.user_id=$3
         AND o.company_id IS NOT DISTINCT FROM $4::uuid FOR UPDATE OF c`,
        [id, offerVersion, actor.userId, actor.companyId],
      )).rows[0];
      if (offer?.accepted_at) return offer.status;
      if (!offer || offer.status !== "AWAITING_ACCEPTANCE") {
        throw new HttpError(409, "Cancellation offer expired or changed. Ask operations for a fresh offer.");
      }
      const updated = await tx.query(
        `WITH acceptance AS MATERIALIZED (SELECT clock_timestamp() AS accepted_at)
         UPDATE cancellation_requests SET accepted_at=acceptance.accepted_at FROM acceptance
         WHERE id=$1 AND offer_expires_at>acceptance.accepted_at RETURNING id`, [offer.id],
      );
      if (!updated.rowCount) throw new HttpError(409, "Cancellation offer expired or changed. Ask operations for a fresh offer.");
      await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'CANCELLATION_OFFER_ACCEPTED',$3,$4)",
        [randomUUID(), actor.userId, id, {offerVersion}]);
      return offer.status;
    });
    return json({message: status === "CONFIRMED" ? "The supplier has already confirmed this cancellation. Check My trips for the latest details."
      : status === "REJECTED" ? "The supplier rejected this cancellation. Check My trips for the latest details."
      : "Cancellation terms accepted. The booking stays active until the supplier confirms cancellation."});
  } catch (e) { return failure(e); }
}
