import {z} from 'zod';
import {bookingSearchPrefill} from './booking-search-state';
import {emptyHotelFilters,type HotelFilters} from './hotel-results';
/** Tab-local presentation preferences only. Never store results, rates, travellers or tokens. */
export type HotelBrowse={filters?:HotelFilters;sort?:string;scrollY?:number};
const prefix='maxtravel:hotel-browse:v1:';
const maxEntries=20,retentionMs=30*60_000;
const validSearchId=(value:string)=>z.string().uuid().safeParse(value).success;
export function parseHotelBrowse(value:unknown):HotelBrowse {
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const raw=value as Record<string,unknown>,out:HotelBrowse={};
 if(raw.filters&&typeof raw.filters==='object'&&!Array.isArray(raw.filters)){
  const input=raw.filters as Record<string,unknown>,filters={...emptyHotelFilters};
  for(const key of Object.keys(filters) as (keyof HotelFilters)[])if(typeof input[key]==='string'&&input[key].length<=150&&!/[\u0000-\u001f\u007f]/.test(input[key]))filters[key]=input[key];
  out.filters=filters;
 }
 if(typeof raw.sort==='string'&&['price','price-desc','name','supplier'].includes(raw.sort))out.sort=raw.sort;
 if(typeof raw.scrollY==='number'&&Number.isFinite(raw.scrollY)&&raw.scrollY>=0&&raw.scrollY<=1000000)out.scrollY=raw.scrollY;
 return out;
}
function storedBrowse(raw:string|null,now:number):{savedAt:number;value:HotelBrowse}|null {
 try {
  if(!raw||raw.length>2000)return null;
  const envelope=JSON.parse(raw);
  if(!envelope||typeof envelope!=='object'||envelope.version!==1||typeof envelope.savedAt!=='number'||!Number.isFinite(envelope.savedAt)||envelope.savedAt>now||now-envelope.savedAt>=retentionMs)return null;
  return {savedAt:envelope.savedAt,value:parseHotelBrowse(envelope.value)};
 }catch{return null;}
}
/** Bound only our namespaced records; unrelated account/checkout storage is untouched. */
function pruneBrowse(now:number,keepKey?:string){
 const entries:{key:string;savedAt:number}[]=[];
 for(let index=0;index<sessionStorage.length;index++){
  const key=sessionStorage.key(index);if(!key?.startsWith(prefix))continue;
  const entry=validSearchId(key.slice(prefix.length))?storedBrowse(sessionStorage.getItem(key),now):null;
  entries.push({key,savedAt:entry?.savedAt??-1});
 }
 entries.sort((a,b)=>(b.key===keepKey?1:0)-(a.key===keepKey?1:0)||b.savedAt-a.savedAt);
 for(const [index,entry] of entries.entries())if(entry.savedAt<0||index>=maxEntries)sessionStorage.removeItem(entry.key);
}
export function readHotelBrowse(searchId:string):HotelBrowse {
 if(!validSearchId(searchId))return {};
 try{const now=Date.now();pruneBrowse(now);return storedBrowse(sessionStorage.getItem(prefix+searchId),now)?.value??{};}catch{return {};}
}
export function writeHotelBrowse(searchId:string,next:HotelBrowse){
 if(!validSearchId(searchId))return;
 try{
  const value=parseHotelBrowse({...readHotelBrowse(searchId),...next});
  const savedAt=Date.now();sessionStorage.setItem(prefix+searchId,JSON.stringify({version:1,savedAt,value}));pruneBrowse(savedAt,prefix+searchId);
 }catch{/* Browsing still works without storage. */}
}
/** Only bounded, validated public search criteria may survive in a shareable URL.
 * An oversized search keeps its owned server snapshot pointer, never a truncated
 * occupancy or hotel list. The snapshot endpoint revalidates ownership and expiry. */
export function hotelJourneyUrl(searchId:string,hotelId?:string,gallery=false,review=false):string {
 if(!validSearchId(searchId)||(hotelId!==undefined&&!/^\d{1,30}$/.test(hotelId)))return '/book?product=HOTEL';
 const input=new URLSearchParams(typeof window==='undefined'?'':window.location.search);
 for(const key of ['autoSearch','resumeSelection','resumeReview','selectionKey','browseSearch','stay','gallery','stayStep'])input.delete(key);
 input.set('product','HOTEL');
 const publicCriteria=bookingSearchPrefill(Object.fromEntries(input));
 const step={product:'HOTEL',browseSearch:searchId,...(hotelId?{stay:hotelId}:{}),...(gallery&&hotelId?{gallery:'1'}:{}),...(review&&hotelId?{stayStep:'review'}:{})};
 const params=new URLSearchParams({...(!publicCriteria.searchInvalid?publicCriteria:{}),...step});
 const url='/book?'+params.toString();
 return url.length<=2000?url:'/book?'+new URLSearchParams(step).toString();
}
