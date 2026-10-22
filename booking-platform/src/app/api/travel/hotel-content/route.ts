import { z } from "zod";
import { shoppingAccess } from "@/lib/guest-shopping";
import { body,sameOrigin,json,failure,HttpError } from "@/lib/http";
import { customerHotelContent } from "@/lib/supplier-flow";
/** Optional static content only. Never returns or caches rates, inventory or traveller data. */
export async function POST(request:Request){try{
 sameOrigin(request);
 const data=await body(request,z.object({searchId:z.string().uuid()}).strict());
 const {actor}=await shoppingAccess(request,"detail");
 return json(await customerHotelContent(data.searchId,actor));
}catch(e){return failure(e instanceof HttpError&&e.status===404?new HttpError(409,"This search is no longer available in this browser. Search again to continue."):e);}}
