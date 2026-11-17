import {indiaToday,parseHotelIds} from './booking-presentation';
import {completeHotelRooms,type DraftHotelRoom} from './hotel-occupancy';
import {searchSchema,type Search} from './providers/contracts';

export type BookingSearchDraft={product:'FLIGHT'|'HOTEL';adults:number;children?:number;infants?:number;multiCity?:boolean;legCount?:number;hotelOccupancy?:DraftHotelRoom[]};
/** The same public, validated request is used for warming and actual submission. */
export function bookingSearchInput(fields:FormData,draft:BookingSearchDraft):Search{
 const text=(name:string)=>String(fields.get(name)??'');
 const date=text('date');
 if(date<indiaToday())throw Error('Choose today or a future travel date.');
 let input:unknown;
 if(draft.product==='FLIGHT'){
  const from=text('from').toUpperCase(),to=text('to').toUpperCase(),returnDate=text('returnDate');
  if(from===to)throw Error('Choose different departure and arrival airports.');
  if(!draft.multiCity&&returnDate&&returnDate<date)throw Error('Your return date cannot be before departure.');
  const legs=draft.multiCity?[{from,to,date},...Array.from({length:(draft.legCount??2)-1},(_,i)=>({from:text(`leg-from-${i+1}`).toUpperCase(),to:text(`leg-to-${i+1}`).toUpperCase(),date:text(`leg-date-${i+1}`)}))]:undefined;
  input={product:'FLIGHT',from,to,date,adults:draft.adults,children:draft.children??0,infants:draft.infants??0,cabin:text('cabin'),...(legs?{legs}:returnDate?{returnDate}:{})};
 }else{
  const checkOut=text('end');if(checkOut<=date)throw Error('Check-out must be after check-in.');
  const rooms=completeHotelRooms(draft.hotelOccupancy??[{adults:draft.adults,childAge:[]}]);
  input={product:'HOTEL',hotelIds:parseHotelIds(text('hotelIds')),checkIn:date,checkOut,adults:rooms[0]?.adults,rooms,childrenAges:rooms[0]?.childAge??[],nationality:text('nationality')};
 }
 const parsed=searchSchema.safeParse(input);
 if(!parsed.success)throw Error(parsed.error.issues[0]?.message||'Complete the search criteria.');
 return parsed.data;
}

/** Read validity without dispatching invalid events or showing validation UI. */
export function searchFormIsValid(form:HTMLFormElement){
 return Array.from(form.elements).every(element=>!(element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement)||!element.willValidate||element.validity.valid);
}
