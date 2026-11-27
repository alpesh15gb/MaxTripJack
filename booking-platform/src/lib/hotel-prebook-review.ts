import {isDeepStrictEqual} from 'node:util';
import {hotelObject} from './hotel-presentation';
import {reviewedTerms} from './reviewed-terms';
import {sameCurrentHotelTerms} from './review-term-changes';
import {supplierInstant} from './supplier-time';
import {minor} from './providers/contracts';

export class HotelPrebookReviewError extends Error {
 constructor(readonly code:'HOTEL_REFERENCE_MISSING'|'HOTEL_UNAVAILABLE'|'HOTEL_PRICE_CHANGED'|'HOTEL_ROOM_TERMS_CHANGED'|'HOTEL_CANCELLATION_CHANGED'|'HOTEL_COMPLIANCE_CHANGED') {
  super(code);this.name='HotelPrebookReviewError';
 }
}

/** Unlike the customer-facing comparison, booking must preserve ALL raw policy
 * fields. Only the first active window's elapsed origin is ignored.
 * Capture times are supplied by the database/worker, never by the browser. */
export function sameHotelPrebookCancellation(before:unknown,after:unknown,beforeAt:number,afterAt:number):boolean {
 if(isDeepStrictEqual(before,after))return true;
 const oldTerm=reviewedTerms('HOTEL',{option:{cancellation:before}},beforeAt).find(row=>row.key==='cancellation');
 const newTerm=reviewedTerms('HOTEL',{option:{cancellation:after}},afterAt).find(row=>row.key==='cancellation');
 if(!sameCurrentHotelTerms(oldTerm,newTerm))return false;
 const old=hotelObject(before),next=hotelObject(after);
 const oldRows=old.penalties as Record<string,unknown>[],nextRows=next.penalties as Record<string,unknown>[];
 const oldIndex=oldRows.findIndex(row=>supplierInstant(row.from,'+05:30')===oldTerm!.hotelCancellation!.windows[0].from);
 const nextIndex=nextRows.findIndex(row=>supplierInstant(row.from,'+05:30')===newTerm!.hotelCancellation!.windows[0].from);
 if(oldIndex<0||nextIndex!==oldIndex)return false;
 // Do not mutate either snapshot or discard unknown fields (fee units, notes,
 // deadlines, etc.). Any other raw difference still blocks supplier booking.
 return isDeepStrictEqual(old,{...next,penalties:nextRows.map((row,index)=>index===nextIndex?{...row,from:oldRows[oldIndex].from}:row)});
}

function hotelRoomTerms(review:Record<string,unknown>,option:Record<string,unknown>) {
 const {optionId,optionType,roomInfo,mealBasis,inclusions,bookingNotes}=option;
 const id=review.tjHotelId??review.hotelId;
 return {
  hotelId:typeof id==='number'?String(id):id,
  optionId,optionType,mealBasis,bookingNotes,
  roomInfo:Array.isArray(roomInfo)?roomInfo.map(raw=>{
   const {id,name,adults,children}=hotelObject(raw);
   return {id,name,adults,children};
  }):roomInfo,
  inclusions:Array.isArray(inclusions)&&inclusions.every(item=>typeof item==='string')?[...inclusions].sort():inclusions,
 };
}

export function assertHotelPrebookReview(before:unknown,after:unknown,supplierMinor:number,beforeAt:number,afterAt:number):string {
 const previous=hotelObject(before),old=hotelObject(previous.option),fresh=hotelObject(after),next=hotelObject(fresh.option);
 if(hotelObject(next.inventory).available===false)throw new HotelPrebookReviewError('HOTEL_UNAVAILABLE');
 if(typeof fresh.bookingId!=='string'||!fresh.bookingId.trim())throw new HotelPrebookReviewError('HOTEL_REFERENCE_MISSING');
 let price:number;
 try{price=minor(hotelObject(next.pricing).totalPrice);}catch{throw new HotelPrebookReviewError('HOTEL_PRICE_CHANGED');}
 if(!Number.isSafeInteger(supplierMinor)||price!==supplierMinor||!isDeepStrictEqual(hotelObject(old.pricing).currency,hotelObject(next.pricing).currency))throw new HotelPrebookReviewError('HOTEL_PRICE_CHANGED');
 if(!isDeepStrictEqual(hotelRoomTerms(previous,old),hotelRoomTerms(fresh,next)))throw new HotelPrebookReviewError('HOTEL_ROOM_TERMS_CHANGED');
 if(!sameHotelPrebookCancellation(old.cancellation,next.cancellation,beforeAt,afterAt))throw new HotelPrebookReviewError('HOTEL_CANCELLATION_CHANGED');
 if(!isDeepStrictEqual(old.compliance,next.compliance))throw new HotelPrebookReviewError('HOTEL_COMPLIANCE_CHANGED');
 return fresh.bookingId;
}
