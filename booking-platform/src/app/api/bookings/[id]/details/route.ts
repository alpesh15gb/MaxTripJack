import { z } from "zod";
import { principal } from "@/lib/access";
import { owned } from "@/lib/supplier-flow";
import { database } from "@/lib/db";
import { unseal } from "@/lib/vault";
import { json,failure } from "@/lib/http";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const actor=await principal(request);const id=z.string().uuid().parse((await context.params).id);const order=await owned("orders",id,actor);const payload=await database().query("SELECT encrypted_payload FROM supplier_booking_payloads WHERE order_id=$1",[id]);const source=payload.rows[0]?unseal(payload.rows[0].encrypted_payload,id):{};
 const passengers:{name:string;pnrs:string[];tickets:string[]}[]=[];
 function visit(value:unknown){if(!value||typeof value!=="object")return;if(Array.isArray(value)){value.forEach(visit);return;}const obj=value as Record<string,unknown>;if(obj.pnrDetails||obj.ticketNumberDetails){const strings=(v:unknown)=>v&&typeof v==="object"?Object.values(v).filter((x):x is string=>typeof x==="string"):[];passengers.push({name:[obj.fN,obj.lN].filter(x=>typeof x==="string").join(" "),pnrs:strings(obj.pnrDetails),tickets:strings(obj.ticketNumberDetails)});}Object.values(obj).forEach(visit);}
 visit(source);const service=order.service_kind?(await database().query("SELECT service_payload FROM supplier_quotes WHERE id=$1",[order.quote_id])).rows[0]?.service_payload:null;return json({reference:order.reference,status:order.status,supplierBookingId:service?.oldBookingId??order.supplier_booking_id,serviceKind:order.service_kind,extras:service?.summary??(order.itinerary_summary?.checkoutExtras??[]).map((extra:{travellerIndex:number;segment:string;kind:string;label:string})=>{const guest=unseal(order.guests_encrypted,id).travellers[extra.travellerIndex];return {...extra,passenger:guest?`${guest.fN} ${guest.lN}`:`Traveller ${extra.travellerIndex+1}`};}),passengers,hotelName:source.itemInfos?.HOTEL?.hInfo?.name??null});
}catch(e){return failure(e);}}
