/**
 * Short-lived, in-process cache for anonymous supplier flight availability.
 * The key is the supplier request body only (never a user or session), identical concurrent searches share one
 * supplier call, failures are never cached, and the window is far shorter than the 14-minute search record.
 * Fares are still re-priced by the supplier at review. Set FLIGHT_SEARCH_CACHE_TTL_MS=0 to disable.
 */
type Entry = { at: number; value: Promise<unknown> };
const MAX_ENTRIES = 200;
const entries = new Map<string, Entry>();

export function flightSearchCacheTtl(env: Record<string, string | undefined> = process.env) {
 const raw = Number(env.FLIGHT_SEARCH_CACHE_TTL_MS ?? 90_000);
 return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 300_000) : 90_000;
}

export async function cachedFlightSearch<T>(payload: unknown, load: () => Promise<T>, ttl = flightSearchCacheTtl(), now = Date.now()): Promise<T> {
 if (ttl === 0) return load();
 const key = JSON.stringify(payload);
 const hit = entries.get(key);
 if (hit && now - hit.at < ttl) return hit.value as Promise<T>;
 const value = load();
 entries.set(key, { at: now, value });
 value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
 for (const [k, e] of entries) if (now - e.at >= ttl) entries.delete(k);
 while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
 return value;
}

export function clearFlightSearchCache() { entries.clear(); }
