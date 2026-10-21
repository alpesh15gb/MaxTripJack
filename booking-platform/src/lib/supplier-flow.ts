import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "./db";
import { HttpError } from "./http";
import { tripjack,paths,Product } from "./providers/tripjack";
import { Search,flightSearch,hotelSearch,minor } from "./providers/contracts";
import { requestLimit } from "./request-limit";
import { customerTotal,customerFlightResults,customerHotelOptions,customerHotelResults,PricingRule } from "./customer-pricing";
import { hotelListingId } from "./hotel-listing-id";
import { hotelContentForSearch } from "./hotel-content";
import { hotelRoomInfo,hotelStringList,hotelText } from "./hotel-presentation";
import { orderedFlightSelection } from "./flight-selection";
export type Actor={userId:string;companyId:string|null};
export async function pricingRule(product:Product,actor:Actor){const rules=await database().query<PricingRule>("SELECT * FROM pricing_rules WHERE active=true AND product=$1 AND (company_id=$2 OR company_id IS NULL) ORDER BY company_id NULLS LAST,created_at DESC LIMIT 1",[product,actor.companyId]);return rules.rows[0];}
export async function owned(table:"supplier_searches"|"supplier_quotes"|"orders",id:string,actor:Actor){const result=await database().query(`SELECT * FROM ${table} WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid`,[id,actor.userId,actor.companyId]);if(!result.rows[0])throw new HttpError(404,"Record not found.");return result.rows[0];}
export function assertFresh(expires:Date|string){if(new Date(expires).getTime()<=Date.now())throw new HttpError(409,"This quote or search expired. Search and review again.");}
export async function searchSupplier(criteria:Search,actor:Actor){
 await requestLimit(actor.userId,"supplier-search",20);
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const start=criteria.product==="FLIGHT"?criteria.date:criteria.checkIn;
 if(start<today)throw new HttpError(400,"Travel date must not be in the past.");
 if(criteria.product==="FLIGHT"&&criteria.from===criteria.to)throw new HttpError(400,"Choose different airports.");
 if(criteria.product==="FLIGHT"&&criteria.returnDate&&criteria.returnDate<criteria.date)throw new HttpError(400,"Return date must not precede departure.");
 if(criteria.product==="HOTEL"&&criteria.checkOut<=criteria.checkIn)throw new HttpError(400,"Check-out must follow check-in.");
 const id=randomUUID(),correlationId=randomUUID();
 const [data,rule]=await Promise.all([tripjack(criteria.product,paths[criteria.product].search,criteria.product==="FLIGHT"?flightSearch(criteria):hotelSearch(criteria,correlationId)),pricingRule(criteria.product,actor)]);
 await database().query("INSERT INTO supplier_searches(id,user_id,company_id,product,criteria,results,correlation_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '14 minutes')",[id,actor.userId,actor.companyId,criteria.product,criteria,data,correlationId]);
 if(criteria.product==="FLIGHT")return {searchId:id,product:criteria.product,results:customerFlightResults(data,criteria,rule)};
 const results=customerHotelResults(data,rule);
 results.hotels=results.hotels.filter(hotel=>criteria.hotelIds.includes(hotel.tjHotelId));
 const properties=await hotelContentForSearch(results.hotels.map(hotel=>hotel.tjHotelId),criteria.hotelIds);
 return {searchId:id,product:criteria.product,results:{hotels:results.hotels.map(hotel=>({...hotel,property:properties[hotel.tjHotelId]??hotel.property}))}};
}
export async function hotelDetail(searchId:string,hid:string,actor:Actor){const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);if(search.product!=="HOTEL"||!search.criteria.hotelIds.includes(hid))throw new HttpError(400,"Hotel not part of this search.");const input=hotelSearch(search.criteria,search.correlation_id);const {hids,...rest}=input;void hids;return tripjack("HOTEL",paths.HOTEL.detail,{...rest,hid});}
export async function customerHotelDetail(searchId:string,hid:string,actor:Actor){
 const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);
 if(search.product!=="HOTEL"||!search.criteria.hotelIds.includes(hid))throw new HttpError(400,"Hotel not part of this search.");
 const [data,rule,properties]=await Promise.all([hotelDetail(searchId,hid,actor),pricingRule("HOTEL",actor),hotelContentForSearch([hid],search.criteria.hotelIds)]);
 return {...customerHotelOptions(data,rule),property:properties[hid]};
}
export async function reviewSupplier(searchId:string,selection:{priceIds?:string[];hid?:string;optionId?:string},actor:Actor){
 await requestLimit(actor.userId,"supplier-review",30);
 const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);
 if(search.service_kind)throw new HttpError(400,"Use the flight service review flow for this search.");
 let data;let chosen:unknown;const reviewedAt=Date.now();
 if(search.product==="FLIGHT"){
  let priceIds:string[];try{priceIds=orderedFlightSelection(search.results.searchResult?.tripInfos??{},selection.priceIds??[],search.criteria);}catch(e){throw new HttpError(400,e instanceof Error?e.message:"Invalid fare selection.");}
  chosen={priceIds};data=await tripjack("FLIGHT",paths.FLIGHT.review,chosen);if(data.bookingId)data.fareRules=await tripjack("FLIGHT","/fms/v2/farerule",{flowType:"REVIEW",id:data.bookingId});
 }else{
  if(!selection.hid||!selection.optionId)throw new HttpError(400,"Choose a hotel room option.");
  const detail=await hotelDetail(searchId,selection.hid,actor);
  if(!detail.options?.some((o:{optionId:string;inventory?:{available?:boolean}})=>o.optionId===selection.optionId&&o.inventory?.available!==false)||!detail.reviewHash)throw new HttpError(409,"Room option unavailable.");
  chosen={hid:selection.hid,optionId:selection.optionId,reviewHash:detail.reviewHash,correlationId:search.correlation_id};data=await tripjack("HOTEL",paths.HOTEL.review,chosen);
 }
 const product=search.product as Product;
 if(product==="HOTEL"&&data.option?.inventory?.available===false)throw new HttpError(409,"Room option unavailable. Search again to choose another room.");
 const amount=product==="HOTEL"?data.option?.pricing?.totalPrice:data.totalPriceInfo?.totalFareDetail?.fC?.TF??data.totalPriceInfo?.fc?.TF;
 const currency=product==="HOTEL"?data.option?.pricing?.currency:"INR";
 if(!data.bookingId||amount===undefined||currency!=="INR")throw new HttpError(502,"Supplier review is missing required booking or INR pricing fields.");
 const supplierMinor=minor(amount);
 const rule=await pricingRule(product,actor);const totalMinor=customerTotal(supplierMinor,rule);
 if(!Number.isSafeInteger(totalMinor)||totalMinor<=0)throw new HttpError(502,"Supplier returned invalid price.");
 const seconds=product==="FLIGHT"?Number(data.conditions?.st):90;
 if(!Number.isFinite(seconds)||seconds<30)throw new HttpError(409,"Supplier review session unavailable or too short. Review again.");
 const expiresAt=new Date(reviewedAt+Math.min(seconds,180)*1000);if(expiresAt.getTime()-Date.now()<30000)throw new HttpError(409,"Supplier review expired while loading the rules. Review again.");
 const id=randomUUID();await database().query("INSERT INTO supplier_quotes(id,search_id,user_id,company_id,product,selection,review,supplier_booking_id,supplier_minor,total_minor,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id,searchId,actor.userId,actor.companyId,product,chosen,data,data.bookingId,supplierMinor,totalMinor,expiresAt]);
 return {quoteId:id,product,summary:search.criteria,hotelName:product==="HOTEL"?search.results.hotels?.find((h:unknown)=>hotelListingId(h)===selection.hid)?.name??null:null,totalMinor,currency:"INR",expiresAt,review:{conditions:data.conditions,fareRules:data.fareRules,alerts:data.alerts,option:data.option?{roomInfo:hotelRoomInfo(data.option.roomInfo),inclusions:hotelStringList(data.option.inclusions),mealBasis:hotelText(data.option.mealBasis),optionType:hotelText(data.option.optionType),cancellation:data.option.cancellation,compliance:data.option.compliance,bookingNotes:data.option.bookingNotes,pricing:{mf:data.option.pricing?.mf,mft:data.option.pricing?.mft}}:undefined}};
}
