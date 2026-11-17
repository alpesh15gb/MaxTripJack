/**
 * Short-lived, in-process cache for anonymous supplier flight availability.
 * The key contains only the supplier request, never a user's marked-up results.
 * Review still re-prices every selection. TTL=0 disables storage and coalescing.
 */
export type FlightSearchCacheStatus = "miss" | "hit" | "coalesced" | "disabled" | "bypass";
type Entry = { at: number; ttl: number; pending: boolean; value: Promise<unknown> };
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

export function flightSearchCacheTtl(env: Record<string, string | undefined> = process.env) {
 const raw = Number(env.FLIGHT_SEARCH_CACHE_TTL_MS ?? 90_000);
 return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 300_000) : 90_000;
}

export async function cachedFlightSearch<T>(
 payload: unknown, load: () => Promise<T>, ttl = flightSearchCacheTtl(), now = Date.now(),
 onLookup?: (status: FlightSearchCacheStatus, freshUntil?:number) => void,
): Promise<T> {
 if (ttl === 0) { onLookup?.("disabled",now); return load(); }
 const key = JSON.stringify(payload);
 prune(now);
 const hit = entries.get(key);
 if (hit && (hit.pending || now - hit.at < Math.min(ttl, hit.ttl))) {
  entries.delete(key); entries.set(key, hit);
  onLookup?.(hit.pending ? "coalesced" : "hit",hit.at+Math.min(ttl,hit.ttl));
  return hit.value as Promise<T>;
 }
 if (hit) remove(key, hit);
 evictSettled(true);
 // All slots can be occupied by active requests. Stay bounded without evicting
 // them; this distinct search still runs normally and is simply not stored.
 if (entries.size >= MAX_ENTRIES) { onLookup?.("bypass",now+ttl); return load(); }
 onLookup?.("miss",now+ttl);
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
