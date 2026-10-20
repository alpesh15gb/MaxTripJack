import "server-only";
import { isDeepStrictEqual } from "node:util";
import { database,transaction } from "./db";
import { owned, assertFresh, pricingRule, type Actor } from "./supplier-flow";
import { tripjack, paths } from "./providers/tripjack";
import { bookingBody, minor, type Guests } from "./providers/contracts";
import { checkoutCatalogue, selectCheckoutExtras, type CheckoutChoice } from "./checkout-extras-contract";
import { customerTotal } from "./customer-pricing";
import { HttpError } from "./http";
import { requestLimit } from "./request-limit";
import { validateFareOnce,type FareValidationPhase } from "./fare-validation";
export async function extrasCatalogue(quoteId:string,actor:Actor){
 await requestLimit(actor.userId,"checkout-extras",30);const quote=await owned("supplier_quotes",quoteId,actor);assertFresh(quote.expires_at);
 if(quote.product!=="FLIGHT"||quote.service_kind)throw new HttpError(400,"Choose an initial flight quote.");
 const search=await owned("supplier_searches",quote.search_id,actor);
 const seats=quote.review.conditions?.isa===true?await tripjack("FLIGHT","/fms/v1/seat",{bookingId:quote.supplier_booking_id}):{};
 assertFresh(quote.expires_at);
 let segments;try{segments=checkoutCatalogue(quote.review,seats);}catch{throw new HttpError(502,"Supplier extras are incomplete. Review the flight again.");}
 const orders=await database().query("SELECT id FROM orders WHERE quote_id=$1",[quote.id]);if(orders.rowCount)throw new HttpError(409,"Checkout has already started; extras are locked.");
 return {segments,travellerTypes:[...Array(search.criteria.adults).fill("ADULT"),...Array(search.criteria.children??0).fill("CHILD"),...Array(search.criteria.infants??0).fill("INFANT")],choices:quote.selection.checkoutExtras?.choices??[]};
}
export async function saveCheckoutExtras(quoteId:string,choices:CheckoutChoice[],actor:Actor){
 await requestLimit(actor.userId,"checkout-extras-review",30);const quote=await owned("supplier_quotes",quoteId,actor);assertFresh(quote.expires_at);
 if(quote.product!=="FLIGHT"||quote.service_kind)throw new HttpError(400,"Choose an initial flight quote.");
 const search=await owned("supplier_searches",quote.search_id,actor);
 // Seats are refreshed before committing any selection; the server never accepts browser prices.
 if(choices.some(c=>c.kind==="SEAT")&&quote.review.conditions?.isa!==true)throw new HttpError(400,"Seat selection is not available for this fare.");
 const seats=choices.some(c=>c.kind==="SEAT")?await tripjack("FLIGHT","/fms/v1/seat",{bookingId:quote.supplier_booking_id}):quote.review.checkoutSeats??{};
 let selected;try{selected=selectCheckoutExtras(quote.review,seats,search.criteria,choices);}catch(e){throw new HttpError(400,e instanceof Error?e.message:"Invalid extras selection.");}
 const base=Number(quote.selection.checkoutBaseSupplierMinor??quote.supplier_minor),supplierMinor=base+selected.amountMinor;
 const totalMinor=customerTotal(supplierMinor,await pricingRule("FLIGHT",actor));assertFresh(quote.expires_at);
 const selection={...quote.selection,checkoutBaseSupplierMinor:base,checkoutExtras:{...selected,choices}};
 await transaction(async tx=>{const locked=await tx.query("SELECT * FROM supplier_quotes WHERE id=$1 FOR UPDATE",[quote.id]);if(locked.rows[0].fare_validation_state)throw new HttpError(409,"Fare validation has already started. Review a new quote to change extras.");if(!isDeepStrictEqual(locked.rows[0].selection,quote.selection))throw new HttpError(409,"Another extras update was saved. Reload the selection.");const orders=await tx.query("SELECT id FROM orders WHERE quote_id=$1",[quote.id]);if(orders.rowCount)throw new HttpError(409,"Checkout already started. Extras cannot be changed.");await tx.query("UPDATE supplier_quotes SET selection=$2,supplier_minor=$3,total_minor=$4 WHERE id=$1",[quote.id,selection,supplierMinor,totalMinor]);});
 return {quoteId,totalMinor,extrasMinor:selected.amountMinor,summary:selected.summary,expiresAt:quote.expires_at};
}
type ExtrasTraveller={pt:string;ssrBaggageInfos:{key:string;code:string}[];ssrMealInfos:{key:string;code:string}[];ssrSeatInfos:{key:string;code:string}[]};
export function initialFlightBody(bookingId:string,amount:number,guests:Guests,extras?:{travellers:ExtrasTraveller[]}){
 const payload=bookingBody("FLIGHT",bookingId,amount,guests);
 if(!extras)return payload;
 if(extras.travellers.length!==guests.travellers.length||extras.travellers.some((t,i)=>t.pt!==guests.travellers[i].pt))throw new HttpError(400,"Keep passengers in the reviewed order when selecting extras.");
 return {...payload,travellerInfo:guests.travellers.map((t,i)=>({...t,...Object.fromEntries(Object.entries(extras.travellers[i]).filter(([k,v])=>k!=="pt"&&Array.isArray(v)&&v.length))}))};
}
export async function validateFlightFare(quoteId:string,payload:ReturnType<typeof initialFlightBody>,supplierMinor:number,phase:FareValidationPhase){
 await validateFareOnce({quoteId,phase,payload,transaction,validate:async()=>{
 const result=await tripjack("FLIGHT",paths.FLIGHT.validate,payload,true);
 if(result.alerts?.length)throw new HttpError(409,"Fare, class or seat conditions changed. Review the flight again before paying.");
 const total=result.totalPriceInfo?.totalFareDetail?.fC?.TF??result.totalPriceInfo?.fc?.TF;
 if(total!==undefined&&minor(total)!==supplierMinor)throw new HttpError(409,"Supplier total changed. Review the flight again.");
 }});
}
export async function validateInitialExtras(quote:{id:string;supplier_booking_id:string;supplier_minor:number|string;selection:{checkoutExtras?:{travellers:ExtrasTraveller[]}}},guests:Guests){
 await validateFlightFare(quote.id,initialFlightBody(quote.supplier_booking_id,Number(quote.supplier_minor),guests,quote.selection.checkoutExtras),Number(quote.supplier_minor),"PREPAYMENT");
}
