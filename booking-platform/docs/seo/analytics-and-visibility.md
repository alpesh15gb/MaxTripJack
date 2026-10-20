# Visibility dashboard and privacy-safe measurement foundation

Implemented locally on 20 October 2026. **Not deployed; external measurement not activated.**

## What exists

- `/operations/visibility` checks the existing administrator gate on the server before rendering its dashboard. `/api/admin/visibility` independently requires `finance:read`, verified email, active account/grant and MFA before its aggregate database read. API responses use `private, no-store`; the page is noindex. It has no new write endpoint or export of individual records.
- The private screen links from the operations console. External reports and funnel values are explicitly **not connected / not measured**. Unknown is not zero. Account existence is not inferred.
- `src/lib/analytics.ts` validates strict, minimal event shapes and exact public paths from the SEO registry. Consent defaults to denied; invalid consent stays denied. Preparation is pure and in-memory only. There is **no** network sink, tag, cookie, storage, persistent identifier, automatic page view, listener, browser hook or third-party script. This is not an activated consent platform.
- The existing nonce CSP is untouched. No Google/GA/GTM IDs or credentials were invented, requested by API or added to configuration.

## Ledger definitions and limits

The read-only report is one PostgreSQL statement/MVCC snapshot over all currently retained rows. Amounts remain exact decimal strings in paise and are formatted with `BigInt`, never floating-point totals. Database schema currently enforces INR.

| Panel | Definition | Not equivalent to |
|---|---|---|
| Currently confirmed base bookings / gross booking value | Base order only (`service_kind` and `parent_order_id` null); flight `TICKETED` or hotel `CONFIRMED`; matching captured payment amount/currency; an existing authoritative `booking.confirmed` outbox event. `EXISTS` avoids multiplication from duplicate events/payments. Sum `orders.total_minor` once per qualifying order. | Historical issued sales, organic sales, net revenue, profit or production conversions |
| Captured payments | All `payments` in `CAPTURED`, including after-sales, counted/summed independently. | Confirmed bookings; successful payment is not successful ticketing |
| Completed refunds | `refunds` in `COMPLETED` linked to captured payments. Requested/approved/processing are excluded. | Refund offers, refund requests or sales |

The supplier adapter is hardcoded UAT-only. Records lack a per-order environment flag, so the dashboard explicitly labels the result a **test-environment operational snapshot, not a production baseline**. Production revenue remains null. Do not promote this to production reporting by merely changing `NODE_ENV` or a label. Introduce and validate environment/test segregation before production reporting. Cancellation changes current confirmed counts; removed outbox history can make this conservative count incomplete. It is not a historical finance ledger. Current `total_minor` can include checkout extras bundled into the base order; separate after-sales child orders are excluded from its booking count. Capture and refund totals have a wider scope, so subtracting them from the confirmed-value card is not valid revenue accounting.

Failed authentication/database reads show unavailable, never zero. Production traffic, keyword position/demand, attribution, organic gross booking value, agency margin and AI visibility remain unknown. No live database result or real account connection is claimed by source-level tests.

## Event contract and future hook points

| Event | Future hook | Minimum data | Conversion |
|---|---|---|---|
| `landing_view` | Explicitly consented, allowlisted editorial page view | Exact registry path (no URL/query/fragment) | No |
| `flight_search_submitted` | Accepted validated search submission, not prefetch | `FLIGHT`, journey type, domestic/international/unknown group | No |
| `hotel_search_submitted` | Accepted validated hotel search submission, as an alternative to flight search | `HOTEL`, domestic/international/unknown group; no destination or dates | No |
| `fare_selected` | User selection accepted by UI | Product only | No |
| `checkout_started` | Reviewed quote actually proceeds to checkout | Product, INR | No |
| `payment_captured` | Existing server `payment.captured` after verification | Future minimal, separately consent-reviewed server schema | **No** |
| `booking_confirmed` / future GA purchase | `src/lib/booking-runner.ts` authoritative `booking.confirmed`, paid + flight ticketed / hotel confirmed | Future random analytics transaction ID, product, currency and defined value; no order/PNR/customer IDs | **Yes, only once after relay QA** |
| Future refund adjustment | Completed refund transition in `src/lib/refund-runner.ts` / verified gateway reconciliation | Same separate analytics transaction mapping, actual completed amount | Adjustment, not purchase |

No hooks have been added to booking, payment, refund or My trips code. `isPurchaseRelayEligible` is only a **pure policy check**, not authority, delivery or durable deduplication. Trusted server code must assemble its inputs from locked/verified records, not a browser request. UAT, unpaid, mismatched payment amount, pending, failed, review, cancelled, reissue, ancillary and denied-consent records are rejected by that policy. Duplicate requests do not become safe merely by calling this predicate twice.

### Required before enabling a relay

1. Owner/privacy approval: purpose, countries, notice, retention, access, processors, withdrawal and the distinction between necessary booking processing and optional analytics. Preserve a fully usable booking flow when analytics is declined.
2. Choose one approved GA4 delivery strategy (direct or GTM-managed), real property/stream IDs and least-privilege account access. Configure precise CSP destinations only after security review; never weaken nonce protection, add script `unsafe-inline`, or wildcard connections.
3. Implement a real consent UI and auditable consent linkage/withdrawal that does not store or send optional measurement before opt-in. No advanced cookieless pings by default. Resolve later withdrawal before delayed delivery; do not backfill pre-consent events.
4. Add a separate persistent analytics dispatch ledger with a unique `(order_id, conversion_kind)` constraint, random transaction ID mapping retained privately, transactional claim/lease, retries and deduplication. Do not reuse/consume CRM delivery state or send raw outbox payloads. Reissues/ancillaries need a separate explicit metric definition.
5. Define refund idempotency and reconciliation. Confirm actual order state/payment/currency/value/environment at dispatch. Gate delayed/cancelled/review states appropriately. Treat partial refunds accurately.
6. Keep exact raw URLs, query strings, fragments, search/support free text, private DOM/title, raw errors, traveler names, email/phone, DOB/passport/PAN, PNR/tickets, booking/customer/company IDs, gateway IDs/tokens and supplier references out of every event. Do not hash emails and call them anonymous. Disable automatic form/page/outbound measurement on private, checkout, payment and reset surfaces.
7. Validate approved test fixtures: denied/withdrawn consent sends no optional requests, event schema rejects sensitive fields, repeated outbox delivery yields exactly one purchase, payment-only and incomplete bookings yield none, refunds reconcile, and analytics failure never blocks booking. Only then mark purchase as a key event and reconcile a consent-eligible sample with the secured ledger.

## Manual baseline worksheet (not yet measured)

First complete 28-day production window after approved activation. Record UTC report generation time and the actual reporting time zone. Record test/internal traffic exclusions, consent gaps, attribution definitions and source export evidence. If existing verified historical data exists, import only after owner access and source validation.

| Measure | Source | Window / zone | Baseline | Target |
|---|---|---|---|---|
| Organic clicks, impressions, non-brand query rules | Search Console | Not available | Not measured | Set after baseline |
| Indexed approved landing URLs and exclusion reasons | Search Console / Bing | Not available | Not measured | Set after inspection |
| Consented funnel counts and abandonment | Approved analytics + ledger reconciliation | Not available | Not measured | Set after baseline |
| Organic confirmed booking value / conversion rate | Consented attribution + verified production ledger | Not available | Not measured | Set after baseline |
| Observable AI referrals and supported citation reports | Analytics / available webmaster tools | Not available | Not measured | No universal AI visibility score |
| Office profile actions | Verified eligible Business Profile | Not available | Not measured | Set after baseline |
| Mobile field p75 LCP / INP / CLS | Sufficient real field data | Not available | Not measured | ≤ 2.5 s / ≤ 200 ms / ≤ 0.1 (targets, not achieved results) |

Search Console/Bing ownership and GA4/GTM access remain unknown owner/external dependencies. The owner reports an existing Google Business Profile, with client-owner access expected tomorrow; access, profile identity and office details are not yet verified. Obtain that access and review the existing profile rather than creating a duplicate. No account creation, verification submission, profile edit, API request, analytics activation, live provider call or deployment was performed by this work.

## Local verification

- `node --import tsx --test tests/analytics.test.ts tests/visibility-readiness.test.ts tests/visibility-access.test.ts`: **17 passed**. Covers denied/withdrawn consent, strict PII/path rejection, flight/hotel search shapes, no browser purchase/capture, authoritative-purchase eligibility, unknown baselines, exact bigint amounts, and independently mocked authorization/ledger boundaries.
- Focused ESLint and `npx tsc --noEmit --pretty false`: passed at handoff.
- Access tests bundle the actual page/API with deterministic auth doubles. They verify 401/403/503 before ledger access or private dashboard rendering, exact `finance:read`, header forwarding and no-store responses. Ledger tests inspect actual SQL and map synthetic aggregate results; **they do not execute against PostgreSQL or verify real financial balances**.
- Account connectivity, enabled production telemetry, durable conversion deduplication/refund reconciliation and actual authenticated database reporting remain unverified/not activated. Aggregate application build/HTTP/browser checks are tracked separately in the release QA report.
