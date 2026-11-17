import {hotelMappingResponse} from './hotel-destination-pages';

export type HotelMappingRequest={regionIds:string[];page:number};
type Mapping=ReturnType<typeof hotelMappingResponse>;
const MAX_ENTRIES=256;
const MAX_PENDING=128;

/** UAT static region-to-hotel mapping only. Date/occupancy-sensitive availability
 * and supplier correlation IDs never enter this cache. Exact region order and
 * supplier page form the key; the caller still computes its full continuation. */
export function createHotelDestinationCache(now:()=>number=Date.now,ttlMs=5*60_000){
 if(!Number.isFinite(ttlMs)||ttlMs<0||ttlMs>30*60_000)throw Error('Invalid mapping cache duration.');
 const entries=new Map<string,{expires:number;value:Mapping}>();
 const pending=new Map<string,Promise<Mapping>>();
 return async function cachedMapping(input:HotelMappingRequest,load:()=>Promise<unknown>):Promise<Mapping>{
  if(!input.regionIds.length||input.regionIds.length>20||input.regionIds.some(id=>!/^\d{1,30}$/.test(id))||!Number.isInteger(input.page)||input.page<0||input.page>999999)throw Error('Invalid hotel mapping scope.');
  const key=JSON.stringify([input.regionIds,input.page]);
  if(ttlMs===0)return hotelMappingResponse(await load());
  const existing=entries.get(key);
  if(existing&&existing.expires>now()){
   entries.delete(key);entries.set(key,existing);
   return structuredClone(existing.value);
  }
  if(existing)entries.delete(key);
  const inFlight=pending.get(key);
  if(inFlight)return structuredClone(await inFlight);
  // Overflow retains the pre-cache request behaviour without retaining unbounded
  // promises. A failed/malformed response is never cached as an empty destination.
  if(pending.size>=MAX_PENDING)return hotelMappingResponse(await load());
  const work=Promise.resolve().then(load).then(raw=>{
   const value=hotelMappingResponse(raw);
   for(const [oldKey,entry]of entries)if(entry.expires<=now())entries.delete(oldKey);
   entries.set(key,{expires:now()+ttlMs,value});
   while(entries.size>MAX_ENTRIES)entries.delete(entries.keys().next().value!);
   return value;
  });
  pending.set(key,work);
  try{return structuredClone(await work);}finally{if(pending.get(key)===work)pending.delete(key);}
 };
}

export const cachedHotelDestinationMapping=createHotelDestinationCache();
