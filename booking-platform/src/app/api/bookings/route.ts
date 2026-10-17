import { z } from "zod";
import { principal } from "@/lib/access";
import { database } from "@/lib/db";
import { json, failure } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const actor = await principal(request);
    const page=z.coerce.number().int().min(1).max(100000).parse(new URL(request.url).searchParams.get("page")||1);
    const result = await database().query("SELECT o.id, o.reference,o.parent_order_id,o.service_kind, o.product, o.status, o.currency, o.total_minor::text, o.itinerary_summary, o.created_at,COALESCE((SELECT json_agg(json_build_object('id',child.id,'reference',child.reference,'kind',child.service_kind,'status',child.status)) FROM orders child WHERE child.parent_order_id=o.id),'[]'::json) AS linked_services, COALESCE((SELECT json_agg(json_build_object('id',r.id,'amountMinor',r.amount_minor::text,'status',r.status)) FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=o.id),'[]'::json) AS refunds FROM orders o WHERE (company_id=$1 AND $1::uuid IS NOT NULL) OR (company_id IS NULL AND user_id=$2 AND $1::uuid IS NULL) ORDER BY created_at DESC LIMIT 51 OFFSET $3", [actor.companyId, actor.userId,(page-1)*50]);
    return json({ bookings: result.rows.slice(0,50),page,hasMore:result.rows.length>50 });
  } catch (e) { return failure(e); }
}
