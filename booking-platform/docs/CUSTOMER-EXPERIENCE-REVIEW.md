# Customer experience review — 21 October 2026

## Product standard
A successful render is not a successful booking. The customer must be able to compare a real flight or room, understand the reviewed price and restrictions, keep their work through sign-in or repricing, and distinguish payment from supplier confirmation.

## Research and observed journey
Public primary-source research covered Google Flights, Booking.com, Expedia and MakeMyTrip. The live Max Travel homepage-to-search-to-account journey was inspected in a cloud browser. It stopped anonymous shopping at sign-in and lost the intended return destination. Authenticated competitor checkout was not exercised. Public competitor prices are not evidence of current offers.

Useful references:
- Google Flights comparison: https://support.google.com/travel/answer/7664728?hl=en
- Google baggage pricing: https://support.google.com/travel/answer/9074247?hl=en
- Booking.com disclosures: https://www.booking.com/content/how_we_work.en-gb.html
- Expedia cancellation journey: https://www.expedia.com/helpcenter/?articleId=12996
- Expedia accessibility: https://www.expedia.com/lp/b/accessibility-policy?langid=1033
- MakeMyTrip flight information: https://www.makemytrip.com/flights/gaya-jabalpur-fare-calendar.html
- TripJack provider contract: https://tripjack.com/page/api-doc

## This implementation tranche
- Anonymous flight/hotel discovery with signed short-lived guest ownership, shared database rate limits, public pricing and authenticated ownership transfer for review.
- Private travellers, bookings, company pricing and payment remain protected. No privileged fallback account.
- Homepage family/cabin criteria and advanced-search continuity; sign-in, verification, reset and 2FA return to safe internal journeys.
- Flight segment/fare detail and final itinerary/traveller/contact review. Actual supplier-backed hotel content and room-rate facts, with missing data kept explicit.
- Known pre-intent payment unavailability is distinct from uncertain payment; existing duplicate-payment safeguards remain.
- Cancellation submission refresh and idempotent uncertain retry; travel-date grouping and understandable refund states.

## Verification boundaries
Unit tests and synthetic browser fixtures prove defined UI behaviour, not real supplier fulfilment. Disposable PostgreSQL tests additionally exercise real migrations, concurrent guest ownership claims, actual BetterAuth sessions, route handlers and database rate limits. Supplier transport is intercepted in these tests. Report actual test counts and executed browser evidence with the release, not discovery counts.

## Deployment and launch prerequisites
- Do not deploy without successful combined build, regression checks and desktop/mobile review.
- Anonymous shopping needs scoped transient-data maintenance enabled and healthy. The existing maintenance worker removes expired transient searches, unused quotes and rate buckets after two days. Do not run other booking workers accidentally.
- Trusted-proxy mode is OFF by default. Enable only when the application is loopback-only and the trusted proxy overwrites forwarded-IP headers. Default shared limits are conservative, not evidence of production traffic capacity.
- Real Google Workspace/SMTP delivery and authenticated customer verification remain to be configured and tested. Never bypass email verification.
- PayGlocal UAT access, official integration package and actual gateway verification are still outstanding. The live-payment gate remains closed.
- Hotel catalogue coverage, actual supplier static-content availability and photo fallback must be tested on the merchant UAT account. Unknown facts must not become fabricated amenities, scores, availability or cancellation promises.
- Customer-facing privacy/booking terms require owner-approved content; do not invent legal policy.
- Complete travel vouchers/itineraries, full search-history behaviour, long traveller-entry repricing, and all aftersales supplier scenarios require further integrated acceptance testing. This tranche is not a claim that every app gap is resolved.
