import { z } from "zod";
import { principal } from "@/lib/access";
import { owned } from "@/lib/supplier-flow";
import { failure } from "@/lib/http";
import { bookingDocument } from "@/lib/booking-document";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const actor=await principal(request);const id=z.string().uuid().parse((await context.params).id);await owned("orders",id,actor);return await bookingDocument(id);}catch(e){return failure(e);}}
