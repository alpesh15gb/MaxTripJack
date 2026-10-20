# MaxTravel booking-platform: code SEO and discovery audit

**Audit date:** 20 October 2026. **Checkout:** `booking-platform/`, equivalent to verified review commit `57a86ab6657367c3ec710d8d678ab4422be771a4` when inspected. **Scope:** read-only source inspection and official public airport reference checks. No provider calls, transactions, secrets, database/customer reads, source edits, commits, pushes, or deployments. The requested report is the only file created by this audit. The live domain audit confirms Hostinger parking rather than this platform.

## 1. Executive result and ordered priorities

The code contains a careful authenticated booking/UAT foundation, not an SEO-ready public travel site. Public landing content can be added safely without touching booking authorization or fare execution. It must remain non-indexable until the real domain serves the intended, approved production site.

| Priority | Finding and evidence | Concrete fix | Status / owner |
|---|---|---|---|
| Critical | Public domain does not currently serve the inspected platform (separate live audit). Source cannot fix registrar/hosting routing. | Confirm target hosting and approved production version; configure apex/www HTTPS and permanent alternate-host redirect; verify raw HTML before enabling indexing. | Blocked on owner hosting/domain authorization; deployment owner. |
| Critical | Supplier client is explicitly UAT-only (`src/lib/providers/tripjack.ts`); `scripts/release-check.mjs` permits only Razorpay test keys. Header/footer and checkout say test environment. `NODE_ENV=production` does not mean real production inventory. | Explicit website indexing switch, default false. Keep UAT visibly labelled and noindexed. Go-live/indexing require deployment and business/provider acceptance, not merely a successful build. | Implementable local safeguard; production activation blocked. |
| Critical | No robots.txt, sitemap, canonical, JSON-LD or per-page robots metadata. `/book`, `/account`, `/my-trips`, `/operations`, `/travellers`, `/reset-password` inherit ordinary homepage metadata. | Page-specific titles; noindex private/workflow pages; nonproduction global noindex header/meta; production sitemap allowlist and crawler policy; strip reset tokens and search queries from analytics. | Implementable in source; SEO foundation owner. |
| High | Search/review are authenticated POSTs with verified principal, same-origin guard, expiring user/company-owned records. No public fare cache exists. | Separate public editorial landing pages from the authenticated funnel. Do not expose existing search/review/quote payloads or proxy raw supplier data for crawlers. Public prices need written supplier redistribution rights and separate approved feed design. | Guides implementable; public fares require supplier/business approval. |
| High | Only root title/description; homepage H1 is aspirational rather than descriptive; homepage navigation points largely to `/book?product=...`. | Descriptive root metadata/H1, permanent `/flights` hub, five allowlisted route guides, guide/pricing/support pages, visible contextual links and breadcrumbs. Preserve form behavior. | Implementable; public content owner. |
| High | No About, Contact, service/policy pages, office directions, or verified contact configuration. No verified business identity beyond brand/domain supplied in brief. | Organization with supplied name/url only; business configuration records provenance and verification for optional office/phone/hours/social identifiers. Omit unknown values and LocalBusiness details. Obtain real support/policy approvals before public launch. | Framework implementable; details require business verification. |
| High | No GA/GTM/consent/search-console code or funnel hooks found. Existing internal outbox has payment and booking events. | Consent-gated typed event foundation with no outbound destination by default; later server-side conversion relay from verified booking confirmation, idempotency and attribution consent. Do not count payment success as confirmed booking. | Foundation implementable; activation/accounts/consent design pending owner. |
| High | Every document dynamically SSRs via `connection()` and CSP nonce; proxy sets private/no-store. This is security design, not a rendering failure. | Keep nonce and SSR. Render public guide text on server without calling booking APIs. Add escaped nonce-bearing JSON-LD. Optimize assets without weakening CSP or globally caching private pages. | Implementable; SEO/performance owner. |
| Medium | Homepage hero is a 937,880-byte JPG loaded as CSS background, no responsive image selection; all global CSS files loaded in root. CWV not measured. | Measure mobile first; optimize the LCP asset with responsive image formats/dimensions/preload appropriate to measured behavior; lazy-load non-LCP imagery; reduce client islands only after tests. | Pending measurement/implementation; performance owner. |
| Medium | Photo README says production licensing/attribution must be confirmed. Airport directory records public-domain provenance. | Verify image rights before launch; retain airport attribution/provenance and editorial review dates. Do not represent destination photos as office/inventory. | Image verification pending; content owner. |
| Optional | No llms.txt or agent protocol implementation. | Accurate crawlable pages and permitted crawler policy first. Optional concise llms.txt after stable public URLs; no ranking or recommendation guarantee. | Optional, not blocking. |

## 2. Exact current architecture and privacy boundaries

### Documents

- `/`: `src/app/page.tsx` is a Client Component. Next can render initial client-component markup on the server; it is **not correct to call the entire homepage client-only/uncrawlable**. Search interactions and results are JS/API-driven. Root layout deliberately forces request-time SSR.
- `/book`: server wrapper reads a bounded query allowlist (`product`, `from`, `to`, dates, adults, city, hotelIds, nationality, autoSearch); `LiveBooking` initially renders a secure-session loading shell. Results and quotes are not public HTML. Deep links preserve search inputs, **not an itinerary guarantee**. The wrapper currently does not forward `cabin`, even though homepage appends Economy; do not expand itinerary claims based on this URL.
- `/account`, `/my-trips`, `/travellers`, `/operations`, `/reset-password`: public route shells around protected client/API features. Their lack of noindex is a crawl hygiene problem, not proof of customer-data exposure.
- No SEO route pages, custom route sitemap registry, native metadata routes, redirect map, custom not-found content, OpenGraph config or structured data found.

### Data

- `src/lib/access.ts`: verified email, session, account/company status, limits; company/admin MFA and permissions. Retain all gates.
- `src/lib/supplier-flow.ts`: search rows expire after 14 minutes; review lifetime is at most 180 seconds; actor ownership applies; company pricing rule can differ from retail pricing. An account-specific reviewed fare must never become a public “from” price.
- `src/lib/customer-pricing.ts`: customer estimates add configured markup and service fee; returns selected customer fields instead of full supplier fare response. Review total includes configured customer pricing. The UI still needs a clearly approved public explanation of mandatory totals and fare-dependent baggage/change rules; do not expose supplier net cost or markup as public metadata.
- `src/lib/http.ts`: business APIs use private/no-store. Airports directory GET is public/cached; directory is appropriate public data, not flight availability evidence.
- Bookings APIs provide identity-scoped itinerary, passengers, PNR/ticket documents. `crm-snapshot.ts` intentionally contains sensitive customer and supplier data for CRM; it must never feed public schema or analytics.
- Source `.env.example` names configuration requirements; no real `.env`, credentials, database records or customer payloads were inspected.

## 3. Minimal safe URL and indexability architecture

Production indexability is conditional on an explicit reviewed site-ready setting; **default remains OFF**. Avoid a single inherited root canonical because it would canonicalize every page to `/`.

| URL | Purpose | Production policy |
|---|---|---|
| `/` | Brand, clear flight/hotel booking purpose, existing search | Self canonical; index only approved production |
| `/flights` | Substantial flight search/route/booking guidance hub | Self canonical; sitemap |
| `/domestic-flights`, `/international-flights` | Distinct domestic/international checklists and selected routes | Add only with enough differentiated content; not duplicate hubs |
| `/flights/[slug]` | Five explicitly authored and source-tracked routes | Self canonical; allowlist only; unknown slug actual 404 |
| `/flight-booking-guide` | Search, full-price review, passenger details, payment versus confirmation, after-sales explanation | Self canonical; sitemap |
| `/pricing-transparency` | Estimates, expiry, mandatory total, optional extras, re-review, refund status | Self canonical; sitemap when approved |
| `/about`, `/contact` | Accurate identity and verified available support methods | Index only substantial approved pages; omit fake contacts/placeholders |
| `/customer-support` | How to find booking status and request help | Publish only actual workflows; never promise unsupported service SLA |
| `/book` and every query variant | Transactional search, selection and checkout | noindex, follow; exclude from sitemap; canonical query-free `/book` optional but noindex is primary control |
| `/account`, `/my-trips`, `/travellers`, `/operations`, `/reset-password` | Account/private/workspace | noindex, nofollow; no sitemap; preserve authentication |
| `/api/*`, PDFs, checkout responses | Operational/private data | X-Robots-Tag noindex, nofollow and private/no-store for private data; authentication remains security boundary |

**Robots approach:** in UAT/nonapproved environments disallow all and send site-wide noindex (robots alone is not an indexing guarantee). In approved production allow crawl of editorial pages/assets; disallow `/api/` and operational crawl traps. Leave HTML routes that need noindex discoverable long enough for engines to see noindex; do not claim disallow causes deindexing. A distinct search-bot policy must not accidentally loosen the generic private exclusions. Never allow a crawler past login/rate limits. Explicit company decision needed for training-crawler policies separate from search-discovery crawlers.

**Sitemap:** only absolute `https://maxtravel.in` canonical URLs from the same editorial allowlist used by route rendering; zero query strings, private routes, staging hosts, non-200 URLs or unapproved pages. Use actual content review/update dates, not `new Date()` on every request. Return an empty list in default-off mode. Exclude metadata text/XML routes from nonce document middleware if needed without altering HTML CSP.

**Redirects:** configure host/HTTP redirects at the actual trusted edge after hostname/certificate ownership is confirmed. Do not add speculative legacy redirects. Unknown guide slugs return notFound/404; only documented intentionally removed pages merit 410. Preserve search query inputs through canonical-domain redirects where appropriate; never place user identifiers in editorial canonicals.

## 4. Five useful route guides without invented inventory

All are **proposed authored guides**, not current-route availability claims. Names/codes below match `src/data/airports.json`; that directory records an OurAirports public-domain import on 15 October 2026 (`src/data/README.md`). Public airport references were checked on 20 October 2026. Flight operators, frequency, duration, fares, baggage kilos and connection guarantees must be omitted unless verified for the requested itinerary; show these in live authenticated results/review instead.

| Proposed route | Verified airport pair | Differentiated helpful content and CTA |
|---|---|---|
| `/flights/hyderabad-to-delhi` | Rajiv Gandhi International Airport (HYD) → Indira Gandhi International Airport (DEL) | Departure-airport transport reference; check the arrival terminal against ticket before planning onward travel; compare complete journey and cancellation rules. CTA `/book?product=FLIGHT&from=HYD&to=DEL` allows traveller-selected dates, no auto-search from crawlers. |
| `/flights/delhi-to-mumbai` | Indira Gandhi International Airport (DEL) → Chhatrapati Shivaji Maharaj International Airport (BOM) | Confirm Mumbai airport **code** rather than generic city name; compare route/terminal details and transfer logistics. Do not silently substitute a different Mumbai-area airport. CTA DEL→BOM. |
| `/flights/hyderabad-to-dubai` | Rajiv Gandhi International Airport (HYD) → Dubai International (DXB) | International document checklist with official entry/airline links (not personalized visa advice), confirm DXB rather than DWC, inspect connection and baggage terms. CTA HYD→DXB. |
| `/flights/mumbai-to-dubai` | Chhatrapati Shivaji Maharaj International Airport (BOM) → Dubai International (DXB) | Exact departure and arrival airports matter; verify operating airline/terminal; all-inclusive total and separate-ticket/connection caution. CTA BOM→DXB. |
| `/flights/bengaluru-to-delhi` | Kempegowda International Airport Bengaluru (BLR) → Indira Gandhi International Airport (DEL) | Confirm departure terminal on chosen itinerary; compare connection versus nonstop options returned for the date; ground-transport planning and final fare rules. CTA BLR→DEL. |

Each needs: unique title/description/H1, visible breadcrumb, airport summary table, route-specific 3–5 practical decisions, fare/baggage/confirmation explanation, visible evidence links and reviewed date, explicit no-inventory-until-search wording, related-guide links and one usable CTA. No airline logo/partnership claim, fabricated “daily flights,” fixed duration, cheapest-price statistic, review count, fake fare or Offer JSON-LD. If a guide cannot pass editorial differentiation review, keep it noindex and off sitemap rather than padding it.

**Reference links and limitations:**

- [Hyderabad airport official website](https://www.hyderabad.aero/) confirms identity and publishes ground-transport and flight-status resources. [Passenger airlines](https://www.hyderabad.aero/passenger-airline) is an airport-level airline directory, **not evidence every airline operates each proposed city pair**.
- [Delhi airport official website](https://www.newdelhiairport.in/) was visible in search results with airport/terminal identity; direct fetch returned 502. Use the locally sourced airport name but verify deep guidance links before publication.
- [Mumbai airport operator announcement](https://www.adani.com/newsroom/media-releases/mumbais-future-gateway-to-the-world-t1-csmia-to-serve-additional-20-mppa-post-modernisation) verifies the airport identity. It is a dated redevelopment announcement, not proof of current terminal arrangements. Main airport direct fetch returned 502; avoid current-terminal assertions.
- [Bengaluru airport official website](https://www.bengaluruairport.com/) confirms identity in title; parsed content sparse, so no detailed terminal assertions are substantiated here.
- [Dubai International official identity](https://dubaiairports.ae/corporate/our-story/dxb-dubai-international) and [Dubai airport contact/airport locations](https://dubaiairports.ae/contact-information) distinguish DXB and DWC; use as source links, not MaxTravel contact channels.
- [OurAirports data](https://ourairports.com/data/) provenance comes from repository documentation; direct retrieval timed out in this audit. Directory import is not live inventory or a current flight schedule.

## 5. Metadata, JSON-LD and verified business configuration

Root metadata: `metadataBase: new URL('https://maxtravel.in')`; consistent `MaxTravel` brand; title default/template; useful description of flights/hotels and booking review without “cheapest/best.” Specific pages supply their own canonical/title/description. Add social metadata only for actual owned images with correct dimensions and meaningful alt text.

Use server `Organization` with `@id https://maxtravel.in/#organization`, `name MaxTravel`, `url https://maxtravel.in` (user-supplied facts); WebSite may identify the same organization. Do not declare functioning site search via SearchAction when the target is authenticated and nonfunctional for public agents. BreadcrumbList reflects the visible hierarchy. Route pages can use WebPage/CollectionPage appropriate to actual content; do not label an airport pair as a specific Flight without date/operator/times, or add Offers without real public offers.

Implement a typed `business-profile` data module with explicit verified entries, source/evidence reference and verified date. Optional legal name, address, coordinates, office images, phone, WhatsApp, email, opening hours, maps URL, registration/accreditation, review profiles and support scope default absent. A value being present is not sufficient verification. After the initial audit, the owner confirmed the Secunderabad address/contact details and 09:00–21:00 daily hours. Use those verified entries only; coordinates, office photos, registrations and ratings remain unverified. Only add TravelAgency/LocalBusiness address/contact schema when required facts are verified and visible on-page. Do not add AggregateRating from unverifiable testimonials or self-serving promotional counts.

Security requirements: follow local Next 16.4 docs read in this audit; metadata exports are Server Components only. Client homepage/reset views need a server wrapper or layout if customized. Read `headers()` in server JSON-LD component to obtain existing nonce; serialize with `JSON.stringify(...).replace(/</g, '\\u003c')`; never unescaped business/content HTML. Preserve strict script-src nonce/strict-dynamic, same-origin API and private no-store. Do not add script unsafe-inline or wildcard connect-src to make SEO/analytics work.

## 6. Public fare visibility: separate approval and data product

**Ready now:** honest route guidance, authenticated search CTA, full-total explanation and explicit quote expiry; no public fare snapshots. The source already computes marked-up customer totals and short-lived review expiry. Retain revalidation and captured-payment/supplier-confirmation separation.

**Supplier approval required:** a contract covering anonymous display, search-engine caching, metasearch redistribution, permitted cache TTL, applicable carriers/markets, price/tax/service-fee requirements, inventory refresh, attribution, sponsored/negotiated fares, deep links and production rate limits. UAT data is never advertising inventory. Company/private negotiated fares must never enter a retail feed.

**After approval:** isolated sanitized public-offer model: origin/destination codes; exact travel dates; traveller/cabin assumptions; total INR mandatory amount; included/excluded extras; airline/flight/segment/timing facts only when returned; fetchedAt/expiresAt; publication eligibility and source; an opaque public offer ID with no auth/session/booking reference. Refresh out of band under approved limits; expired/unavailable prices disappear rather than persist as bait. Deep link resolves offer then rechecks current availability and requests explicit price-change acceptance before checkout. No feed implementation or supplier calls authorized during this audit. Google Flights inclusion remains a separate partner process, not a consequence of schema/sitemap.

## 7. Tracking foundation, conversion source and privacy

No analytics library, gtag/dataLayer, GTM container, web-vitals reporting or GSC/Bing verification was found. No live analytics account access was attempted. Current CSP would also block common analytics connections; only add precise approved destinations after consent and account configuration.

| Event | Evidence/trigger | Allowed minimum fields | Conversion? |
|---|---|---|---|
| `landing_view` | Public editorial page, optional consented client dispatch | allowlisted pathname, page type, route ID, campaign allowlist | No |
| `flight_search_submitted` | User submits validated flight form; no speculative prefetch event | product, route codes, journey type, cabin; coarse lead-time band optional | No |
| `fare_selected` | User selection accepted in UI | product, route ID, result category; avoid opaque supplier IDs | No |
| `checkout_started` | Actual reviewed quote proceeds to traveller/checkout step | product, currency, normalized funnel stage | No |
| `payment_captured` | Verified server payment state only | internal opaque analytics transaction token, amount/currency if consented | **No confirmed-booking conversion** |
| `booking_confirmed` / GA purchase relay | Existing `booking.confirmed` outbox and verified terminal state: flight TICKETED, hotel CONFIRMED | idempotent analytics transaction token, product, customer total, currency, consented attribution | **Yes, once** |
| `booking_failed` / `booking_review_required` | Authoritative server outcome | category; no raw errors/provider payloads | No |
| `refund_completed` | Verified completed refund, not request/offer | original analytics token, actual refunded amount/currency | Refund adjustment, not new sale |

`src/lib/booking-runner.ts` emits `booking.confirmed` only after supplier success (and extras fulfilment). `src/lib/paid-order.ts` and Razorpay webhook separately emit `payment.captured`. Preserve distinction. A front-end My trips poll may observe a confirmed booking repeatedly, so it is not a trustworthy unique purchase dispatcher. Consume outbox via separate relay with a unique `(order_id, conversion_kind)` dispatch record/transaction token, retry safely, exclude UAT and cancelled/failed/uncertain states, and categorize reissues/ancillaries so they do not inflate base bookings. Do not serialize existing CRM outbox payloads directly to Google.

Default analytics should be off/no-op, not a hidden external collector. Explicit analytics consent separate from necessary cookies, with withdrawal and no new storage before consent. Never send names, email, phone, passport/PAN/DOB, PNR, ticket/booking/customer/company IDs, full URLs/query strings, private DOM text, raw errors, supplier references or private prices. Disable automatic page views/form/outbound enhanced measurement on private/payment/reset surfaces. Sanitize attribution/referrer to approved source labels and never include reset tokens. Do not hash raw email and claim that is anonymous.

Suggested dashboards once authorized: (1) GSC nonbrand clicks/impressions by approved landing URL, indexing/canonical issues; (2) funnel unique sessions to searches/selections/checkout and authoritative confirmed bookings; (3) confirmed customer revenue/refunds with clear distinction from gross payment capture and net margin; (4) consented measurable AI referrers with unknown/unattributed bucket, not invented AI recommendation counts; (5) mobile field LCP/INP/CLS at p75 after sufficient real traffic. Baselines presently unknown; targets are user-requested thresholds, not achieved measurements.

## 8. Implementable ownership and acceptance plan

Avoid simultaneous edits of the booking engine and SEO scaffolding. Suggested independent file ownership:

1. **SEO foundation owner:** `src/lib/seo.ts` (origin, allowlist metadata builders, default-off indexing), `src/app/robots.ts`, `src/app/sitemap.ts`, `src/components/seo-json-ld.tsx`, targeted `layout.tsx`/private metadata wrappers/`next.config.ts` headers. Tests for staging deny, production allowlist, canonical host/path, query exclusion, JSON-LD escaping and CSP nonce. Coordinate root-layout edits with other owners.
2. **Editorial/routes owner:** `src/data/flight-routes.ts`, reusable server landing component, `/flights`, `/flights/[slug]`, five substantial guides, `/flight-booking-guide`, `/pricing-transparency`; source-linked facts and reviewed dates. Unknown slug must 404; never import supplier-flow, db, auth or provider modules into content data/render path. Test rendered HTML without JS and no provider requests.
3. **Identity/trust owner:** `src/data/business-profile.ts`, `/about`, `/contact`, support copy and verified-only schema helpers. Missing details omitted; absent office must not become fake Google Maps embed or placeholder tel/WhatsApp. Owner verifies all live support/legal/privacy/cancellation-policy representations.
4. **Shell integration owner:** homepage metadata/server wrapper and travel-shell links/brand messaging, keeping booking form interactions and UAT labeling. Remove public promotion of operations workspace (not a replacement for auth); add actual editorial links. Assets work separately after measurement.
5. **Analytics owner:** `src/lib/analytics.ts` typed sanitization/consent/no-op sink and tests; explicit point hooks coordinated with homepage/live-booking owners. External GA/GTM activation and server outbox purchase relay remain disabled/unimplemented until IDs, consent and data-processing approvals. Do not modify payment verification or supplier runner merely to claim tracking delivery.
6. **Release/QA owner:** run unit suite, lint, type check, production build, and existing non-transactional browser suites under supported mock setup. HTML fetch/browser check route 200/404, canonical robots sitemap, nonce/CSP, public pages free of credentials/private data, mobile keyboard navigation, known booking flows unchanged. No provider integration tests that might use real keys; simulated tests only with established interception. No production release without explicit owner authorization.

Acceptance evidence must state **passed / failed / not run**, not treat source build as real supplier acceptance or measured SEO growth. No commit, push, merge, DNS mutation or deploy in this audit. Parent is reviewing this first-pass audit before assigning code files.
