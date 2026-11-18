import { z } from "zod";
import { checkoutAccess } from "@/lib/guest-shopping";
import { claimGuestBookings } from "@/lib/guest-checkout";
import { owned } from "@/lib/supplier-flow";
import { failure } from "@/lib/http";
import { bookingDocument } from "@/lib/booking-document";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const access=await checkoutAccess(request),actor=access.actor;await claimGuestBookings(actor,access.user);const id=z.string().uuid().parse((await context.params).id);await owned("orders",id,actor);return await bookingDocument(id);}catch(e){return failure(e);}}
