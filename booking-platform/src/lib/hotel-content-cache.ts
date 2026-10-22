import { hotelObject, hotelPropertyDetails, type HotelPropertyDetails } from './hotel-presentation';

/** Official v3 static content contract. Never cache rates, inventory or cancellation here.
 * https://tripjack.com/page/api-doc#hotel-content
 * Scope must be established from the server's owned supplier search, not request input.
 */
export function createHotelContentCache(
  fetchContent: (hotelIds: string[]) => Promise<unknown>,
  now: () => number = Date.now,
) {
  const cache = new Map<string, {expires: number; property?: HotelPropertyDetails}>();
  const pending = new Map<string, Promise<void>>();
  const maxEntries = 500;
  function put(id: string, property?: HotelPropertyDetails) {
    cache.delete(id);
    cache.set(id, {expires: now() + (property ? 6 * 60 * 60_000 : 60_000), property});
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
      if (entry?.property && entry.expires > now()) result[id] = structuredClone(entry.property);
    }
    return result;
  }
  async function contentForSearch(requestedIds: string[], ownedSearchHotelIds: string[]): Promise<Record<string, HotelPropertyDetails>> {
    const ids = scopedIds(requestedIds, ownedSearchHotelIds);
    const missing = ids.filter(id => !pending.has(id) && (!cache.has(id) || cache.get(id)!.expires <= now()));
    // Bound concurrent metadata work as well as retained cache entries.
    if (missing.length && pending.size + missing.length <= maxEntries) {
      const work = Promise.resolve().then(() => fetchContent(missing)).then(response => {
        const allowed = new Set(missing);
        const rows = hotelObject(response).hotels;
        const found = new Map<string, HotelPropertyDetails>();
        for (const raw of (Array.isArray(rows) ? rows : []).slice(0, 100)) {
          const hotel = hotelObject(raw);
          const id = typeof hotel.tjHotelId === 'number' && Number.isSafeInteger(hotel.tjHotelId) ? String(hotel.tjHotelId) : hotel.tjHotelId;
          if (typeof id === 'string' && allowed.has(id) && hotel.is_active !== false) found.set(id, hotelPropertyDetails(hotel));
        }
        for (const id of missing) put(id, found.get(id));
      }).catch(() => {
        // Optional catalogue failure must not break dynamic availability; no raw error/key exposure.
        for (const id of missing) put(id);
      }).finally(() => { for (const id of missing) pending.delete(id); });
      for (const id of missing) pending.set(id, work);
    }
    await Promise.all(ids.map(id => pending.get(id)));
    return peek(ids, ownedSearchHotelIds);
  }
  return Object.assign(contentForSearch, {peek});
}
