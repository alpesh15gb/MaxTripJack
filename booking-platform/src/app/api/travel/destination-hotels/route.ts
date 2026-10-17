import { z } from "zod";
import { principal } from "@/lib/access";
import { database } from "@/lib/db";
import { tripjack } from "@/lib/providers/tripjack";
import { body,sameOrigin,json,failure,HttpError } from "@/lib/http";
export async function POST(request:Request){try{sameOrigin(request);await principal(request);const input=await body(request,z.object({regionId:z.string().regex(/^\d+$/),page:z.number().int().min(0).max(500).default(0)}).strict());const city=await database().query("SELECT label FROM hotel_destinations WHERE region_id=$1",[input.regionId]);if(!city.rowCount)throw new HttpError(404,"Destination is not available in the catalogue.");const result=await tripjack("HOTEL","/hms/v3/content/fetch-hotel-mapping",{regionIds:[input.regionId],page:input.page,size:100});const ids=z.array(z.object({tjHotelId:z.union([z.string().regex(/^\d+$/),z.number().int()])})).parse(result.hotels).map(h=>String(h.tjHotelId));return json({hotelIds:ids,label:city.rows[0].label,page:input.page,hasMore:input.page+1<Number(result.pageable?.totalPages??1)});}catch(e){return failure(e);}}
