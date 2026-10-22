import { shoppingAccess, shoppingResponse } from "@/lib/guest-shopping";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { searchSchema } from "@/lib/providers/contracts";
import { searchSupplier } from "@/lib/supplier-flow";
import { SearchTiming } from "@/lib/search-timing";
export async function POST(request:Request){
 const timing=new SearchTiming();let response:Response;
 try{sameOrigin(request);const criteria=await body(request,searchSchema);const access=await timing.measure("access",()=>shoppingAccess(request,"search"));const result=await searchSupplier(criteria,access.actor,timing);response=shoppingResponse(timing.sync("serialize",()=>json(result)),access);}
 catch(e){response=failure(e);}
 response.headers.set("Server-Timing",timing.header());return response;
}
