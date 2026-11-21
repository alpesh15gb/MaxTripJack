import {publicReviewConditions,publicReviewCompliance} from './public-review-requirements';
import {policyText,publicSupplierPolicy,publicSupplierAlerts} from './public-supplier-policy';
import {hotelObject,hotelRoomInfo,hotelStringList,hotelText} from './hotel-presentation';
import {reviewedTerms} from './reviewed-terms';
import {oneWayRouteKeys,oneWayTrips,type AirportCriteria} from './flight-airport-scope';
import {scopeFlightFareRules} from './flight-fare-rules';
/** Public response only. Never replace the persisted supplier review with this. */
export function publicSupplierReview(product:'FLIGHT'|'HOTEL',source:unknown,flight?:{criteria:AirportCriteria;selectedTrips:readonly unknown[]}){
 const raw=hotelObject(source),option=hotelObject(raw.option);
 let data=raw;
 if(product==='FLIGHT'&&flight&&!flight.criteria.returnDate&&!flight.criteria.legs?.length){
  const tripInfos=oneWayTrips(Array.isArray(raw.tripInfos)?raw.tripInfos:[],flight.criteria);
  const routes=oneWayRouteKeys(flight.criteria,flight.selectedTrips.length?flight.selectedTrips:tripInfos);
  data={...raw,tripInfos,fareRules:scopeFlightFareRules(raw.fareRules,routes)};
 }
 return {terms:reviewedTerms(product,data),conditions:publicReviewConditions(data.conditions),fareRules:publicSupplierPolicy(data.fareRules),alerts:publicSupplierAlerts(data.alerts),...(data.option?{option:{roomInfo:hotelRoomInfo(option.roomInfo),inclusions:hotelStringList(option.inclusions),mealBasis:hotelText(option.mealBasis),optionType:hotelText(option.optionType),cancellation:publicSupplierPolicy(option.cancellation),compliance:publicReviewCompliance(option.compliance),bookingNotes:policyText(option.bookingNotes)}}:{})};
}
