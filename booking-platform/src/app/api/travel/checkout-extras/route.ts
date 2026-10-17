import { z } from "zod";
import { principal } from "@/lib/access";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { checkoutChoices } from "@/lib/checkout-extras-contract";
import { extrasCatalogue,saveCheckoutExtras } from "@/lib/checkout-extras";
export async function GET(request:Request){try{const actor=await principal(request);const id=z.string().uuid().parse(new URL(request.url).searchParams.get("quoteId"));return json(await extrasCatalogue(id,actor));}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const actor=await principal(request);const input=await body(request,z.object({quoteId:z.string().uuid(),choices:checkoutChoices}).strict());return json(await saveCheckoutExtras(input.quoteId,input.choices,actor));}catch(e){return failure(e);}}
