import { z } from "zod";
import { checkoutAccess, shoppingResponse } from "@/lib/guest-shopping";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { checkoutChoices } from "@/lib/checkout-extras-contract";
import { extrasCatalogue,saveCheckoutExtras } from "@/lib/checkout-extras";
export async function GET(request:Request){try{const access=await checkoutAccess(request),actor=access.actor;const id=z.string().uuid().parse(new URL(request.url).searchParams.get("quoteId"));return shoppingResponse(json(await extrasCatalogue(id,actor)),access);}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const access=await checkoutAccess(request),actor=access.actor;const input=await body(request,z.object({quoteId:z.string().uuid(),choices:checkoutChoices}).strict());return shoppingResponse(json(await saveCheckoutExtras(input.quoteId,input.choices,actor)),access);}catch(e){return failure(e);}}
