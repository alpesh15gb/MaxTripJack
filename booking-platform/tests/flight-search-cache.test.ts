import assert from "node:assert/strict";
import test from "node:test";
import { cachedFlightSearch, clearFlightSearchCache, flightSearchCacheTtl, type FlightSearchCacheStatus } from "../src/lib/flight-search-cache";

function deferred<T>() {
 let resolve!: (value: T) => void, reject!: (error: Error) => void;
 const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
 return { promise, resolve, reject };
}

test("identical searches share one supplier call inside the window", async () => {
 clearFlightSearchCache();
 let calls = 0;
 const load = async () => ({ n: ++calls });
 const [a, b] = await Promise.all([cachedFlightSearch({ r: 1 }, load, 1000, 0), cachedFlightSearch({ r: 1 }, load, 1000, 10)]);
 assert.equal(calls, 1);
 assert.equal(a, b);
 await cachedFlightSearch({ r: 2 }, load, 1000, 20);
 assert.equal(calls, 2);
});

test("entries expire and failures are not cached", async () => {
 clearFlightSearchCache();
 let calls = 0;
 await cachedFlightSearch({ r: 1 }, async () => ++calls, 1000, 0);
 await cachedFlightSearch({ r: 1 }, async () => ++calls, 1000, 1500);
 assert.equal(calls, 2);
 clearFlightSearchCache();
 await assert.rejects(cachedFlightSearch({ r: 3 }, async () => { throw new Error("supplier"); }, 1000, 0));
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(await cachedFlightSearch({ r: 3 }, async () => "ok", 1000, 1), "ok");
});

test("ttl zero disables caching and the env value is bounded", async () => {
 clearFlightSearchCache();
 let calls = 0;
 await cachedFlightSearch({ r: 1 }, async () => ++calls, 0);
 await cachedFlightSearch({ r: 1 }, async () => ++calls, 0);
 assert.equal(calls, 2);
 assert.equal(flightSearchCacheTtl({ FLIGHT_SEARCH_CACHE_TTL_MS: "0" }), 0);
 assert.equal(flightSearchCacheTtl({ FLIGHT_SEARCH_CACHE_TTL_MS: "99999999" }), 300000);
 assert.equal(flightSearchCacheTtl({ FLIGHT_SEARCH_CACHE_TTL_MS: "abc" }), 90000);
});

test("a slow in-flight request is shared past a short TTL without extending settled fare freshness", async () => {
 clearFlightSearchCache();
 const supplier = deferred<{ fare: number }>(), states: FlightSearchCacheStatus[] = [];
 let calls = 0;
 const load = () => { calls++; return supplier.promise; };
 const first = cachedFlightSearch({ date: "2026-12-12" }, load, 1000, 0, state => states.push(state));
 const concurrent = cachedFlightSearch({ date: "2026-12-12" }, load, 1000, 1500, state => states.push(state));
 assert.equal(calls, 1, "the second user waits on existing work, not a duplicate supplier request");
 supplier.resolve({ fare: 5000 });
 assert.deepEqual(await Promise.all([first, concurrent]), [{ fare: 5000 }, { fare: 5000 }]);
 const fresh = await cachedFlightSearch({ date: "2026-12-12" }, async () => ({ fare: ++calls * 3000 }), 1000, 1501, state => states.push(state));
 assert.equal(fresh.fare, 6000, "a later search cannot reuse fares beyond their original start-time TTL");
 assert.deepEqual(states, ["miss", "coalesced", "miss"]);
});

test("a stuck request stops being shared after a bounded window; its failure cannot evict newer work", async () => {
 clearFlightSearchCache();
 const old = deferred<string>(), next = deferred<string>();
 const first = cachedFlightSearch({ r: 1 }, () => old.promise, 1000, 0);
 const rejected = assert.rejects(first, /old request failed/);
 const second = cachedFlightSearch({ r: 1 }, () => next.promise, 1000, 60_001);
 old.reject(new Error("old request failed"));
 await rejected;
 const shared = cachedFlightSearch({ r: 1 }, async () => "unexpected duplicate", 1000, 60_002);
 next.resolve("fresh result");
 assert.deepEqual(await Promise.all([second, shared]), ["fresh result", "fresh result"]);
});

test("cache pressure retains active requests and bypasses storage when every slot is in flight", async () => {
 clearFlightSearchCache();
 const supplier = deferred<string>(), states: FlightSearchCacheStatus[] = [];
 let calls = 0;
 const load = () => { calls++; return supplier.promise; };
 const pending = Array.from({ length: 200 }, (_, route) => cachedFlightSearch({ route }, load, 1000, 0));
 const overflow = cachedFlightSearch({ route: 200 }, load, 1000, 1, state => states.push(state));
 const firstAgain = cachedFlightSearch({ route: 0 }, load, 1000, 2, state => states.push(state));
 assert.equal(calls, 201, "pressure must not evict the first user and trigger an extra supplier call");
 assert.deepEqual(states, ["bypass", "coalesced"]);
 supplier.resolve("result");
 assert.equal((await Promise.all([...pending, overflow, firstAgain])).length, 202);
});

test("recently used routes survive entry pressure without extending their expiry", async () => {
 clearFlightSearchCache();
 for (let route = 0; route < 200; route++) await cachedFlightSearch({ route }, async () => route, 1000, 0);
 await cachedFlightSearch({ route: 0 }, async () => -1, 1000, 1);
 await cachedFlightSearch({ route: 200 }, async () => 200, 1000, 2);
 assert.equal(await cachedFlightSearch({ route: 0 }, async () => -1, 1000, 3), 0);
 assert.equal(await cachedFlightSearch({ route: 1 }, async () => -1, 1000, 3), -1);
 assert.equal(await cachedFlightSearch({ route: 0 }, async () => -1, 1000, 1000), -1);
});

test("route, passenger, cabin and travel-date changes never share availability", async () => {
 clearFlightSearchCache();
 const base = { from: "BOM", to: "DEL", date: "2026-12-12", adults: 1, cabin: "ECONOMY" };
 const variants = [base, { ...base, to: "BLR" }, { ...base, date: "2026-12-13" }, { ...base, adults: 2 }, { ...base, cabin: "BUSINESS" }, { ...base, returnDate: "2026-12-19" }];
 let calls = 0;
 for (const request of variants) await cachedFlightSearch(request, async () => ++calls, 1000, 0);
 assert.equal(calls, variants.length);
 assert.equal(await cachedFlightSearch(base, async () => ++calls, 1000, 10), 1);
});
