import test from "node:test";
import assert from "node:assert/strict";
import { passengerIdentitiesMatch } from "../src/lib/passenger-identity";
const asha = { fN: "Asha", lN: "Shah", pt: "ADULT" };
const ravi = { fN: "Ravi", lN: "Shah", pt: "ADULT" };
test("reissue requires one-to-one passenger identity counts, not membership", () => {
  assert.equal(passengerIdentitiesMatch([asha, ravi], [asha, asha]), false);
  assert.equal(passengerIdentitiesMatch([asha, ravi], [ravi, asha]), true);
  assert.equal(passengerIdentitiesMatch([asha, asha, ravi], [asha, ravi, asha]), true);
  assert.equal(passengerIdentitiesMatch([asha, asha, ravi], [asha, ravi, ravi]), false);
  assert.equal(passengerIdentitiesMatch([asha], [{ ...asha, pt: "CHILD" }]), false);
});
test("canonical matching tolerates case/spacing but not missing or different names", () => {
  assert.equal(passengerIdentitiesMatch([asha], [{ fN: " asha  ", lN: "SHAH", pt: "adult" }]), true);
  assert.equal(passengerIdentitiesMatch([{ ...asha, fN: "Asha Marie" }], [{ ...asha, fN: " Asha   Marie " }]), true);
  assert.equal(passengerIdentitiesMatch([asha], [{ ...asha, lN: "" }]), false);
  assert.equal(passengerIdentitiesMatch([asha], [{}]), false);
  assert.equal(passengerIdentitiesMatch([asha], null), false);
  assert.equal(passengerIdentitiesMatch([], []), false);
});
