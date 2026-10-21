import { flightFareDetails } from "./flight-fare-details";
import { hotelObject, hotelRoomInfo, hotelText, hotelStringList, hotelCancellation, hotelPropertyDetails, type HotelRoomOption } from "./hotel-presentation";
import { hotelListingId } from "./hotel-listing-id";
import { minor,Search } from "./providers/contracts";
export type PricingRule={markup_minor:number|string;markup_basis_points:number;service_fee_minor:number|string};
export function customerTotal(base:number,rule?:PricingRule){const value=base+(rule?Number(rule.markup_minor)+Math.round(base*rule.markup_basis_points/10000)+Number(rule.service_fee_minor):0);if(!Number.isSafeInteger(value)||value<=0)throw Error("Invalid customer price");return value;}
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function customerFlightResults(source:unknown,criteria:Extract<Search,{product:"FLIGHT"}>,rule?:PricingRule){const groups=object(object(object(source).searchResult).tripInfos);const tripInfos:Record<string,unknown[]>={};for(const [group,value]of Object.entries(groups)){if(!Array.isArray(value))continue;tripInfos[group]=value.map(raw=>{const trip=object(raw);const segments=Array.isArray(trip.sI)?trip.sI:[];const prices=Array.isArray(trip.totalPriceList)?trip.totalPriceList:[];return {sI:segments.map(rawSegment=>{const s=object(rawSegment),f=object(s.fD);const airport=(value:unknown)=>{const a=object(value);return {code:a.code,name:a.name,city:a.city,country:a.country};};return {dt:s.dt,at:s.at,da:airport(s.da),aa:airport(s.aa),duration:s.duration,isRs:s.isRs,fD:{fN:f.fN,aI:{name:object(f.aI).name,code:object(f.aI).code}}};}),totalPriceList:prices.map(rawPrice=>{const p=object(rawPrice),fD=flightFareDetails(p);let base=0,complete=true;for(const [pax,count]of Object.entries({ADULT:criteria.adults,CHILD:criteria.children,INFANT:criteria.infants})){if(!count)continue;try{base+=minor(object(object(fD[pax]).fC).TF)*count;}catch{complete=false;}}const baggage=Object.fromEntries(Object.entries(fD).map(([pax,rawFare])=>{const fare=object(rawFare);return [pax,{bI:fare.bI,cc:fare.cc,rT:fare.rT}];}));return {id:p.id,fareIdentifier:p.fareIdentifier,sri:p.sri,msri:p.msri,fD:baggage,customerEstimateMinor:complete&&Number.isSafeInteger(base)&&base>0?customerTotal(base,rule):null};})};});}return {searchResult:{tripInfos}};}
export function customerHotelOptions(source:unknown,rule?:PricingRule):{options:HotelRoomOption[]} {
 const data=object(source), options=data.options;
 return {options:(Array.isArray(options)?options:[]).flatMap(raw=>{
  const o=object(raw),p=object(o.pricing),optionId=hotelText(o.optionId,500);
  // An incomplete or unsupported rate must not appear as a purchasable INR price.
  if(!optionId||p.currency!=="INR"||hotelObject(o.inventory).available===false)return [];
  const totalPrice=customerTotal(minor(p.totalPrice),rule)/100;
  const roomInfo=hotelRoomInfo(o.roomInfo);
  const fee=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:undefined;
  return [{optionId,optionType:hotelText(o.optionType),roomInfo,inclusions:hotelStringList(o.inclusions),mealBasis:hotelText(o.mealBasis),bookingNotes:hotelText(o.bookingNotes,10000),cancellation:hotelCancellation(o.cancellation),pricing:{totalPrice,currency:"INR",mf:fee(p.mf),mft:fee(p.mft)}}];
 })};
}
export function customerHotelResults(source:unknown,rule?:PricingRule) {
 const data=object(source);
 return {hotels:(Array.isArray(data.hotels)?data.hotels:[]).slice(0,100).flatMap(raw=>{
  const hotel=object(raw),tjHotelId=hotelListingId(hotel),name=hotelText(hotel.name);
  if(!tjHotelId||!/^\d+$/.test(tjHotelId)||!name||hotel.is_active===false)return [];
  const options=customerHotelOptions({options:hotel.options},rule).options;
  return [{tjHotelId,name,options,customerEstimateMinor:options.length?Math.min(...options.map(option=>Math.round(option.pricing.totalPrice*100))):null,property:hotelPropertyDetails(hotel)}];
 })};
}
