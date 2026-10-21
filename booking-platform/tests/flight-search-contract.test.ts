import test from "node:test";
import assert from "node:assert/strict";
import { flightSearch, type Search } from "../src/lib/providers/contracts";

type Flight = Extract<Search, { product: "FLIGHT" }>;
const base: Flight = {
  product: "FLIGHT", from: "BOM", to: "DEL", date: "2026-10-29",
  adults: 1, children: 0, infants: 0, cabin: "ECONOMY",
};
const route = (from: string, to: string, travelDate: string) => ({
  fromCityOrAirport: { code: from }, toCityOrAirport: { code: to }, travelDate,
});

test("regular one-way search omits optional modifiers and preserves the minimal UAT contract", () => {
  assert.deepEqual(flightSearch(base), { searchQuery: {
    cabinClass: "ECONOMY", paxInfo: { ADULT: 1, CHILD: 0, INFANT: 0 },
    routeInfos: [route("BOM", "DEL", "2026-10-29")],
  } });
});

test("regular return search preserves route order, all passenger counts and cabin without modifiers", () => {
  assert.deepEqual(flightSearch({ ...base, returnDate: "2026-11-02",
    adults: 2, children: 1, infants: 1, cabin: "BUSINESS" }), { searchQuery: {
    cabinClass: "BUSINESS", paxInfo: { ADULT: 2, CHILD: 1, INFANT: 1 },
    routeInfos: [route("BOM", "DEL", "2026-10-29"), route("DEL", "BOM", "2026-11-02")],
  } });
});

test("regular multi-city search preserves explicit legs and premium cabin without modifiers", () => {
  const legs = [
    { from: "BOM", to: "DEL", date: "2026-10-29" },
    { from: "DEL", to: "BLR", date: "2026-11-01" },
    { from: "BLR", to: "BOM", date: "2026-11-04" },
  ];
  assert.deepEqual(flightSearch({ ...base, legs, adults: 3, children: 2,
    infants: 1, cabin: "PREMIUM_ECONOMY" }), { searchQuery: {
    cabinClass: "PREMIUM_ECONOMY", paxInfo: { ADULT: 3, CHILD: 2, INFANT: 1 },
    routeInfos: legs.map(leg => route(leg.from, leg.to, leg.date)),
  } });
});
