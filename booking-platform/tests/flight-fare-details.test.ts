import test from "node:test";
import assert from "node:assert/strict";
import { flightFareDetails } from "../src/lib/flight-fare-details";
import { customerFlightResults } from "../src/lib/customer-pricing";
import type { Search } from "../src/lib/providers/contracts";

const criteria: Extract<Search, { product: "FLIGHT" }> = {
  product: "FLIGHT", from: "BOM", to: "DEL", date: "2026-12-20",
  adults: 1, children: 0, infants: 0, cabin: "ECONOMY",
};
const adult = { bI: { cB: "7 Kg", iB: "15 Kg" }, cB: "Y", cc: "ECONOMY",
  fB: "SUPPLIER-PRIVATE", fC: { BF: 4000, NF: 4500, TF: 5000.25, TAF: 1000.25 },
  mI: false, rT: 1, sR: 8, afC: { TAF: { MF: 10, OT: 20, MFT: 2 } } };
function present(price: Record<string, unknown>, pax = criteria) {
  const result = customerFlightResults({ searchResult: { tripInfos: { ONWARD: [{
    sI: [{ da: { code: "NMI" }, aa: { code: "DXN" }, fD: { aI: {} } }],
    totalPriceList: [{ id: "synthetic-fare", fareIdentifier: "PUBLISHED", ...price }],
  }] } } }, pax, { markup_minor: 1000, markup_basis_points: 100, service_fee_minor: 200 });
  return result.searchResult.tripInfos.ONWARD[0] as {
    sI: { da: { code: string }; aa: { code: string } }[];
    totalPriceList: { customerEstimateMinor: number | null; fD: Record<string, unknown> }[];
  };
}
test("actual UAT fd preserves total, baggage and refund metadata without exposing net fare", () => {
  const result = present({ fd: { ADULT: adult }, tai: { cci: {}, tbi: {} }, icca: false, msri: [], messages: [] });
  assert.equal(result.totalPriceList[0].customerEstimateMinor, 506225);
  assert.deepEqual(result.totalPriceList[0].fD.ADULT, { bI: adult.bI, cc: "ECONOMY", rT: 1 });
  for (const hidden of ["NF", "afC", "SUPPLIER-PRIVATE", "tai"]) assert.equal(JSON.stringify(result).includes(hidden), false);
  assert.equal(result.sI[0].da.code, "NMI");
  assert.equal(result.sI[0].aa.code, "DXN");
});
test("documented fD and actual fd produce identical customer presentation", () => {
  assert.deepEqual(present({ fd: { ADULT: adult } }), present({ fD: { ADULT: adult } }));
});
test("adult child infant totals multiply each per-pax fare and apply booking fees once", () => {
  const result = present({ fd: { ADULT: adult, CHILD: { fC: { TF: "3000.50" } }, INFANT: { fC: { TF: 500 } } } },
    { ...criteria, adults: 2, children: 1, infants: 1 });
  assert.equal(result.totalPriceList[0].customerEstimateMinor, 1364801);
});
test("missing or malformed requested passenger totals stay unknown, never inferred from BF/NF", () => {
  for (const TF of [undefined, null, "", false, {}, -1, "NaN", Infinity]) {
    assert.equal(present({ fd: { ADULT: { fC: { TF, BF: 100, NF: 90 } } } }).totalPriceList[0].customerEstimateMinor, null);
  }
  assert.equal(present({ fd: { ADULT: adult } }, { ...criteria, children: 1 }).totalPriceList[0].customerEstimateMinor, null);
  assert.equal(present({ fd: { ADULT: { fC: { TF: 0 } } } }).totalPriceList[0].customerEstimateMinor, null);
  for (const fd of [undefined, null, [], "invalid"]) assert.equal(present({ fd }).totalPriceList[0].customerEstimateMinor, null);
});
test("conflicting aliases fail closed, including conflicting terms with the same total", () => {
  for (const upper of [{ ADULT: { ...adult, rT: 0 } }, { ADULT: { fC: { TF: 1 } } }, null]) {
    assert.throws(() => present({ fd: { ADULT: adult }, fD: upper }), /Conflicting supplier fare details/);
  }
  assert.deepEqual(present({ fd: { ADULT: adult }, fD: structuredClone({ ADULT: adult }) }), present({ fd: { ADULT: adult } }));
});
test("shared accessor exposes actual and documented cabin details for reissue validation", () => {
  for (const key of ["fd", "fD"]) assert.deepEqual(Object.values(flightFareDetails({ [key]: { ADULT: adult } })), [adult]);
});
