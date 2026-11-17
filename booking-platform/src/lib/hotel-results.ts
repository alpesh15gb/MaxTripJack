import {hotelStringList,type HotelPropertyDetails} from './hotel-presentation';
import type {HotelContentStatus} from './hotel-content-cache';
export type HotelResult={tjHotelId:string;originSearchId?:string;name:string;customerEstimateMinor?:number|null;property?:HotelPropertyDetails;propertyContentStatus?:HotelContentStatus};
export type HotelStayContext={checkIn:string;checkOut:string;rooms:number;guests:number};
export type HotelFilters={name:string;area:string;amenities:string;category:string;type:string;budget:string};
export const emptyHotelFilters:HotelFilters={name:'',area:'',amenities:'',category:'',type:'',budget:''};
const practicalAmenities=[
 {id:'wifi',label:'Wi-Fi',matches:(text:string)=>/\bwi ?fi\b|\bwireless internet\b/.test(text)},
 {id:'parking',label:'Parking',matches:(text:string)=>/\bparking\b/.test(text)},
 {id:'pool',label:'Swimming pool',matches:(text:string)=>/\bswimming pools?\b|\b(?:indoor|outdoor|children s|kids) pools?\b|^pools?$/.test(text)},
 {id:'restaurant',label:'Restaurant',matches:(text:string)=>/\brestaurants?\b/.test(text)},
 {id:'fitness',label:'Fitness facilities',matches:(text:string)=>/\bfitness cent(?:re|er)\b|\bgym(?:nasium)?\b/.test(text)},
 {id:'air-conditioning',label:'Air conditioning',matches:(text:string)=>/\bair condition(?:ing|ed)\b|\baircon\b/.test(text)},
] as const;
export type HotelAmenityId=typeof practicalAmenities[number]['id'];
const comparableText=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** Stable public preference IDs keep tab-local storage small; no supplier payload is persisted. */
export function selectedHotelAmenities(value:string|undefined):HotelAmenityId[]{
 const requested=new Set((value??'').slice(0,150).split(','));
 return practicalAmenities.filter(item=>requested.has(item.id)).map(item=>item.id);
}
export function hotelPracticalAmenities(hotel:HotelResult):HotelAmenityId[]{
 const supplied=hotelAmenities(hotel.property?.amenities).map(comparableText);
 return practicalAmenities.filter(item=>supplied.some(item.matches)).map(item=>item.id);
}
export function hotelAmenityOptions(hotels:HotelResult[],selected:string=''):{id:HotelAmenityId;label:string;count:number}[]{
 const counts=new Map<HotelAmenityId,number>();
 for(const hotel of hotels)for(const id of hotelPracticalAmenities(hotel))counts.set(id,(counts.get(id)??0)+1);
 const retained=selectedHotelAmenities(selected);
 return practicalAmenities.map(({id,label})=>({id,label,count:counts.get(id)??0})).filter(item=>item.count>0||retained.includes(item.id));
}
/** Match a phrase within one supplied location field; never invent a nearby locality. */
export function hotelAreaMatches(hotel:HotelResult,area:string):boolean{
 const phrase=comparableText(area);
 if(!phrase)return !area.trim();
 return [hotel.property?.city,hotel.property?.address].some(value=>value&&` ${comparableText(value)} `.includes(` ${phrase} `));
}
export function stayNights(context:HotelStayContext|null):number|null{
 if(!context||!/^\d{4}-\d{2}-\d{2}$/.test(context.checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(context.checkOut))return null;
 const nights=(Date.parse(context.checkOut+'T00:00:00Z')-Date.parse(context.checkIn+'T00:00:00Z'))/86400000;
 return Number.isInteger(nights)&&nights>0?nights:null;
}
/** These are benefit badges, not a complete accessibility statement. Preserve
 * the supplier text; exclude negations rather than turning them into positives. */
export function hotelAmenities(items:unknown=[]):string[]{
 const seen=new Set<string>();
 return hotelStringList(items).filter(item=>{
  const key=item.toLocaleLowerCase();
  if(seen.has(key)||/\b(?:no|not|without|unavailable|unprovided)\b/i.test(item))return false;
  seen.add(key);return true;
 });
}
export function knownHotelTotal(hotel:HotelResult):number|null{
 const value=hotel.customerEstimateMinor;return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
}
export function filterHotelResults<T extends HotelResult>(hotels:T[],filters:HotelFilters,sort:string):T[]{
 const budget=filters.budget.trim()?Number(filters.budget):null;
 const amenities=selectedHotelAmenities(filters.amenities);
 return hotels.filter(hotel=>{
  const suppliedAmenities=amenities.length?hotelPracticalAmenities(hotel):[];
  return (!filters.name.trim()||hotel.name.toLocaleLowerCase().includes(filters.name.trim().toLocaleLowerCase()))&&(!filters.area?.trim()||hotelAreaMatches(hotel,filters.area))&&amenities.every(id=>suppliedAmenities.includes(id))&&(!filters.category||String(hotel.property?.starRating)===filters.category)&&(!filters.type||hotel.property?.propertyType===filters.type)&&(budget===null||(Number.isFinite(budget)&&budget>=0&&knownHotelTotal(hotel)!==null&&knownHotelTotal(hotel)!<=budget*100));
 }).sort((a,b)=>{
  if(sort==='name')return a.name.localeCompare(b.name);
  if(sort==='supplier')return 0;
  const x=knownHotelTotal(a),y=knownHotelTotal(b);if(x===null)return y===null?0:1;if(y===null)return -1;
  return sort==='price-desc'?y-x:x-y;
 });
}

/** Settle only the failed metadata source, retaining successful cached content and
 * independent pending lookups from other city-search batches. */
export function hotelContentUnavailable<T extends HotelResult>(hotels:T[],baseSearchId:string,sourceSearchId=baseSearchId):T[]{
 return hotels.map(hotel=>(hotel.originSearchId??baseSearchId)===sourceSearchId&&hotel.propertyContentStatus==='pending'?{...hotel,propertyContentStatus:'unavailable'}:hotel);
}
