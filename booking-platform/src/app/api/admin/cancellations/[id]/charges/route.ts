import { z } from "zod";
import { administrator } from "@/lib/access";
import { database } from "@/lib/db";
import { sameOrigin,json,failure,HttpError } from "@/lib/http";
import { tripjack,paths } from "@/lib/providers/tripjack";
import { cancellationBody } from "@/lib/cancellation-scope";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{sameOrigin(request);await administrator(request,"cancellations:manage");const id=z.string().uuid().parse((await context.params).id);const found=await database().query("SELECT c.reason,c.scope,o.product,o.supplier_booking_id,o.policy_snapshot FROM cancellation_requests c JOIN orders o ON o.id=c.order_id WHERE c.id=$1",[id]);const row=found.rows[0];if(!row?.supplier_booking_id)throw new HttpError(404,"Supplier booking unavailable.");if(row.product==="FLIGHT")return json(await tripjack("FLIGHT","/oms/v1/air/amendment/amendment-charges",cancellationBody(row),true));const details=await tripjack("HOTEL",paths.HOTEL.details,{bookingId:row.supplier_booking_id},true);return json({supplierStatus:details.order?.status,savedBookingPolicy:row.policy_snapshot,message:"Confirm the current cancellation charges before sending terms to the customer."});}catch(e){return failure(e);}}
