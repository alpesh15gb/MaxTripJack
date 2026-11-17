import {z} from 'zod';
import {shoppingAccess} from '@/lib/guest-shopping';
import {database} from '@/lib/db';
import {tripjack} from '@/lib/providers/tripjack';
import {body,sameOrigin,json,failure,HttpError} from '@/lib/http';
import {destinationCursorSchema,destinationPage,destinationPageResult} from '@/lib/hotel-destination-pages';
import {cachedHotelDestinationMapping} from '@/lib/hotel-destination-cache';

export async function POST(request:Request){
 try{
  sameOrigin(request);await shoppingAccess(request,'detail');
  const input=await body(request,z.object({regionId:z.string().regex(/^\d{1,30}$/),cursor:destinationCursorSchema.optional(),page:z.number().int().min(0).max(500).optional()}).strict().refine(value=>value.page===undefined||value.cursor===undefined,{message:'Choose either a page or a continuation cursor.'}));
  const city=await database().query('SELECT name,country,label FROM hotel_destinations WHERE region_id=$1',[input.regionId]);
  if(!city.rowCount)throw new HttpError(404,'Destination is not available in the catalogue.');
  // Older native clients use a numeric page for one supplier region. Keep that
  // contract additive; the web omits page and uses the city-wide cursor below.
  if(input.page!==undefined){
   const mapping={regionIds:[input.regionId],page:input.page};
   const result=await cachedHotelDestinationMapping(mapping,()=>tripjack('HOTEL','/hms/v3/content/fetch-hotel-mapping',{...mapping,size:100}));
   const mapped=destinationPageResult([input.regionId],`0:${input.page}`,result);
   return json({hotelIds:mapped.hotelIds,label:city.rows[0].label,page:input.page,hasMore:input.page+1<Number(result.pageable?.totalPages??1)});
  }
  // Every matching supplier region participates in one customer destination.
  const regions=await database().query('SELECT region_id FROM hotel_destinations WHERE lower(trim(name))=lower(trim($1)) AND lower(trim(country))=lower(trim($2)) AND lower(trim(label))=lower(trim($3)) ORDER BY region_id',[city.rows[0].name,city.rows[0].country,city.rows[0].label]);
  const regionIds=regions.rows.map(row=>String(row.region_id));
  let page;try{page=destinationPage(regionIds,input.cursor);}catch{throw new HttpError(400,'Destination continuation is no longer available. Choose the city again.');}
  const mapping={regionIds:page.regionIds,page:page.page};
  const result=await cachedHotelDestinationMapping(mapping,()=>tripjack('HOTEL','/hms/v3/content/fetch-hotel-mapping',{...mapping,size:100}));
  return json({...destinationPageResult(regionIds,input.cursor,result),regionId:input.regionId,label:city.rows[0].label});
 }catch(error){return failure(error);}
}
