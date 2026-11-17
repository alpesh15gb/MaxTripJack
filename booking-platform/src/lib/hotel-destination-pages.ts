import {z} from 'zod';

export const destinationCursorSchema=z.string().regex(/^\d{1,6}:\d{1,6}$/);
const regionBatchSize=20;
const mappingResponseSchema=z.object({hotels:z.array(z.object({tjHotelId:z.union([z.string().regex(/^\d{1,30}$/),z.number().int().nonnegative().safe()])})).max(100),pageable:z.object({totalPages:z.union([z.number().int().nonnegative().max(999999),z.string().regex(/^\d{1,6}$/).transform(Number)]).nullish()}).nullish()});
/** Keep only static IDs/pagination; duplicate rows still count toward a full page. */
export function hotelMappingResponse(response:unknown){
 const data=mappingResponseSchema.parse(response);
 return {hotels:data.hotels.map(hotel=>({tjHotelId:String(hotel.tjHotelId)})),
  ...(data.pageable?.totalPages!=null?{pageable:{totalPages:data.pageable.totalPages}}:{})};
}
export function destinationPage(regionIds:string[],cursor='0:0'){
 destinationCursorSchema.parse(cursor);
 const [offset,page]=cursor.split(':').map(Number);
 if(offset%regionBatchSize!==0||offset>=regionIds.length)throw Error('Destination continuation is no longer available. Choose the city again.');
 return {offset,page,regionIds:regionIds.slice(offset,offset+regionBatchSize)};
}
/** One bounded supplier request per continuation. Missing pagination metadata
 * on a full page must not silently hide remaining inventory. */
export function destinationPageResult(regionIds:string[],cursor:string|undefined,response:unknown){
 const current=destinationPage(regionIds,cursor);
 const data=hotelMappingResponse(response);
 const morePages=data.pageable?.totalPages!=null?current.page+1<data.pageable.totalPages:data.hotels.length===100;
 const nextCursor=morePages?`${current.offset}:${current.page+1}`:current.offset+regionBatchSize<regionIds.length?`${current.offset+regionBatchSize}:0`:null;
 return {hotelIds:[...new Set(data.hotels.map(hotel=>String(hotel.tjHotelId)))],nextCursor,hasMore:nextCursor!==null};
}
export function uniqueDestinations<T extends {region_id:string;label:string}>(cities:T[]):T[]{
 const seen=new Set<string>();
 return cities.filter(city=>{const key=city.label.trim().toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
}
