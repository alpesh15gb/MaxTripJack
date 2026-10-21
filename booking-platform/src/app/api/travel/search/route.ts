import { shoppingAccess, shoppingResponse } from "@/lib/guest-shopping";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { searchSchema } from "@/lib/providers/contracts";
import { searchSupplier } from "@/lib/supplier-flow";
export async function POST(request:Request){try{sameOrigin(request);const criteria=await body(request,searchSchema);const access=await shoppingAccess(request,"search");return shoppingResponse(json(await searchSupplier(criteria,access.actor)),access);}catch(e){return failure(e);}}
