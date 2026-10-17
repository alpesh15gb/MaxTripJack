import { z } from "zod";
import { principal } from "@/lib/access";
import { body,sameOrigin,failure } from "@/lib/http";
import { requestCancellation,cancellationRequestSchema } from "@/lib/cancellation-request";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{sameOrigin(request);const actor=await principal(request);const id=z.string().uuid().parse((await context.params).id);return await requestCancellation(id,await body(request,cancellationRequestSchema),actor);}catch(error){return failure(error);}}
