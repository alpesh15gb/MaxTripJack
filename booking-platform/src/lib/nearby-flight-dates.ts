import { bookingSearchUrl } from './booking-search-state';

/** Date navigation uses submitted criteria only; an existing return is never moved. */
export function nearbyFlightSearch(criteria:Record<string,string>, offset:number, today:string):{date:string;url:string}|null {
  if(criteria.product!=='FLIGHT'||criteria.legs||!Number.isInteger(offset)||Math.abs(offset)>7||offset===0)return null;
  const source=criteria.date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(source??''))return null;
  const parsed=new Date(`${source}T12:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==source)return null;
  parsed.setUTCDate(parsed.getUTCDate()+offset);
  const date=parsed.toISOString().slice(0,10);
  if(date<today||(criteria.returnDate&&date>criteria.returnDate))return null;
  const search={...criteria};
  for(const key of ['browseSearch','flightSearch','flightStops','flightSort','flightAirlineQuery','stay','gallery','stayStep','selectionKey','resumeSelection','resumeReview'])delete search[key];
  const url=bookingSearchUrl({...search,date,autoSearch:'1'});
  return url?{date,url}:null;
}
