import "server-only";
import {publicSupplierReview} from "./public-supplier-review";
import { randomUUID } from "node:crypto";
import { database } from "./db";
import { HttpError } from "./http";
import { tripjack,paths,Product } from "./providers/tripjack";
import { Search,flightSearch,hotelSearch,minor } from "./providers/contracts";
import { requestLimit } from "./request-limit";
import { customerTotal,customerFlightResults,customerHotelOptions,customerHotelResults,PricingRule } from "./customer-pricing";
import { hotelListingId } from "./hotel-listing-id";
import { hotelContentForSearch } from "./hotel-content";
import { mergeHotelPropertyDetails } from "./hotel-property-merge";
import { hotelObject, hotelPropertyDetails } from "./hotel-presentation";
import { SearchTiming } from "./search-timing";
import { cachedFlightSearch, cachedHotelSearch } from "./flight-search-cache";
import { observeSearchFare } from "./fare-calendar";
import { exactAirportGroups } from "./flight-airport-scope";
import { orderedFlightSelection } from "./flight-selection";
import { createHotelReviewSnapshot,hotelReviewHash,SAVE_HOTEL_REVIEW_SNAPSHOT_SQL,HOTEL_REVIEW_SNAPSHOT_KEY } from "./hotel-review-snapshot";
import {searchWarmCache} from './search-warm-cache';
import {validateSearchCriteria} from './search-validation';
export type Actor={userId:string;companyId:string|null};
export async function pricingRule(product:Product,actor:Actor){const rules=await database().query<PricingRule>("SELECT * FROM pricing_rules WHERE active=true AND product=$1 AND (company_id=$2 OR company_id IS NULL) ORDER BY company_id NULLS LAST,created_at DESC LIMIT 1",[product,actor.companyId]);return rules.rows[0];}
export async function owned(table:"supplier_searches"|"supplier_quotes"|"orders",id:string,actor:Actor){const result=await database().query(`SELECT * FROM ${table} WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid`,[id,actor.userId,actor.companyId]);if(!result.rows[0])throw new HttpError(404,"Record not found.");return result.rows[0];}
export function assertFresh(expires:Date|string){if(new Date(expires).getTime()<=Date.now())throw new HttpError(409,"This quote or search expired. Search and review again.");}
export async function searchSupplier(criteria:Search,actor:Actor,timing=new SearchTiming(),warm?:{intent:string;peer:string;sessionFingerprint?:string}){
 await timing.measure("limit",()=>requestLimit(actor.userId,"supplier-search",20));
 validateSearchCriteria(criteria);
 const id=randomUUID();let correlationId:string=randomUUID();
 const [data,rule]=await Promise.all([timing.measure('supplier',async()=>{
  if(warm&&process.env.SEARCH_PREWARM_ENABLED!=='false'){
   const adoption=searchWarmCache.take(warm.intent,criteria,{actor,peer:warm.peer,...(warm.sessionFingerprint?{sessionFingerprint:warm.sessionFingerprint}:{})});
   const prepared=await adoption.result;timing.warmCache(prepared?adoption.status:'miss');
   if(prepared){correlationId=prepared.correlationId;return prepared.data as Awaited<ReturnType<typeof tripjack>>;}
  }
  if(criteria.product==='FLIGHT'){const supplierRequest=flightSearch(criteria);return cachedFlightSearch(supplierRequest,()=>tripjack(criteria.product,paths[criteria.product].search,supplierRequest),undefined,undefined,status=>timing.flightCache(status));}
  const listing=await cachedHotelSearch(hotelSearch(criteria,correlationId),correlationId,id=>tripjack('HOTEL',paths.HOTEL.search,hotelSearch(criteria,id)));
  correlationId=listing.correlationId;return listing.data;
 }),timing.measure("pricing",()=>pricingRule(criteria.product,actor))]);
 // The provider host is currently hardcoded UAT. Record provenance at creation;
 // later catalogue settings must never relabel historical test results as production.
 await timing.measure("persist",()=>database().query("INSERT INTO supplier_searches(id,user_id,company_id,product,criteria,results,correlation_id,expires_at,provider_environment) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '14 minutes','uat')",[id,actor.userId,actor.companyId,criteria.product,criteria,criteria.product==="HOTEL"?{...data,[HOTEL_REVIEW_SNAPSHOT_KEY]:{}}:data,correlationId]));
 return timing.sync("projection",()=>{
 if(criteria.product==="FLIGHT"){const results=customerFlightResults({...data,searchResult:{...data.searchResult,tripInfos:exactAirportGroups(data.searchResult?.tripInfos,criteria)}},criteria,rule);observeSearchFare(criteria,results,actor.companyId);return {searchId:id,product:criteria.product,results};}
 const results=customerHotelResults(data,rule);
 results.hotels=results.hotels.filter(hotel=>criteria.hotelIds.includes(hotel.tjHotelId));
 const properties=hotelContentForSearch.peek(results.hotels.map(hotel=>hotel.tjHotelId),criteria.hotelIds);
 const statuses=hotelContentForSearch.statuses(results.hotels.map(hotel=>hotel.tjHotelId),criteria.hotelIds);
 return {searchId:id,product:criteria.product,propertyContentPending:Object.values(statuses).includes('pending'),propertyContentUnavailable:Object.values(statuses).includes('unavailable'),results:{hotels:results.hotels.map(hotel=>({...hotel,propertyContentStatus:statuses[hotel.tjHotelId],property:mergeHotelPropertyDetails(properties[hotel.tjHotelId],hotel.property)}))}};
 });
}
export async function customerHotelContent(searchId:string,actor:Actor){
 await requestLimit(actor.userId,"hotel-content",20);
 const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);
 if(search.product!=="HOTEL")throw new HttpError(400,"Hotel content requires a hotel search.");
 const hotels=customerHotelResults(search.results).hotels.filter(hotel=>search.criteria.hotelIds.includes(hotel.tjHotelId));
 const ids=hotels.map(hotel=>hotel.tjHotelId);
 const properties=await hotelContentForSearch(ids,search.criteria.hotelIds);
 // A capacity-limited lookup may not have started. It is unavailable for this response, not an empty result.
 const propertyContentStatuses=Object.fromEntries(Object.entries(hotelContentForSearch.statuses(ids,search.criteria.hotelIds)).map(([id,status])=>[id,status==='pending'?'unavailable':status]));
 return {searchId,properties:Object.fromEntries(hotels.map(hotel=>[hotel.tjHotelId,mergeHotelPropertyDetails(properties[hotel.tjHotelId],hotel.property)])),propertyContentStatuses};
}
function hotelDetailRequest(criteria:Extract<Search,{product:'HOTEL'}>,correlationId:string,hid:string){const {hids,...input}=hotelSearch(criteria,correlationId);void hids;return tripjack('HOTEL',paths.HOTEL.detail,{...input,hid});}
export async function hotelDetail(searchId:string,hid:string,actor:Actor){const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);if(search.product!=="HOTEL"||!search.criteria.hotelIds.includes(hid))throw new HttpError(400,"Hotel not part of this search.");return hotelDetailRequest(search.criteria,search.correlation_id,hid);}
export async function customerHotelDetail(searchId:string,hid:string,actor:Actor){
 const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);
 if(search.product!=="HOTEL"||!search.criteria.hotelIds.includes(hid))throw new HttpError(400,"Hotel not part of this search.");
 const [data,rule]=await Promise.all([hotelDetailRequest(search.criteria,search.correlation_id,hid),pricingRule("HOTEL",actor)]);
 // Persist the exact detail/hash pair before exposing its selectable option IDs.
 // Merge against the current JSON in SQL so other hotel details survive races.
 const snapshot=createHotelReviewSnapshot(data);
 const saved=await database().query(SAVE_HOTEL_REVIEW_SNAPSHOT_SQL,[searchId,actor.userId,actor.companyId,hid,JSON.stringify(snapshot)]);
 if(saved.rowCount!==1)throw new HttpError(409,"This search is no longer available. Search again to continue.");
 // Room availability and mandatory rate policies must not wait for optional static content.
 // The owned hotel-content request enriches the UI separately; never start detached work here.
 const properties=hotelContentForSearch.peek([hid],search.criteria.hotelIds);
 const listing=Array.isArray(search.results.hotels)?search.results.hotels.find((hotel:unknown)=>hotelListingId(hotel)===hid):undefined;
 const listingProperty=hotelPropertyDetails(listing);
 const hasListingProperty=Object.keys(listingProperty).length>1||listingProperty.amenities.length>0;
 return {...customerHotelOptions(data,rule),property:properties[hid]||hasListingProperty?mergeHotelPropertyDetails(properties[hid],listingProperty):undefined};
}
export async function reviewSupplier(searchId:string,selection:{priceIds?:string[];hid?:string;optionId?:string},actor:Actor){
 await requestLimit(actor.userId,"supplier-review",30);
 const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);
 if(search.service_kind)throw new HttpError(400,"Use the flight service review flow for this search.");
 let data;let chosen:unknown;let flight:Parameters<typeof publicSupplierReview>[2];const reviewedAt=Date.now();
 if(search.product==="FLIGHT"){
  const groups=exactAirportGroups(search.results.searchResult?.tripInfos,search.criteria);
  let priceIds:string[];try{priceIds=orderedFlightSelection(groups,selection.priceIds??[],search.criteria);}catch(e){throw new HttpError(400,e instanceof Error?e.message:"Invalid fare selection.");}
  if(!search.criteria.returnDate&&!search.criteria.legs?.length){
   const selectedTrips=Object.values(groups).flat().filter(trip=>{
    const prices=hotelObject(trip).totalPriceList;
    return Array.isArray(prices)&&prices.some(price=>priceIds.includes(String(hotelObject(price).id)));
   });
   flight={criteria:search.criteria,selectedTrips};
  }
  chosen={priceIds};data=await tripjack("FLIGHT",paths.FLIGHT.review,chosen);if(data.bookingId)data.fareRules=await tripjack("FLIGHT","/fms/v2/farerule",{flowType:"REVIEW",id:data.bookingId});
 }else{
  if(!selection.hid||!selection.optionId)throw new HttpError(400,"Choose a hotel room option.");
  if(!search.criteria.hotelIds.includes(selection.hid))throw new HttpError(400,"Hotel not part of this search.");
  const reviewHash=hotelReviewHash(search.results,selection.hid,selection.optionId);
  chosen={hid:selection.hid,optionId:selection.optionId,reviewHash,correlationId:search.correlation_id};data=await tripjack("HOTEL",paths.HOTEL.review,chosen);
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
 return {quoteId:id,product,summary:search.criteria,hotelName:product==="HOTEL"?search.results.hotels?.find((h:unknown)=>hotelListingId(h)===selection.hid)?.name??null:null,totalMinor,currency:"INR",expiresAt,review:publicSupplierReview(product,data,flight)};
}
