import {flightFareDetails} from './flight-fare-details';
import {hotelCancellation,hotelObject} from './hotel-presentation';
import {refundLabel} from './booking-presentation';
import {supplierInstant} from './supplier-time';
import {hotelPolicyDateTime} from './hotel-cancellation-timeline';

import type {ReviewTerm} from './review-term-changes';
import {policyText as text} from './public-supplier-policy';
function completeList(source:unknown,max:number,read:(item:unknown)=>string|null):string[]|null {
 if(!Array.isArray(source)||source.length===0||source.length>max)return null;
 const values=source.map(read);return values.every((value):value is string=>value!==null)?values:null;
}
function itineraryKey(source:unknown):string|null {
 const segments=hotelObject(source).sI;
 if(!Array.isArray(segments)||segments.length===0||segments.length>24)return null;
 const keys=segments.map(raw=>{const row=hotelObject(raw),from=text(hotelObject(row.da).code),to=text(hotelObject(row.aa).code),departure=text(row.dt);
  return from&&to&&departure&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(departure)?[from,to,departure]:null;});
 return keys.every(key=>key!==null)?JSON.stringify(keys):null;
}
/** Only reviewed customer-facing fields; never search cards, raw JSON, IDs,
 * expiry, supplier totals or commission. Missing values do not mean “none”. */
export function reviewedTerms(product:'FLIGHT'|'HOTEL',source:unknown):ReviewTerm[]{
 const review=hotelObject(source),rows:ReviewTerm[]=[];
 const add=(key:string,label:string,value:string|null,display?:string)=>rows.push({key,label,value,...(display?{display}:{})});
 if(product==='HOTEL'){
  const option=hotelObject(review.option),raw=hotelObject(option.cancellation),policy=hotelCancellation(raw);
  add('room','Room',completeList(option.roomInfo,4,item=>text(hotelObject(item).name))?.join(' + ')??null);
  add('meal','Meal plan',text(option.mealBasis)?.replaceAll('_',' ')??null);
  add('inclusions','Inclusions',completeList(option.inclusions,40,text)?.sort().join(' · ')??null);
  add('refund','Refundability',typeof policy.isRefundable==='boolean'?policy.isRefundable?'Refundable · policy charges may apply':'Non-refundable':null);
  // Explicit canonical schedule, independent of array order and timestamp formatting.
  // Supplier amount units are unverified: never render them as rupees or percentages.
  const penalties=policy.penalties;
  const schedule=Array.isArray(raw.penalties)&&penalties.length>0&&penalties.length===raw.penalties.length?penalties.map(row=>({from:supplierInstant(row.from,'+05:30')!,to:supplierInstant(row.to,'+05:30')!,amount:row.amount})).sort((a,b)=>a.from-b.from||a.to-b.to||a.amount-b.amount):null;
  // Canonical comparison identity stays independent of customer date formatting.
  add('cancellation','Cancellation schedule',schedule?.map(row=>`${new Date(row.from).toISOString()} to ${new Date(row.to).toISOString()}: supplier amount ${row.amount} (currency, units and basis unverified)`).join('; ')??null,
   schedule?.map(row=>`${hotelPolicyDateTime(row.from)} IST → ${hotelPolicyDateTime(row.to)} IST · Supplier amount ${row.amount} (currency, units and basis unverified)`).join('; '));
  add('notes','Booking notes',text(option.bookingNotes));
 }else{
  const trips=Array.isArray(review.tripInfos)&&review.tripInfos.length<=12?review.tripInfos:[];
  const identities=trips.map(itineraryKey);
  for(const [index,rawTrip] of trips.entries()){
   const trip=hotelObject(rawTrip),segments=Array.isArray(trip.sI)?trip.sI:[],first=hotelObject(segments[0]),last=hotelObject(segments.at(-1));
   const identity=identities[index];
   if(!identity||identities.filter(key=>key===identity).length!==1)continue;
   const route=`${text(hotelObject(first.da).code)} → ${text(hotelObject(last.aa).code)} · ${text(first.dt)}`;
   const prices=Array.isArray(trip.totalPriceList)?trip.totalPriceList:[];
   // A review should contain one selected fare. Ambiguous fare alternatives are unknown.
   let fares:Record<string,unknown>={};
   try { if(prices.length===1)fares=flightFareDetails(hotelObject(prices[0])); } catch { /* Conflicting aliases cannot support a comparison. */ }
   for(const pax of ['ADULT','CHILD','INFANT']){
    if(!Object.hasOwn(fares,pax))continue;
    const fare=hotelObject(fares[pax]),baggage=hotelObject(fare.bI),prefix=`trip.${identity}.${pax}`;
    add(`${prefix}.refund`,`${route} · ${pax} refundability`,[0,1,2].includes(fare.rT as number)?refundLabel(fare.rT):null);
    add(`${prefix}.checked`,`${route} · ${pax} checked baggage`,text(baggage.iB));
    add(`${prefix}.cabin`,`${route} · ${pax} cabin baggage`,text(baggage.cB));
   }
  }
  // This text shape is exercised by the supplier review fixtures. Other shapes
  // are explicitly unavailable; we do not infer their schema or meaning.
  add('fareRules.miscInfo','Fare rule notes',text(hotelObject(hotelObject(review.fareRules).fareRule).miscInfo));
 }
 return rows.slice(0,120);
}
