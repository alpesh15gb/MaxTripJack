import 'server-only';
import {owned,assertFresh,pricingRule,type Actor} from './supplier-flow';
import {requestLimit} from './request-limit';
import {HttpError} from './http';
import {searchSchema} from './providers/contracts';
import {bookingSearchPrefill} from './booking-search-state';
import {customerFlightResults} from './customer-pricing';
import {exactAirportGroups} from './flight-airport-scope';

/** Restore only the caller's unexpired search. Re-project current customer pricing; never return the stored supplier payload. */
export async function customerFlightSearchSnapshot(searchId:string,actor:Actor){
  await requestLimit(actor.userId,'flight-search-snapshot',30);
  const search=await owned('supplier_searches',searchId,actor);
  const expiry=new Date(search.expires_at).getTime();
  if(!Number.isFinite(expiry))throw new HttpError(409,'This flight search is no longer available. Search again to continue.');
  assertFresh(search.expires_at);
  if(search.product!=='FLIGHT'||search.service_kind)throw new HttpError(400,'A flight search is required.');
  const parsed=searchSchema.safeParse(search.criteria);
  if(!parsed.success||parsed.data.product!=='FLIGHT')throw new HttpError(409,'This flight search is no longer available. Search again to continue.');
  const input=parsed.data;
  const criteria=bookingSearchPrefill({product:'FLIGHT',from:input.from,to:input.to,date:input.date,
    ...(input.returnDate?{returnDate:input.returnDate}:{}),...(input.legs?{legs:JSON.stringify(input.legs)}:{}),
    adults:String(input.adults),children:String(input.children),infants:String(input.infants),cabin:input.cabin});
  if(criteria.searchInvalid)throw new HttpError(409,'This flight search is no longer available. Search again to continue.');
  const rule=await pricingRule('FLIGHT',actor);
  const raw=search.results&&typeof search.results==='object'?search.results:{};
  const results=customerFlightResults({searchResult:{tripInfos:exactAirportGroups(raw.searchResult?.tripInfos,input)}},input,rule);
  return {searchId,expiresAt:new Date(expiry).toISOString(),criteria,results};
}
