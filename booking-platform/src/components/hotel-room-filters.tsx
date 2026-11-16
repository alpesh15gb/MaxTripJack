'use client';
import {includesBreakfast,hasFreeCancellation,type RoomPlan,type RoomPlanFilters} from '@/lib/hotel-room-filters';
export default function HotelRoomFilters({options,filters,now,onChange}:{options:RoomPlan[];filters:RoomPlanFilters;now:number|null;onChange:(filters:RoomPlanFilters)=>void}){
 const breakfast=options.some(includesBreakfast),free=options.some(option=>hasFreeCancellation(option,now));
 if(!breakfast&&!free&&!filters.breakfast&&!filters.freeCancellation)return null;
 return <fieldset className="stay-room-filters"><legend>Rate preferences</legend>{(breakfast||filters.breakfast)&&<label><input type="checkbox" checked={filters.breakfast} onChange={event=>onChange({...filters,breakfast:event.target.checked})}/>Breakfast included</label>}{(free||filters.freeCancellation)&&<label><input type="checkbox" checked={filters.freeCancellation} onChange={event=>onChange({...filters,freeCancellation:event.target.checked})}/>Free cancellation available now</label>}{(filters.breakfast||filters.freeCancellation)&&<button type="button" className="hotel-reset" onClick={()=>onChange({breakfast:false,freeCancellation:false})}>Clear rate filters</button>}<small>Based on the supplied rate terms. Rechecked before booking.</small></fieldset>;
}
