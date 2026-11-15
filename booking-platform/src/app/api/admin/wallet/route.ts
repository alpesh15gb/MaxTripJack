import { administrator } from "@/lib/access";
import { tripjack } from "@/lib/providers/tripjack";
import { json,failure,HttpError } from "@/lib/http";
import { tripjackAccountBalances } from "@/lib/providers/tripjack-wallet";
export async function GET(request:Request){try{await administrator(request,"finance:read");const result=await tripjack("FLIGHT","/ums/v1/user-detail",undefined,false,"GET");const data=tripjackAccountBalances(result);if(!data)throw new HttpError(502,"Supplier account balances are unavailable.");return json({...data,currency:"INR",checkedAt:new Date().toISOString()});}catch(e){return failure(e);}}
