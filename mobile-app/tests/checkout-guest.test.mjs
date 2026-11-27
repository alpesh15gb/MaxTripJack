import assert from "node:assert/strict";
import test from "node:test";
import { checkCheckoutGuests, checkedContactPhone } from "../src/checkout-guest.ts";

const adult = { ti: "Mr", pt: "ADULT", fN: "Sample", lN: "Traveller" };
const gst = { number: "", name: "", address: "" };
const emergency = { name: "", email: "", phone: "" };
const check = (guests, review) => checkCheckoutGuests(guests, review, "2026-12-10", "2026-12-20", gst, emergency);

test("checkout accepts Indian shorthand and international phone formatting", () => {
  assert.equal(checkedContactPhone("98765 43210"), "9876543210");
  assert.equal(checkedContactPhone("+1 (202) 555-0148"), "+12025550148");
  assert.throws(() => checkedContactPhone("+91 23456 78901"), /mobile number/);
  assert.throws(() => checkedContactPhone("2025550148"), /country code/);
});

test("checkout looks up required child DOB and passport data before opening payment", () => {
  assert.throws(() => check([{ ...adult, pt: "CHILD" }], {}), /valid date of birth/);
  assert.throws(() => check([adult], { conditions: { pcs: { pm: true } } }), /passport number/);
  assert.throws(() => check([{ ...adult, pNum: "X12345", pNat: "IN", eD: "2026-12-15" }], {
    conditions: { pcs: { pm: true } },
  }), /final travel date/);
});

test("hotel PAN is required only for the primary adult and required contacts are prechecked", () => {
  const primary = { ...adult, pan: "ABCDE1234F", roomIndex: 0 };
  const other = { ...adult, roomIndex: 1 };
  assert.doesNotThrow(() => check([primary, other], { option: { compliance: { panRequired: true } } }));
  assert.throws(() => check([adult], { conditions: { iecr: true } }), /emergency contact/);
  assert.throws(() => check([adult], { conditions: { gst: { igm: true } } }), /GSTIN/);
});
