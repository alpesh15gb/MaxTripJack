import { administrator } from "@/lib/access";
import { tripjack } from "@/lib/providers/tripjack";
import { json,failure } from "@/lib/http";
import { z } from "zod";
export async function GET(request:Request){try{await administrator(request,"finance:read");const result=await tripjack("FLIGHT","/ums/v1/user-detail",undefined,false,"GET");const data=z.object({userId:z.string(),walletBalance:z.number().finite(),creditBalance:z.number().finite(),totalBalance:z.number().finite(),totalOutStanding:z.number().finite()}).parse(result);return json({...data,currency:"INR",checkedAt:new Date().toISOString()});}catch(e){return failure(e);}}
