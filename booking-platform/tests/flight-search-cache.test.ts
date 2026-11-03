import assert from "node:assert/strict";
import test from "node:test";
import { cachedFlightSearch, clearFlightSearchCache, flightSearchCacheTtl } from "../src/lib/flight-search-cache";

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
