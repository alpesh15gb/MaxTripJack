import {hotelObject,hotelPropertyDetails,type HotelPropertyDetails} from './hotel-presentation';

/** Static booking metadata may reuse recent UAT catalogue facts only. Production
 * IDs are deliberately excluded while the booking supplier remains UAT. */
export const STORED_HOTEL_CONTENT_SQL=`SELECT hotel_id,content FROM hotel_catalogue
 WHERE environment='uat' AND hotel_id=ANY($1::text[]) AND active=true AND content_ready=true
 AND checked_at>now()-interval '7 days' AND checked_at<=now()+interval '5 minutes'`;

/** Run the same safe static-field projection used for fresh supplier content.
 * Never return catalogue internals, names, rates, reviews or cancellation data. */
export function storedHotelProperty(raw:unknown):HotelPropertyDetails{
 const content=hotelObject(raw);
 return hotelPropertyDetails({
  star_rating:content.starRating,property_type:{name:content.propertyType},
  locale:{address:{city:content.city,countrycode:content.countryCode,fulladdr:content.address}},
  amenities:Object.fromEntries((Array.isArray(content.amenities)?content.amenities:[]).slice(0,40).map((name,index)=>[index,{name}])),
  images:(Array.isArray(content.photos)?content.photos:[]).slice(0,10).map(raw=>{const photo=hotelObject(raw);return{caption:photo.caption,is_hero_image:photo.isHero,links:{Standard:{href:photo.url}}};}),
  descriptions:{headline:content.descriptionHeadline,default:JSON.stringify({Overview:typeof content.description==='string'?content.description:''})},
 });
}

export async function storedHotelProperties(ids:string[],query:(sql:string,values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>){
 if(ids.length>100||ids.some(id=>!/^\d{1,30}$/.test(id)))throw Error('Invalid hotel content scope.');
 const result:Record<string,HotelPropertyDetails>={};
 if(!ids.length)return result;
 const allowed=new Set(ids);
 for(const row of (await query(STORED_HOTEL_CONTENT_SQL,[ids])).rows){
  const id=String(row.hotel_id);
  if(allowed.has(id))result[id]=storedHotelProperty(row.content);
 }
 return result;
}
