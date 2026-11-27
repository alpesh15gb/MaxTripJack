import {hotelCancellation,hotelCancellationScheduleIsUnambiguous,hotelStringList,type HotelPropertyDetails} from './hotel-presentation';
import type {HotelContentStatus} from './hotel-content-cache';
import {hasFreeCancellation,includesBreakfast,type RoomPlan} from './hotel-room-filters';
import {supplierInstant} from './supplier-time';
type HotelListingRate=RoomPlan & {optionId:string;optionType?:string;roomInfo?:{name:string}[];pricing:{totalPrice:number}};
export type HotelResult={tjHotelId:string;originSearchId?:string;name:string;customerEstimateMinor?:number|null;property?:HotelPropertyDetails;propertyContentStatus?:HotelContentStatus;options?:HotelListingRate[]};
export type HotelStayContext={checkIn:string;checkOut:string;rooms:number;guests:number};
export const hotelBoardLabels={
 'room-only':'Room only', breakfast:'Breakfast included', dinner:'Dinner included',
 'half-board':'Half board', 'full-board':'Full board', 'all-inclusive':'All inclusive',
} as const;
export type HotelBoard=keyof typeof hotelBoardLabels;
export function isHotelBoard(value:unknown):value is HotelBoard{
 return typeof value==='string'&&Object.hasOwn(hotelBoardLabels,value);
}
export const hotelTextFilterKeys=['name','area','amenities','category','type','budget'] as const;
export type HotelFilters=Record<(typeof hotelTextFilterKeys)[number],string> & {board:HotelBoard|'';freeCancellation:boolean};
export const emptyHotelFilters:HotelFilters={name:'',area:'',amenities:'',category:'',type:'',budget:'',board:'',freeCancellation:false};
type HotelRateFilters=Pick<HotelFilters,'board'|'freeCancellation'>;
const explicitBoards=new Map<string,HotelBoard>([
 ['ROOM_ONLY','room-only'],['BED_ONLY','room-only'],['BO','room-only'],
 ['DINNER','dinner'],['DINNER_INCLUDED','dinner'],['HALF_BOARD','half-board'],
 ['FULL_BOARD','full-board'],['ALL_INCLUSIVE','all-inclusive'],
]);
function boardForRate(rate:HotelListingRate):HotelBoard|undefined{
 // TripJack's cross-meal plans do not guarantee one board for all selected rooms.
 const optionType=rate.optionType?.trim().toUpperCase();
 if(optionType==='SRCM'||optionType==='CRCM')return undefined;
 const meal=rate.mealBasis?.trim().toUpperCase().replace(/[ -]+/g,'_')??'';
 return explicitBoards.get(meal)??(includesBreakfast(rate)?'breakfast':undefined);
}
function listedRateTotal(rate:HotelListingRate):number|null{
 if(typeof rate.optionId!=='string'||!rate.optionId.trim()||!Number.isFinite(rate.pricing?.totalPrice))return null;
 const totalMinor=Math.round(rate.pricing.totalPrice*100);
 return Number.isSafeInteger(totalMinor)&&totalMinor>0?totalMinor:null;
}
export function hasHotelRateFilters(filters:HotelRateFilters):boolean{
 return Boolean(filters.board||filters.freeCancellation);
}
export function lowestMatchingHotelRate<T extends HotelListingRate>(rates:T[]|undefined,filters:HotelRateFilters,now:number){
 let match:{rate:T;totalMinor:number}|null=null;
 for(const rate of rates??[]){
  const totalMinor=listedRateTotal(rate);
  if(totalMinor===null||(match&&totalMinor>=match.totalMinor))continue;
  if(filters.board&&boardForRate(rate)!==filters.board)continue;
  if(filters.freeCancellation&&!hasFreeCancellation(rate,now))continue;
  match={rate,totalMinor};
 }
 return match;
}
export function hotelRateFacets(hotels:HotelResult[],now:number){
 const boards=new Set<HotelBoard>();
 let freeCancellation=false;
 for(const hotel of hotels)for(const rate of hotel.options??[]){
  if(listedRateTotal(rate)===null)continue;
  const board=boardForRate(rate);
  if(board)boards.add(board);
  freeCancellation ||= hasFreeCancellation(rate,now);
 }
 return {boards,freeCancellation};
}
export function nextHotelCancellationChange(hotels:HotelResult[],now:number):number|null{
 let next=Infinity;
 for(const hotel of hotels)for(const rate of hotel.options??[]){
  if(listedRateTotal(rate)===null)continue;
  const cancellation=hotelCancellation(rate.cancellation);
  if(cancellation.isRefundable===false||!hotelCancellationScheduleIsUnambiguous(cancellation))continue;
  for(const period of cancellation.penalties){
   if(period.amount!==0)continue;
   for(const boundary of [period.from,period.to]){
    const instant=supplierInstant(boundary,'+05:30');
    if(instant!==null&&instant>now&&instant<next)next=instant;
   }
  }
 }
 return Number.isFinite(next)?next:null;
}
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
export function filterHotelResults<T extends HotelResult>(hotels:T[],filters:HotelFilters,sort:string,now=Date.now()):T[]{
 const budget=filters.budget.trim()?Number(filters.budget):null;
 const amenities=selectedHotelAmenities(filters.amenities);
 const filterRates=hasHotelRateFilters(filters);
 return hotels.flatMap(hotel=>{
  const suppliedAmenities=amenities.length?hotelPracticalAmenities(hotel):[];
  const propertyMatches=(!filters.name.trim()||hotel.name.toLocaleLowerCase().includes(filters.name.trim().toLocaleLowerCase()))&&(!filters.area?.trim()||hotelAreaMatches(hotel,filters.area))&&amenities.every(id=>suppliedAmenities.includes(id))&&(!filters.category||String(hotel.property?.starRating)===filters.category)&&(!filters.type||hotel.property?.propertyType===filters.type);
  if(!propertyMatches)return [];
  const total=filterRates?(lowestMatchingHotelRate(hotel.options,filters,now)?.totalMinor??null):knownHotelTotal(hotel);
  if((filterRates&&total===null)||(budget!==null&&(!Number.isFinite(budget)||budget<0||total===null||total>budget*100)))return [];
  return [{hotel,total}];
 }).sort((a,b)=>{
  if(sort==='name')return a.hotel.name.localeCompare(b.hotel.name);
  if(sort==='supplier')return 0;
  const x=a.total,y=b.total;if(x===null)return y===null?0:1;if(y===null)return -1;
  return sort==='price-desc'?y-x:x-y;
 }).map(result=>result.hotel);
}

/** Settle only the failed metadata source, retaining successful cached content and
 * independent pending lookups from other city-search batches. */
export function hotelContentUnavailable<T extends HotelResult>(hotels:T[],baseSearchId:string,sourceSearchId=baseSearchId):T[]{
 return hotels.map(hotel=>(hotel.originSearchId??baseSearchId)===sourceSearchId&&hotel.propertyContentStatus==='pending'?{...hotel,propertyContentStatus:'unavailable'}:hotel);
}
