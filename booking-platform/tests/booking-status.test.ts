import test from "node:test";
import assert from "node:assert/strict";
import { bookingStatusMoney, bookingStatusTitle, bookingStatusView } from "../src/lib/booking-status";

const flight = { product: "FLIGHT", status: "PAYMENT_PENDING", paymentStatus: null as string | null, totalMinor: "654000" };

test("captured payment never establishes a ticket or room confirmation", () => {
  for (const product of ["FLIGHT", "HOTEL"]) {
    for (const status of ["PAYMENT_PENDING", "PAID", "BOOKING_PENDING", "MANUAL_REVIEW", "BOOKING_FAILED"]) {
      const view = bookingStatusView({ ...flight, product, status, paymentStatus: "CAPTURED" });
      assert.equal(view.paymentReceived, true);
      assert.equal(view.confirmed, false);
      assert.equal(view.poll, true);
    }
  }
});

test("supplier confirmation must match the product's final persisted state", () => {
  assert.equal(bookingStatusView({ ...flight, status: "CONFIRMED" }).confirmed, false);
  assert.equal(bookingStatusView({ ...flight, status: "TICKETED" }).confirmed, true);
  assert.equal(bookingStatusView({ ...flight, product: "HOTEL", status: "TICKETED" }).confirmed, false);
  assert.equal(bookingStatusView({ ...flight, product: "HOTEL", status: "CONFIRMED" }).confirmed, true);
  assert.equal(bookingStatusView({ ...flight, product: "OTHER", status: "TICKETED" }).confirmed, false);
});

test("payment receipt is not inferred from authorisation, order state or a missing payment", () => {
  for (const paymentStatus of [null, "CREATED", "AUTHORIZED", "FAILED", "UNKNOWN"]) {
    assert.equal(bookingStatusView({ ...flight, status: "PAID", paymentStatus }).paymentReceived, false);
    assert.equal(bookingStatusView({ ...flight, status: "TICKETED", paymentStatus }).paymentReceived, false);
  }
});

test("failure, manual review and unknown outcomes keep checking without offering a new payment", () => {
  for (const status of ["BOOKING_FAILED", "MANUAL_REVIEW", "UNRECOGNISED"]) {
    const view = bookingStatusView({ ...flight, status });
    assert.equal(view.confirmed, false);
    assert.equal(view.tone, "attention");
    assert.equal(view.poll, true);
    assert.match(view.description, /before making another payment|do not pay again/);
  }
});

test("cancellation does not erase receipt or imply a refund", () => {
  const view = bookingStatusView({ ...flight, status: "CANCELLED", paymentStatus: "CAPTURED" });
  assert.equal(view.confirmed, false);
  assert.equal(view.paymentReceived, true);
  assert.match(view.description, /refund is tracked separately/);
});

test("zero cost services do not invent a captured payment", () => {
  const view = bookingStatusView({ ...flight, status: "TICKETED", totalMinor: "0", serviceKind: "ANCILLARY" });
  assert.equal(view.paymentRequired, false);
  assert.equal(view.paymentReceived, false);
  assert.equal(view.confirmed, true);
  assert.match(view.title, /extras/);
});

test("summary preserves multi-city and hotel identity and rejects invalid money", () => {
  assert.equal(bookingStatusTitle({ product: "FLIGHT", itinerary: { legs: [{ from: "BOM", to: "DEL", date: "2026-11-22" }, { from: "DEL", to: "GOI", date: "2026-11-25" }] } }), "BOM → GOI");
  assert.equal(bookingStatusTitle({ product: "HOTEL", hotelName: "Confirmed hotel", itinerary: { hotelName: "Search name" } }), "Confirmed hotel");
  assert.equal(bookingStatusMoney("not-a-number", "INR"), "Amount unavailable");
  assert.equal(bookingStatusMoney("-1", "INR"), "Amount unavailable");
});
