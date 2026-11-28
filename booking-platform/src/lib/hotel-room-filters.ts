import {hotelCancellation,hotelCancellationScheduleIsUnambiguous} from './hotel-presentation';
import {supplierInstant} from './supplier-time';
export type RoomPlan={mealBasis?:string;inclusions?:string[];cancellation?:unknown;optionType?:string};
export type RoomPlanFilters={breakfast:boolean;freeCancellation:boolean};
const breakfastMealPlans = ['BREAKFAST','BED_AND_BREAKFAST','BED_BREAKFAST','BREAKFAST_INCLUDED','ROOM_WITH_BREAKFAST','BB'];

export function hasMixedHotelMealPlans(option:RoomPlan):boolean{
 const type=option.optionType?.trim().toUpperCase();
 return type==='SRCM'||type==='CRCM';
}

/** Keep restricted or unfamiliar supplier terms intact. */
export function roomMealLabel(option: RoomPlan): string {
 if(hasMixedHotelMealPlans(option))return 'Meal plans vary by room';
 const meal = option.mealBasis?.trim();
 const key = meal?.toUpperCase().replace(/[ -]+/g, '_');
 if (key === 'ROOM_ONLY') return 'Room only';
 if (key && breakfastMealPlans.includes(key)) return 'Breakfast included';
 return meal?.replaceAll('_', ' ') || (includesBreakfast(option) ? 'Breakfast included' : 'Meal plan not supplied');
}

/** Only explicit rate-plan evidence qualifies; property amenities never do. */
export function includesBreakfast(option:RoomPlan):boolean{
 if(hasMixedHotelMealPlans(option))return false;
 const meal=option.mealBasis?.trim().toUpperCase().replace(/[ -]+/g,'_');
 if(meal&&(/(?:NOT_INCLUDED|FOR_A_FEE|WITHOUT_BREAKFAST|NO_BREAKFAST)/.test(meal)||meal==='ROOM_ONLY'))return false;
 if(meal&&breakfastMealPlans.includes(meal))return true;
 return (option.inclusions??[]).some(item=>/^(?:breakfast included|complimentary breakfast|free breakfast|daily breakfast included)$/i.test(item.trim()));
}
export function hasFreeCancellation(option:RoomPlan,now:number|null):boolean{
 if(now===null||!Number.isFinite(now))return false;
 const cancellation=hotelCancellation(option.cancellation);
 if(cancellation.isRefundable===false||!hotelCancellationScheduleIsUnambiguous(cancellation))return false;
 return cancellation.penalties.some(row=>row.amount===0&&(supplierInstant(row.from,'+05:30')??Infinity)<=now&&now<(supplierInstant(row.to,'+05:30')??-Infinity));
}
export function filterRoomPlans<T extends RoomPlan>(options:T[],filters:RoomPlanFilters,now:number|null):T[]{
 return options.filter(option=>(!filters.breakfast||includesBreakfast(option))&&(!filters.freeCancellation||hasFreeCancellation(option,now)));
}
