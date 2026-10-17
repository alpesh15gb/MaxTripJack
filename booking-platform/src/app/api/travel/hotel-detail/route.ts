import { z } from "zod";
import { principal } from "@/lib/access";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { customerHotelDetail } from "@/lib/supplier-flow";
export async function POST(request:Request){try{sameOrigin(request);const actor=await principal(request);const data=await body(request,z.object({searchId:z.string().uuid(),hid:z.string().regex(/^\d+$/)}).strict());return json(await customerHotelDetail(data.searchId,data.hid,actor));}catch(e){return failure(e);}}
