import {publicReviewConditions,publicReviewCompliance} from './public-review-requirements';
import {policyText,publicSupplierPolicy,publicSupplierAlerts} from './public-supplier-policy';
import {hotelObject,hotelRoomInfo,hotelStringList,hotelText} from './hotel-presentation';
import {reviewedTerms} from './reviewed-terms';
/** Public response only. Never replace the persisted supplier review with this. */
export function publicSupplierReview(product:'FLIGHT'|'HOTEL',source:unknown){
 const data=hotelObject(source),option=hotelObject(data.option);
 return {terms:reviewedTerms(product,data),conditions:publicReviewConditions(data.conditions),fareRules:publicSupplierPolicy(data.fareRules),alerts:publicSupplierAlerts(data.alerts),...(data.option?{option:{roomInfo:hotelRoomInfo(option.roomInfo),inclusions:hotelStringList(option.inclusions),mealBasis:hotelText(option.mealBasis),optionType:hotelText(option.optionType),cancellation:publicSupplierPolicy(option.cancellation),compliance:publicReviewCompliance(option.compliance),bookingNotes:policyText(option.bookingNotes)}}:{})};
}
