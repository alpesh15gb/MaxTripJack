import { administrator } from "@/lib/access";
import { sameOrigin,json,failure } from "@/lib/http";
import { executeRefund } from "@/lib/refund-runner";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{sameOrigin(request);const actor=await administrator(request,"refunds:execute");return json(await executeRefund((await context.params).id,actor.userId));}catch(e){return failure(e);}}
