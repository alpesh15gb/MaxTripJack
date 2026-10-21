import { z } from "zod";
import { shoppingAccess } from "@/lib/guest-shopping";
import { tripjack } from "@/lib/providers/tripjack";
import { json,failure } from "@/lib/http";
let cached:{expires:number;rows:{countryId:string;name:string;code:string}[]}|undefined;
export async function GET(request:Request){try{await shoppingAccess(request,"catalogue");if(!cached||cached.expires<Date.now()){const result=await tripjack("HOTEL","/hms/v3/nationality-info",undefined,false,"GET");const rows=z.array(z.object({countryId:z.string().regex(/^\d+$/),name:z.string(),code:z.string()})).parse(result.nationalityInfos);cached={expires:Date.now()+86400000,rows};}return json({nationalities:cached.rows});}catch(e){return failure(e);}}
