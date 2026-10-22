import type {HotelPropertyDetails} from './hotel-presentation';
import type {HotelContentStatus} from './hotel-content-cache';
export type HotelResult={tjHotelId:string;name:string;customerEstimateMinor?:number|null;property?:HotelPropertyDetails;propertyContentStatus?:HotelContentStatus};
export type HotelStayContext={checkIn:string;checkOut:string;rooms:number;guests:number};
export type HotelFilters={name:string;category:string;type:string;budget:string};
export const emptyHotelFilters:HotelFilters={name:'',category:'',type:'',budget:''};
export function stayNights(context:HotelStayContext|null):number|null{
 if(!context||!/^\d{4}-\d{2}-\d{2}$/.test(context.checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(context.checkOut))return null;
 const nights=(Date.parse(context.checkOut+'T00:00:00Z')-Date.parse(context.checkIn+'T00:00:00Z'))/86400000;
 return Number.isInteger(nights)&&nights>0?nights:null;
}
export function hotelAmenities(items:string[]=[]):string[]{
 const seen=new Set<string>();return items.map(item=>item.trim()).filter(item=>{const key=item.toLocaleLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;});
}
export function knownHotelTotal(hotel:HotelResult):number|null{
 const value=hotel.customerEstimateMinor;return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
}
export function filterHotelResults<T extends HotelResult>(hotels:T[],filters:HotelFilters,sort:string):T[]{
 const budget=filters.budget.trim()?Number(filters.budget):null;
 return hotels.filter(hotel=>(!filters.name.trim()||hotel.name.toLocaleLowerCase().includes(filters.name.trim().toLocaleLowerCase()))&&(!filters.category||String(hotel.property?.starRating)===filters.category)&&(!filters.type||hotel.property?.propertyType===filters.type)&&(budget===null||(Number.isFinite(budget)&&budget>=0&&knownHotelTotal(hotel)!==null&&knownHotelTotal(hotel)!<=budget*100))).sort((a,b)=>{
  if(sort==='name')return a.name.localeCompare(b.name);
  if(sort==='supplier')return 0;
  const x=knownHotelTotal(a),y=knownHotelTotal(b);if(x===null)return y===null?0:1;if(y===null)return -1;
  return sort==='price-desc'?y-x:x-y;
 });
}
