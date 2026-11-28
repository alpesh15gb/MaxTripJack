/**
 * Short-lived, in-process cache for anonymous supplier flight availability.
 * The key contains only the supplier request, never a user's marked-up results.
 * Review still re-prices every selection. TTL=0 disables storage and coalescing.
 */
export type FlightSearchCacheStatus = "miss" | "hit" | "coalesced" | "disabled" | "bypass";
type Entry = { at: number; ttl: number; pending: boolean; value: Promise<unknown> };
type CacheLookup = (status: FlightSearchCacheStatus, freshUntil: number, fetchedSince: number) => void;
const MAX_ENTRIES = 200;
// Provider transport times out after 45s. A separate bounded pending window lets
// a short configured cache TTL coalesce that request without retaining old fares.
const MAX_PENDING_MS = 60_000;
// Warm and normal search handlers are separate Next bundles in production.
const shared=globalThis as unknown as {maxtravelFlightSearchCacheV1?:Map<string,Entry>};
const entries = shared.maxtravelFlightSearchCacheV1??=new Map<string, Entry>();

function remove(key: string, entry: Entry) {
 if (entries.get(key) !== entry) return;
 entries.delete(key);
}
function prune(now: number) {
 for (const [key, entry] of entries) {
  if (now - entry.at >= (entry.pending ? MAX_PENDING_MS : entry.ttl)) remove(key, entry);
 }
}
function evictSettled(needsSlot = false) {
 // Insertion order is LRU. Never evict active work just to keep another result:
 // doing so would start duplicate supplier calls for users who are still waiting.
 const maximum = MAX_ENTRIES - (needsSlot ? 1 : 0);
 for (const [key, entry] of entries) {
  if (entries.size <= maximum) break;
  if (!entry.pending) remove(key, entry);
 }
}

const DEFAULT_TTL_MS = 300_000;
function boundedTtl(value: string | undefined) {
 const raw = Number(value?.trim() || DEFAULT_TTL_MS);
 return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 300_000) : DEFAULT_TTL_MS;
}
/** Listings stay valid for five minutes by default; review always re-prices. */
export function flightSearchCacheTtl(env: Record<string, string | undefined> = process.env) {
 return boundedTtl(env.FLIGHT_SEARCH_CACHE_TTL_MS);
}
export function hotelSearchCacheTtl(env: Record<string, string | undefined> = process.env) {
 return boundedTtl(env.HOTEL_SEARCH_CACHE_TTL_MS);
}

type HotelListing<T> = { data: T; correlationId: string };
function hotelListingKey(payload: Record<string, unknown>) {
 const { correlationId: _ignored, ...criteria } = payload; void _ignored;
 return {hotelListing:criteria};
}
function freshEntry(key: string, ttl: number, now: number) {
 const entry = entries.get(key);
 return ttl>0&&entry&&now-entry.at<(entry.pending?MAX_PENDING_MS:Math.min(ttl,entry.ttl))?entry:undefined;
}
/** Page loads can reuse ready or in-flight work without spending supplier budget. */
export function hasCachedFlightSearch(payload: unknown) {
 return Boolean(freshEntry(JSON.stringify(payload),flightSearchCacheTtl(),Date.now()));
}
export function hasCachedHotelSearch(payload: Record<string, unknown>) {
 return Boolean(freshEntry(JSON.stringify(hotelListingKey(payload)),hotelSearchCacheTtl(),Date.now()));
}
/** Hotel listings are bound to the supplier correlation ID that produced them,
 * so the cached value keeps that ID and later room pricing uses the same one. */
export function cachedHotelSearch<T>(
 payload: Record<string, unknown>, correlationId: string, load: (correlationId: string) => Promise<T>,
 ttl = hotelSearchCacheTtl(), onLookup?: CacheLookup,
): Promise<HotelListing<T>> {
 return cachedFlightSearch(hotelListingKey(payload), async () => ({ data: await load(correlationId), correlationId }), ttl, undefined, onLookup);
}

export async function cachedFlightSearch<T>(
 payload: unknown, load: () => Promise<T>, ttl = flightSearchCacheTtl(), now = Date.now(),
 onLookup?: CacheLookup,
): Promise<T> {
 if (ttl === 0) { onLookup?.("disabled",now,now); return load(); }
 const key = JSON.stringify(payload);
 prune(now);
 const hit = freshEntry(key,ttl,now);
 if (hit) {
  entries.delete(key); entries.set(key, hit);
  onLookup?.(hit.pending ? "coalesced" : "hit",hit.at+Math.min(ttl,hit.ttl),hit.at);
  return hit.value as Promise<T>;
 }
 const stale = entries.get(key);
 if (stale) remove(key, stale);
 evictSettled(true);
 // All slots can be occupied by active requests. Stay bounded without evicting
 // them; this distinct search still runs normally and is simply not stored.
 if (entries.size >= MAX_ENTRIES) { onLookup?.("bypass",now+ttl,now); return load(); }
 onLookup?.("miss",now+ttl,now);
 const value = load();
 const entry: Entry = { at: now, ttl, pending: true, value };
 entries.set(key, entry);
 void value.then(() => {
  if (entries.get(key) !== entry) return;
  entry.pending = false;
  // Keep the original start time: a slow response does not gain a new TTL.
 }, () => remove(key, entry));
 return value;
}

export function clearFlightSearchCache() { entries.clear(); }
