# Flight services — implementation and UAT checklist

Checked against the official reference at https://tripjack.com/page/api-doc on 17 October 2026. The current public reference includes post-booking ancillaries and auto reissue. Flights use FMS/OMS v1 (fare rules v2); hotels use HMS/OMS v3. A v3 subscription does not change flight endpoint paths.

## Routes

- POST /api/travel/search accepts optional `legs` (2–6 chronological routes) for FLIGHT. The existing first-route fields must equal the first leg; `returnDate` is excluded. Review accepts up to six price IDs and reorders them using saved supplier groups. COMBO uses one price ID.
- GET /api/bookings/:id/cancellation-options returns owned trip/passenger choices and previously cancelled units. POST cancellation accepts optional `selection: [{tripIndex,travellerIndexes}]`; names and airport/date scope are derived on the server. Full cancellation after an earlier partial request applies to the remaining units only.
- GET /api/bookings/:id/services exposes eligible reissue trip/passenger choices.
- POST /api/bookings/:id/services accepts `{kind:"ANCILLARY"}` or `{kind:"REISSUE",tripIndex,date,travellerIndexes}`. Result IDs are owner-scoped and expire.
- POST /api/travel/service-review accepts a saved service search plus `priceId` for reissue or `choices:[{segmentId,paxId,kind,code}]` for extras. Client prices are never accepted.
- POST /api/payments/create accepts service `quoteId` and accepted integer-minor total. Passenger/contact data is copied from the original booking; the client cannot replace it. Positive totals use existing Razorpay capture verification. Zero-cost services create a single supplier job without a payment. The quote is unique and retries reuse its order.

## Supplier calls

Extras: `/fms/v1/ancillaries/fetch/ssr` → `/fms/v1/ancillaries/fetch/seat` → `/oms/v1/air/amendment/add/ssr` → `/oms/v1/air/amendment/amendment-details`. The server builds `sI[].bI.tI[]` from offered IDs/codes. Connecting baggage is repeated across journey segments with zero amount on subsequent segments. Unknown responses never lead to resubmission. Complete amendment IDs, original booking, selected SSR codes and total amount must match before success.

Reissue: `/fms/v1/reissue/poll/searchquery-list` → `/fms/v1/reissue/poll/search` → `/fms/v1/reissue/review` → `/oms/v1/air/amendment/auto-reissue` → `/oms/v1/booking-details`. Original IDs/PNR and reviewed passenger data are retained, and the supplier payment uses the reviewed incremental TF in rupees.

Cancellation charges/submission share an immutable trip/passenger scope. The worker checks up to five times with ten-second scheduling, then leaves pending requests for staff/support. Staff status reconciliation never resubmits an amendment.

## Storage and operations

Run `npm run db:migrate` to apply 012-partial-cancellation and 013-flight-services. Existing booking/refund/cancellation/CRM workers handle these flows; no new service worker is needed. Rebuild workers and application images after updating. Runtime database grants continue to cover added fields.

Orders link service purchases through `parent_order_id` and `service_kind`. Confirmed partial refund offers are summed. CRM retains a separate charge/payment/invoice for each purchase; the original travel invoice is reduced only by confirmed cancellation offers, with refunds recorded separately.

A lost SSR response requires TripJack support to provide every amendment ID. In Operations → Bookings → Recheck an uncertain supplier booking, enter the purchase ID and recovered amendment IDs. Permission, original booking and complete-reference checks apply. If selected SSR details or amounts disagree, the purchase remains in manual review.

## Automated local checks

`npm test`, `npm run test:flight-services`, `npm run test:cancellations`, `npm run test:refunds`, `npm run test:providers`, `npm run test:integration`, and production nonce checks. Integration tests use synthetic identities, the local database and intercepted provider calls. They never execute real provider transactions. Authentication quotas apply to repeated local test runs; wait for a quota reset if a signup returns 429.

## UAT acceptance

Confirm actual SSR catalogue shapes, passenger/segment IDs, existing selections, connecting baggage, seat eligibility, per-trip amendment counts, charge totals and returned SSRAmendmentDetails. Confirm reissue polling parameters, passenger array location, price changes, expiry, one-time restriction, partial/return/international cases and original/replacement ticket status. Verify partial cancellation scope against live supplier records before enabling real customer transactions. Do not interpret successful simulations as confirmation of these provider payload details.

## Initial checkout extras (18 October 2026)

`GET /api/travel/checkout-extras?quoteId=...` returns owner-scoped meal/baggage choices from Review and seats from `/fms/v1/seat` only when `conditions.isa` is true. `POST` accepts `{quoteId,choices:[{segmentId,travellerIndex,kind,code}]}`. Prices come exclusively from the saved review and refreshed seat map. Baggage is charged once per passenger/trip and its code is applied to each connecting segment. Infants, duplicate seats, unavailable options and exit-row choices are rejected. Missing or ambiguous supplier fields fail closed.

Applying extras updates the existing quote with its base supplier amount and a frozen SSR snapshot. No extra markup/booking fee is repeatedly compounded. Updates and payment-intent creation lock the quote; extras cannot change once an order exists. The customer must accept the revised total. Before payment, Fare Validate receives the same SSR payload that Book will receive. Any returned fare/class alert or mismatched returned total blocks checkout. After payment a changed fare requires operations reconciliation rather than charging more automatically.

The Book payload uses documented `travellerInfo[].ssrBaggageInfos`, `ssrMealInfos` and `ssrSeatInfos`, each with server-selected segment `key` and `code`. Order summaries, booking details and confirmation PDFs retain the purchased extras. Supplier success without matching passenger/segment SSR confirmation stays in manual review, and status rechecks never resubmit Book. Real UAT must confirm actual fare-validation totals and returned SSR field shapes before enabling live purchases.

`npm run test:checkout` intercepts all supplier/payment traffic and checks initial extras from search through captured payment, lost Book-response recovery and confirmation, plus distinct hotel room occupancy. Real provider acceptance remains pending.
