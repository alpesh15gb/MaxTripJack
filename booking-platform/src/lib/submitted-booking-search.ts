import {bookingSearchPrefill,bookingSearchUrl} from './booking-search-state';

/** Sharing limits do not discard validated public criteria from the current tab. */
export function submittedBookingSearch(input:Record<string,string>){
  const validated=bookingSearchPrefill(input);
  const criteria=validated.searchInvalid?{product:validated.product}:validated;
  const shareUrl=validated.searchInvalid?null:bookingSearchUrl(criteria);
  return {criteria,url:shareUrl??`/book?product=${criteria.product==='HOTEL'?'HOTEL':'FLIGHT'}`,shareable:shareUrl!==null};
}
