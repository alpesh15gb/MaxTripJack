import { z } from "zod";
import { principal } from "@/lib/access";
import { owned } from "@/lib/supplier-flow";
import { database } from "@/lib/db";
import { unseal } from "@/lib/vault";
import { cancellationOptions,CancellationScope } from "@/lib/cancellation-scope";
import { json,failure } from "@/lib/http";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const actor=await principal(request);const id=z.string().uuid().parse((await context.params).id);const order=await owned("orders",id,actor);
 const quote=order.quote_id?await database().query("SELECT review FROM supplier_quotes WHERE id=$1",[order.quote_id]):null;
 const options=order.product==="FLIGHT"?cancellationOptions(quote?.rows[0]?.review??{},order.guests_encrypted?unseal(order.guests_encrypted,id):{},order.itinerary_summary):{trips:[],travellers:[]};
 const previous=await database().query<{scope:CancellationScope|null}>("SELECT scope FROM cancellation_requests WHERE order_id=$1 AND status='CONFIRMED'",[id]);
 return json({...options,cancelledUnits:previous.rows.flatMap(row=>row.scope?.units??options.trips.flatMap((_,i)=>options.travellers.map((_,j)=>`${i}:${j}`)))});
}catch(e){return failure(e);}}
