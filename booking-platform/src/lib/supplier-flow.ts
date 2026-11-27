import "server-only";
import {publicSupplierReview} from "./public-supplier-review";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { database, transaction } from "./db";
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
import {bookingPriceBreakdown} from './booking-price-breakdown';
import { exactAirportGroups } from "./flight-airport-scope";
import { orderedFlightSelection } from "./flight-selection";
import { createHotelReviewSnapshot,hotelReviewHash,SAVE_HOTEL_REVIEW_SNAPSHOT_SQL,HOTEL_REVIEW_SNAPSHOT_KEY } from "./hotel-review-snapshot";
import {searchWarmCache} from './search-warm-cache';
import {validateSearchCriteria} from './search-validation';
import {checkoutCatalogue,checkoutChoices,remapCheckoutChoices,selectCheckoutExtras} from "./checkout-extras-contract";

export class FlightExtrasRefreshError extends HttpError {
 constructor(){super(409,"One or more saved flight extras could not be verified at the latest price. Try refreshing again, or review the flight without those extras.");}
}

export type Actor={userId:string;companyId:string|null};
export async function pricingRule(product:Product,actor:Actor){const rules=await database().query<PricingRule>("SELECT * FROM pricing_rules WHERE active=true AND product=$1 AND (company_id=$2 OR company_id IS NULL) ORDER BY company_id NULLS LAST,created_at DESC LIMIT 1",[product,actor.companyId]);return rules.rows[0];}
export async function owned(table:"supplier_searches"|"supplier_quotes"|"orders",id:string,actor:Actor){const result=await database().query(`SELECT * FROM ${table} WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid`,[id,actor.userId,actor.companyId]);if(!result.rows[0])throw new HttpError(404,"Record not found.");return result.rows[0];}
export function assertFresh(expires:Date|string){
 const expiry = new Date(expires).getTime();
 if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new HttpError(409,"This quote or search expired. Search and review again.");
}
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
  const listing=await cachedHotelSearch(hotelSearch(criteria,correlationId),correlationId,id=>tripjack('HOTEL',paths.HOTEL.search,hotelSearch(criteria,id)),undefined,status=>timing.hotelCache(status));
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
function assertHotelSelection(data:unknown,hid:string,optionId?:string){
 const hotel=hotelObject(data),selectedOption=hotelObject(hotel.option).optionId;
 if((('tjHotelId' in hotel||'hotelId' in hotel)&&hotelListingId(hotel)!==hid)||(optionId!==undefined&&selectedOption!==undefined&&selectedOption!==optionId)){
  throw new HttpError(502,"The supplier returned a different room or hotel. Refresh room options and try again.");
 }
}
async function hotelDetailRequest(criteria:Extract<Search,{product:'HOTEL'}>,correlationId:string,hid:string){
 const {hids,...input}=hotelSearch(criteria,correlationId);void hids;
 const data=await tripjack('HOTEL',paths.HOTEL.detail,{...input,hid});
 assertHotelSelection(data,hid);
 return data;
}
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
export async function reviewSupplier(searchId:string,selection:{priceIds?:string[];hid?:string;optionId?:string;previousQuoteId?:string;removeFlightExtras?:boolean},actor:Actor,signal?:AbortSignal){
 await requestLimit(actor.userId,"supplier-review",30);
 const search=await owned("supplier_searches",searchId,actor);assertFresh(search.expires_at);
 if(search.service_kind)throw new HttpError(400,"Use the flight service review flow for this search.");
 signal?.throwIfAborted();
 const previous=selection.previousQuoteId?await owned("supplier_quotes",selection.previousQuoteId,actor):null;
 if(previous&&(search.product!=="FLIGHT"||previous.product!=="FLIGHT"||previous.service_kind||previous.search_id!==searchId))
  throw new HttpError(400,"Refresh extras only for the same flight and traveller search.");
 if(selection.removeFlightExtras&&!previous)throw new HttpError(400,"A previous flight review is required to remove saved extras.");
 let data;let chosen:Record<string,unknown>;let flight:Parameters<typeof publicSupplierReview>[2];const reviewedAt=Date.now();
 if(search.product==="FLIGHT"){
  const groups=exactAirportGroups(search.results.searchResult?.tripInfos,search.criteria);
  let priceIds:string[];try{priceIds=orderedFlightSelection(groups,selection.priceIds??[],search.criteria);}catch(e){throw new HttpError(400,e instanceof Error?e.message:"Invalid fare selection.");}
  if(previous&&!isDeepStrictEqual(previous.selection.priceIds,priceIds))throw new HttpError(400,"Saved extras belong to a different flight selection.");
  if(!search.criteria.returnDate&&!search.criteria.legs?.length){
   const selectedTrips=Object.values(groups).flat().filter(trip=>{
    const prices=hotelObject(trip).totalPriceList;
    return Array.isArray(prices)&&prices.some(price=>priceIds.includes(String(hotelObject(price).id)));
   });
   flight={criteria:search.criteria,selectedTrips};
  }
  chosen={priceIds};data=await tripjack("FLIGHT",paths.FLIGHT.review,chosen,false,"POST",signal);if(data.bookingId)data.fareRules=await tripjack("FLIGHT","/fms/v2/farerule",{flowType:"REVIEW",id:data.bookingId},false,"POST",signal);
 }else{
  if(!selection.hid||!selection.optionId)throw new HttpError(400,"Choose a hotel room option.");
  if(!search.criteria.hotelIds.includes(selection.hid))throw new HttpError(400,"Hotel not part of this search.");
  const reviewHash=hotelReviewHash(search.results,selection.hid,selection.optionId);
  chosen={hid:selection.hid,optionId:selection.optionId,reviewHash,correlationId:search.correlation_id};data=await tripjack("HOTEL",paths.HOTEL.review,chosen,false,"POST",signal);
  assertHotelSelection(data,selection.hid,selection.optionId);
 }
 const product=search.product as Product;
 if(product==="HOTEL"&&data.option?.inventory?.available===false)throw new HttpError(409,"Room option unavailable. Search again to choose another room.");
 const amount=product==="HOTEL"?data.option?.pricing?.totalPrice:data.totalPriceInfo?.totalFareDetail?.fC?.TF??data.totalPriceInfo?.fc?.TF;
 const currency=product==="HOTEL"?data.option?.pricing?.currency:"INR";
 if(!data.bookingId||amount===undefined||currency!=="INR")throw new HttpError(502,"Supplier review is missing required booking or INR pricing fields.");
 const baseSupplierMinor=minor(amount);
 let supplierMinor=baseSupplierMinor;
 let extrasRefresh:"kept"|"removed"|undefined;
 let savedFlightExtrasCount=0;
 if(previous?.selection.checkoutExtras){
  const saved=checkoutChoices.safeParse(previous.selection.checkoutExtras.choices);
  if(!saved.success&&!selection.removeFlightExtras)throw new FlightExtrasRefreshError();
  const choices=saved.success?saved.data:[];
  if(selection.removeFlightExtras){
   if(!saved.success||choices.length)extrasRefresh="removed";
  }else if(choices.length){
   const hasSeats=choices.some(choice=>choice.kind==="SEAT");
   if(hasSeats&&data.conditions?.isa!==true)throw new FlightExtrasRefreshError();
   const seats=hasSeats?await tripjack("FLIGHT","/fms/v1/seat",{bookingId:data.bookingId},false,"POST",signal):{};
   signal?.throwIfAborted();
   try{
    const next=remapCheckoutChoices(previous.review,data,checkoutCatalogue(data,seats),choices,previous.selection.checkoutExtras.summary);
    if(!next)throw new FlightExtrasRefreshError();
    const selected=selectCheckoutExtras(data,seats,search.criteria,next);
    supplierMinor+=selected.amountMinor;
    chosen={...chosen,checkoutBaseSupplierMinor:baseSupplierMinor,checkoutExtras:{...selected,choices:next}};
    extrasRefresh="kept";
    savedFlightExtrasCount=next.length;
   }catch{throw new FlightExtrasRefreshError();}
  }
 }
 const rule=await pricingRule(product,actor);
 const baseTotalMinor=customerTotal(baseSupplierMinor,rule),totalMinor=customerTotal(supplierMinor,rule);
 if(!Number.isSafeInteger(totalMinor)||totalMinor<=0)throw new HttpError(502,"Supplier returned invalid price.");
 const seconds=product==="FLIGHT"?Number(data.conditions?.st):90;
 if(!Number.isFinite(seconds)||seconds<30)throw new HttpError(409,"Supplier review session unavailable or too short. Review again.");
 const expiresAt=new Date(reviewedAt+Math.min(seconds,180)*1000);if(expiresAt.getTime()-Date.now()<30000)throw new HttpError(409,"Supplier review expired while loading the rules. Review again.");
 signal?.throwIfAborted();
 const id=randomUUID();
 const insert="INSERT INTO supplier_quotes(id,search_id,user_id,company_id,product,selection,review,supplier_booking_id,supplier_minor,total_minor,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)";
 const values=[id,searchId,actor.userId,actor.companyId,product,chosen,data,data.bookingId,supplierMinor,totalMinor,expiresAt];
 if(previous)await transaction(async tx=>{
  const prior=await tx.query("SELECT selection FROM supplier_quotes WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE",[previous.id,actor.userId,actor.companyId]);
  if(!isDeepStrictEqual(prior.rows[0]?.selection,previous.selection))throw new HttpError(409,"Flight extras changed while refreshing. Check the latest price again.");
  const order=await tx.query("SELECT id FROM orders WHERE quote_id=$1 LIMIT 1",[previous.id]);
  if(order.rowCount)throw new HttpError(409,"A payment order already exists for this flight. Check My trips before paying again.");
  signal?.throwIfAborted();
  await tx.query(insert,values);
  // The two quote writes commit together under the same lock checkout uses.
  // Customers may only pay the newly presented review after a refresh.
  await tx.query("UPDATE supplier_quotes SET expires_at=LEAST(expires_at,clock_timestamp()) WHERE id=$1",[previous.id]);
 });
 else await database().query(insert,values);
 return {quoteId:id,product,summary:search.criteria,hotelName:product==="HOTEL"?search.results.hotels?.find((h:unknown)=>hotelListingId(h)===selection.hid)?.name??null:null,totalMinor,currency:"INR",expiresAt,priceBreakdown:bookingPriceBreakdown(product,data,baseTotalMinor),...(extrasRefresh?{extrasRefresh,baseTotalMinor,savedFlightExtrasCount}:{}),review:publicSupplierReview(product,data,flight)};
}
