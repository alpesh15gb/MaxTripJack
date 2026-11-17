import {orderedGroups,type Flight} from './booking-presentation';
import {selectedJourneyEstimate} from './flight-selection-summary';

/** Display order only. The submitted supplier fare IDs are never rewritten. */
export function selectedFlightsInJourneyOrder(groups:Record<string,Flight[]>,ids:readonly string[]=[]){
 return orderedGroups(groups).flatMap(group=>groups[group]).filter(flight=>flight.totalPriceList.some(fare=>ids.includes(fare.id)));
}

/** Compare only a complete, unambiguous set of selected public INR estimates. */
export function selectedFlightEstimate(groups:Record<string,Flight[]>,ids:readonly string[]=[]):number|null{
 const order=orderedGroups(groups);
 if(ids.length!==order.length||new Set(ids).size!==ids.length)return null;
 const choices=order.map(group=>{
  const matches=groups[group].flatMap(flight=>flight.totalPriceList.filter(fare=>ids.includes(fare.id)).map(fare=>({group,flight,fare})));
  return matches.length===1?matches[0]:{group};
 });
 return selectedJourneyEstimate(choices);
}

/** A room option's public price already covers the full stay and every room.
 * Never use a property's "from" amount or multiply the bundle by guest count. */
export function selectedHotelEstimate(option?:{pricing?:{totalPrice?:unknown;currency?:unknown}}):number|null{
 const price=option?.pricing;
 if(price?.currency!=='INR'||typeof price.totalPrice!=='number'||!Number.isFinite(price.totalPrice)||price.totalPrice<=0)return null;
 const minor=Math.round(price.totalPrice*100);
 return Number.isSafeInteger(minor)&&minor>0?minor:null;
}

export type InitialReviewPriceChange={estimateMinor:number;reviewedMinor:number};
export function initialReviewPriceChange(estimateMinor:number|null,reviewedMinor:number):InitialReviewPriceChange|null{
 if(estimateMinor===null||!Number.isSafeInteger(estimateMinor)||estimateMinor<=0||!Number.isSafeInteger(reviewedMinor)||reviewedMinor<=0||estimateMinor===reviewedMinor)return null;
 return {estimateMinor,reviewedMinor};
}
