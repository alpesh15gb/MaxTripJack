import { z } from "zod";
import { checkoutAccess, claimGuestSearch, shoppingResponse } from "@/lib/guest-shopping";
import { isGuestActor } from "@/lib/guest-checkout";
import { body,sameOrigin,json,failure,HttpError } from "@/lib/http";
import { reviewSupplier } from "@/lib/supplier-flow";
export async function POST(request:Request){try{sameOrigin(request);const access=await checkoutAccess(request),actor=access.actor;const data=await body(request,z.object({searchId:z.string().uuid(),priceIds:z.array(z.string().min(1).max(200)).min(1).max(6).optional(),hid:z.string().regex(/^\d+$/).optional(),optionId:z.string().min(1).max(200).optional()}).strict());if(!isGuestActor(actor))await claimGuestSearch(request,data.searchId,actor);return shoppingResponse(json(await reviewSupplier(data.searchId,data,actor)),access);}catch(e){return failure(e instanceof HttpError&&e.status===404?new HttpError(409,"This search is no longer available in this browser. Search again to continue."):e);}}
