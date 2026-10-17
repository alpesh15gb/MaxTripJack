import { z } from "zod";
import { principal } from "@/lib/access";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { availableServiceOptions,searchFlightService,serviceSearchSchema } from "@/lib/flight-services";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const actor=await principal(request);return json(await availableServiceOptions(z.string().uuid().parse((await context.params).id),actor));}catch(e){return failure(e);}}
export async function POST(request:Request,context:Context){try{sameOrigin(request);const actor=await principal(request);return json(await searchFlightService(z.string().uuid().parse((await context.params).id),await body(request,serviceSearchSchema),actor));}catch(e){return failure(e);}}
