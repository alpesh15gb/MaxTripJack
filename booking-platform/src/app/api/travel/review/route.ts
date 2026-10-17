import { z } from "zod";
import { principal } from "@/lib/access";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { reviewSupplier } from "@/lib/supplier-flow";
export async function POST(request:Request){try{sameOrigin(request);const actor=await principal(request);const data=await body(request,z.object({searchId:z.string().uuid(),priceIds:z.array(z.string().min(1).max(200)).min(1).max(6).optional(),hid:z.string().regex(/^\d+$/).optional(),optionId:z.string().min(1).max(200).optional()}).strict());return json(await reviewSupplier(data.searchId,data,actor));}catch(e){return failure(e);}}
