import test from "node:test";
import assert from "node:assert/strict";
import { ANALYTICS_FUNNEL, analyticsConsent, DEFAULT_ANALYTICS_CONSENT, isPurchaseRelayEligible, prepareClientAnalyticsEvent, type PurchaseRelayEvidence } from "../src/lib/analytics";

const confirmed: PurchaseRelayEvidence = {
  eventType: "booking.confirmed", product: "FLIGHT", status: "TICKETED", paymentStatus: "CAPTURED",
  bookingTotalMinor: 125000, capturedAmountMinor: 125000, currency: "INR", serviceKind: null,
  hasParentOrder: false, environment: "production", analyticsConsent: "granted",
};

test("optional analytics defaults denied, with no coercion of invalid consent", () => {
  assert.equal(DEFAULT_ANALYTICS_CONSENT, "denied");
  for (const value of [undefined, null, true, 1, "true", "GRANTED", " granted ", {}, "denied"]) {
    assert.equal(analyticsConsent(value), "denied");
    assert.equal(prepareClientAnalyticsEvent({ name: "landing_view", publicPath: "/" }, value), null);
  }
  assert.equal(analyticsConsent("granted"), "granted");
  assert.equal(prepareClientAnalyticsEvent({ name: "landing_view", publicPath: "/" }), null);
});

test("only consented allowlisted public paths become in-memory landing events", () => {
  assert.deepEqual(prepareClientAnalyticsEvent({ name: "landing_view", publicPath: "/flights/hyderabad-to-delhi" }, "granted"), { name: "landing_view", publicPath: "/flights/hyderabad-to-delhi" });
  for (const path of ["https://maxtravel.in/flights", "/flights?email=private@example.test", "/flights#token", "/book", "/my-trips", "/operations/visibility", "/reset-password?token=private", "/flights/unknown", "/%66lights", "//flights"]) {
    assert.equal(prepareClientAnalyticsEvent({ name: "landing_view", publicPath: path }, "granted"), null);
  }
});

test("unknown fields, personal data and supplier identifiers are rejected, not forwarded", () => {
  for (const field of ["email", "phone", "nameOfPassenger", "passport", "dob", "pnr", "bookingId", "paymentId", "ticketNumber", "userId", "companyId", "query", "url", "referrer", "title", "providerResponse", "error"]) {
    assert.equal(prepareClientAnalyticsEvent({ name: "fare_selected", product: "FLIGHT", [field]: "sensitive" }, "granted"), null);
  }
  assert.equal(prepareClientAnalyticsEvent({ name: "landing_view", publicPath: { toString: () => "/" } }, "granted"), null);
  assert.equal(prepareClientAnalyticsEvent(null, "granted"), null);
});

test("browser funnel is deliberately minimal and cannot manufacture payment or purchase", () => {
  for (const event of [
    { name: "flight_search_submitted", product: "FLIGHT", journeyType: "RETURN", routeGroup: "DOMESTIC" },
    { name: "hotel_search_submitted", product: "HOTEL", routeGroup: "INTERNATIONAL" },
    { name: "fare_selected", product: "HOTEL" },
    { name: "checkout_started", product: "FLIGHT", currency: "INR" },
  ]) assert.deepEqual(prepareClientAnalyticsEvent(event, "granted"), event);
  for (const name of ["payment_captured", "booking_confirmed", "purchase", "refund_completed"]) {
    assert.equal(prepareClientAnalyticsEvent({ name, product: "FLIGHT" }, "granted"), null);
  }
  assert.deepEqual(ANALYTICS_FUNNEL.filter(stage => stage.conversion).map(stage => stage.name), ["booking_confirmed"]);
  assert.equal(prepareClientAnalyticsEvent({ name: "hotel_search_submitted", product: "HOTEL", routeGroup: "DOMESTIC", destination: "private search" }, "granted"), null);
});

test("consent withdrawal stops event preparation without queues or retained events", () => {
  const event = { name: "fare_selected", product: "FLIGHT" };
  assert.ok(prepareClientAnalyticsEvent(event, "granted"));
  assert.equal(prepareClientAnalyticsEvent(event, "denied"), null);
  assert.equal(prepareClientAnalyticsEvent(event), null);
});

test("purchase policy requires authoritative matching production confirmation and consent", () => {
  assert.equal(isPurchaseRelayEligible(confirmed), true);
  assert.equal(isPurchaseRelayEligible({ ...confirmed, product: "HOTEL", status: "CONFIRMED" }), true);
  const ineligible = [
    { eventType: "payment.captured" }, { eventType: "my_trips_view" }, { eventType: "booking.failed" },
    { status: "PAID" }, { status: "BOOKING_PENDING" }, { status: "MANUAL_REVIEW" }, { status: "BOOKING_FAILED" },
    { status: "CANCELLED" }, { status: "CONFIRMED" }, { product: "HOTEL" },
    { paymentStatus: "AUTHORIZED" }, { paymentStatus: "FAILED" }, { capturedAmountMinor: 124999 },
    { bookingTotalMinor: 0, capturedAmountMinor: 0 }, { capturedAmountMinor: 12.5 },
    { bookingTotalMinor: Number.MAX_SAFE_INTEGER + 1, capturedAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { environment: "uat" }, { environment: "unknown" }, { analyticsConsent: "denied" },
    { serviceKind: "REISSUE" }, { serviceKind: "ANCILLARY" }, { hasParentOrder: true },
    { currency: "USD" }, { bookingId: "must-not-enter-event" },
  ];
  for (const change of ineligible) assert.equal(isPurchaseRelayEligible({ ...confirmed, ...change }), false, JSON.stringify(change));
});
