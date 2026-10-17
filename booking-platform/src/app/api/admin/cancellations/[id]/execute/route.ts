import { administrator } from "@/lib/access";
import { executeCancellation } from "@/lib/cancellation-runner";
import { sameOrigin,json,failure } from "@/lib/http";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{sameOrigin(request);const actor=await administrator(request,"cancellations:execute");return json(await executeCancellation((await context.params).id,actor.userId));}catch(e){return failure(e);}}
