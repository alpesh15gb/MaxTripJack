import { principal } from "@/lib/access";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { searchSchema } from "@/lib/providers/contracts";
import { searchSupplier } from "@/lib/supplier-flow";
export async function POST(request:Request){try{sameOrigin(request);const actor=await principal(request);return json(await searchSupplier(await body(request,searchSchema),actor));}catch(e){return failure(e);}}
