import { z } from "zod";
import { shoppingAccess } from "@/lib/guest-shopping";
import { body,sameOrigin,json,failure,HttpError } from "@/lib/http";
import { customerHotelDetail } from "@/lib/supplier-flow";
export async function POST(request:Request){try{sameOrigin(request);const {actor}=await shoppingAccess(request,"detail");const data=await body(request,z.object({searchId:z.string().uuid(),hid:z.string().regex(/^\d+$/)}).strict());return json(await customerHotelDetail(data.searchId,data.hid,actor));}catch(e){return failure(e instanceof HttpError&&e.status===404?new HttpError(409,"This search is no longer available in this browser. Search again to continue."):e);}}
