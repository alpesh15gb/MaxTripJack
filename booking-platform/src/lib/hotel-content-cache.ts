import { hotelObject, hotelPropertyDetails, type HotelPropertyDetails } from './hotel-presentation';
export type HotelContentStatus = 'pending' | 'resolved' | 'unavailable';

/** Official v3 static content contract. Never cache rates, inventory or cancellation here.
 * https://tripjack.com/page/api-doc#hotel-content
 * Scope must be established from the server's owned supplier search, not request input.
 */
export function createHotelContentCache(
  fetchContent: (hotelIds: string[]) => Promise<unknown>,
  now: () => number = Date.now,
  storedContent?: (hotelIds:string[]) => Promise<Record<string,HotelPropertyDetails>>,
) {
  const cache = new Map<string, {expires: number; property?: HotelPropertyDetails; status: Exclude<HotelContentStatus, 'pending'>}>();
  const pending = new Map<string, Promise<void>>();
  const maxEntries = 500;
  function put(id: string, property?: HotelPropertyDetails, status: Exclude<HotelContentStatus, 'pending'> = 'resolved') {
    cache.delete(id);
    cache.set(id, {expires: now() + (property ? 6 * 60 * 60_000 : 60_000), property, status});
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
  }
  function scopedIds(requestedIds: string[], ownedSearchHotelIds: string[]) {
    const owned = new Set(ownedSearchHotelIds);
    const ids = [...new Set(requestedIds)];
    if (ids.length > 100 || ids.some(id => !/^\d{1,30}$/.test(id) || !owned.has(id))) {
      throw new Error('Hotel content must belong to the current search.');
    }
    return ids;
  }
  function peek(requestedIds: string[], ownedSearchHotelIds: string[]): Record<string, HotelPropertyDetails> {
    const result: Record<string, HotelPropertyDetails> = {};
    for (const id of scopedIds(requestedIds, ownedSearchHotelIds)) {
      const entry = cache.get(id);
      if (entry?.property && entry.expires > now()) {
        cache.delete(id);cache.set(id,entry);
        result[id] = structuredClone(entry.property);
      }
    }
    return result;
  }
  function statuses(requestedIds: string[], ownedSearchHotelIds: string[]): Record<string, HotelContentStatus> {
    return Object.fromEntries(scopedIds(requestedIds, ownedSearchHotelIds).map(id => {
      const entry = cache.get(id);
      return [id, entry && entry.expires > now() ? entry.status : 'pending'];
    }));
  }
  async function contentForSearch(requestedIds: string[], ownedSearchHotelIds: string[]): Promise<Record<string, HotelPropertyDetails>> {
    const ids = scopedIds(requestedIds, ownedSearchHotelIds);
    const missing = ids.filter(id => !pending.has(id) && (!cache.has(id) || cache.get(id)!.expires <= now()));
    // Bound concurrent metadata work as well as retained cache entries.
    if (missing.length && pending.size + missing.length <= maxEntries) {
      const work = Promise.resolve().then(async() => {
        const found = new Map<string,HotelPropertyDetails>();
        if(storedContent)try{
          const stored=await storedContent(missing);
          for(const id of missing)if(Object.hasOwn(stored,id))found.set(id,structuredClone(stored[id]));
        }catch{ /* Optional local catalogue failure falls back to the supplier. */ }
        const remaining=missing.filter(id=>!found.has(id));
        try{
          if(remaining.length){
            const rows=hotelObject(await fetchContent(remaining)).hotels;
            if(!Array.isArray(rows))throw Error('Hotel content unavailable.');
            const allowed=new Set(remaining);
            for(const raw of rows.slice(0,100)){
              const hotel=hotelObject(raw);
              const id=typeof hotel.tjHotelId==='number'&&Number.isSafeInteger(hotel.tjHotelId)?String(hotel.tjHotelId):hotel.tjHotelId;
              if(typeof id==='string'&&allowed.has(id)&&hotel.is_active!==false)found.set(id,hotelPropertyDetails(hotel));
            }
          }
          for(const id of missing)put(id,found.get(id));
        }catch{
          // Keep useful local properties even when the remaining supplier batch fails.
          for(const id of missing)put(id,found.get(id),found.has(id)?'resolved':'unavailable');
        }
      }).finally(() => { for (const id of missing) pending.delete(id); });
      for (const id of missing) pending.set(id, work);
    }
    await Promise.all(ids.map(id => pending.get(id)));
    return peek(ids, ownedSearchHotelIds);
  }
  return Object.assign(contentForSearch, {peek, statuses});
}
