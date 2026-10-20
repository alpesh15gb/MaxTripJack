# MaxTravel: search, travel-distribution and measurement assessment

Research date: 20 October 2026 (UTC). Scope: public official documentation and a small qualitative competitor sample. This report is a research/implementation specification, not evidence of account configuration, supplier approval or a live integration.

## Executive decision

**Proceed with crawlable, useful pages and a privacy-safe measurement implementation; do not publish UAT fares, enable production payments or claim Google Flights membership.** Task context says the existing supplier integration is TripJack UAT and Razorpay is in test mode. Production inventory, metasearch redistribution/public-cache rights, live payment approval and successful ticketing are not verified. No real provider API, booking or payment transaction was performed for this assessment.

Organic web indexing, AI-search eligibility, Google Flights distribution and Google Hotel Center are separate workstreams. A sitemap or schema.org `Flight`/`Offer` markup does not onboard an OTA into Google Flights. No crawler setting guarantees an AI recommendation.

## 1. Google Flights: verified eligibility and integration path

### What Google actually publishes

Google's OTA policy requires an established brand and successful ticket purchases, post-sale support, localized service/payment support, an all-in final landing price, opt-in extras, and no checkout price change except customer-added costs. Transactions must complete within 24 hours of initial confirmation; rejected transactions must remain below 1%. Technical requirements include preselected itinerary deep links, landing-page live repricing, a technical contact and issue-response process. Published limits are link errors ≤5% and price errors ≤10%; Google can sample up to 5,000 itineraries daily. The recommended **Live API** returns flights, prices and deep links and requires a Price Accuracy Tag. **Price through Google** is case-by-case, using authorized GDS/PCC/Amadeus-office fee rules or LCC adjustments. A generic route-search page is not the required itinerary deep link. [Official OTA participation policy](https://support.google.com/travel/answer/9905232).

The actual onboarding interest form asks for legal entity/address, authorized contacts/signatory, trading history, average monthly online tickets over the previous 12 months, other metasearch presence, accreditation, merchant-of-record status, markets/languages/currencies, engineering resources, price feed/API capability and tracking readiness. These are application questions, **not proof that IATA membership alone guarantees admission or that any unstated minimum volume applies**. The public form warns some integrations can take up to six months. [Google Flights interest form](https://support.google.com/travel/contact/partnersupport_OTA).

The public developer landing page identifies partner onboarding separately from ordinary Search; its OTA getting-started link returned HTTP 404 during this research. Detailed approved specifications and commercial acceptance must therefore come from the onboarding process, not a guessed API contract. No form was submitted. [Google Flights developer entry point](https://developers.google.com/travel/flights), [unavailable OTA getting-started target](https://developers.google.com/travel/flights/otas/getting-started).

### MaxTravel implementation gates

| Gate | Required evidence / concrete action | Current status |
|---|---|---|
| Operating entity | Owner verifies legal name, address, company registration where applicable, authorized signatory, support contacts and sales history | Requires business verification |
| Inventory rights | Supplier confirms production activation, B2C resale, public display, cache/refresh limits, metasearch redistribution, airline content restrictions and permission to identify MaxTravel as seller | Requires supplier approval; UAT is insufficient |
| Reliable fulfillment | Document payment authorization/capture versus issued ticket, failure/refund reconciliation, support escalation and duplicate prevention | Pending engineering and business verification |
| Public price surface | Publish only authorized production offers with itinerary, passengers, currency, mandatory taxes/fees, timestamp, expiry and availability semantics | Blocked on supplier rights/live data |
| Google application | Owner approves commercial outreach and submits verified application to the official form | Requires external partnership; not submitted |
| Approved adapter | Implement the protocol Google approves; agree rate limits, credentials, test cases, price-tag instructions and incident contacts | Requires Google acceptance/specifications |
| Certification/launch | Demonstrate deep-link, total-price, mobile, payment and ticketing consistency; obtain written go-live acceptance | Requires external approval; not launched |

**Safe work now:** build a provider-independent offer model and test-only fixtures; prepare a deep-link contract; protect private pages; document fee calculation and status transitions; write deterministic tests. Treat fixture values as test data, never public fare offers.

**Recommended offer contract (our architecture, not a claimed Google schema):** opaque offer identifier; origin/destination airport; ordered segments; departure/arrival with time zone; operating/marketing carrier; cabin/fare family; passenger mix; currency; base/taxes/mandatory fees/total; baggage and change/cancel-rule references; quote timestamp/expiry; source and display-rights flag. A signed public offer link may recover only the itinerary, not a passenger record. Store PNRs, traveler details and payment tokens exclusively behind authorization. Expired offers should re-search/reprice clearly, not silently reuse a stale fare or debit the customer.

### Legitimate alternatives, without invented approvals

1. **Existing supplier/technology partner:** ask TripJack, through an owner-approved commercial conversation, whether this specific MaxTravel contract supports Google Flights distribution or an approved intermediary. Obtain written scope, seller identity, public-cache rights, API quotas, price accuracy responsibilities and fees. This research did not establish TripJack as a Google Flights-approved gateway for MaxTravel. Supplier access is not transferable Google acceptance.
2. **Separate metasearch channel:** Skyscanner publicly offers OTA API/metasearch distribution. Evaluate only after production fulfillment and inventory rights are proven; admission, commercials and implementation remain external decisions. An affiliate arrangement sending visitors away is not the same as listing MaxTravel's fares and does not enable Google Flights. [Skyscanner OTA partnership](https://www.partners.skyscanner.net/sector/ota), [distribution product](https://www.partners.skyscanner.net/product/distribution), [affiliate product](https://www.partners.skyscanner.net/product/affiliates).
3. Reject vendors claiming guaranteed Google Flights placement merely by adding JSON-LD, a plugin, backlinks or a sitemap. Do not purchase a feed before the seller can document permissions and the actual acceptance route.

## 2. Hotels: a separate, conditional workstream

An OTA managing hotel rates, rooms and availability falls under Google's **connectivity-partner** route, not the marketing-agency guide and not a hotel's direct-owner shortcut. MaxTravel must first establish that it has an actual bookable hotel product and authorized inventory. [Hotel starter-guide categories](https://support.google.com/hotelprices/answer/11949903?hl=en).

Google reviews brand stability, transaction history and business credentials and may reject participation. The next action is an owner-approved interest application, not automatic account creation. [Connectivity eligibility](https://support.google.com/hotelprices/answer/11946933?hl=en).

The implementation needs hotel IDs and accurate property matching, room/rate-plan content, occupancy/currency/tax rules and date-preserving booking URLs. Google's guide supports ARI for nightly availability/rate/inventory data and Pull for providers fetching itinerary prices from other systems; Pull also needs live pricing. Select a method based on supplier data and Google's approved setup, not convenience. [Develop and test the integration](https://support.google.com/hotelprices/answer/11947466?hl=en), [pricing delivery modes](https://developers.google.com/hotels/hotel-prices/dev-guide/delivery-mode).

Google runs prelaunch price checks and verifies that room, rate, occupancy, currency and landing-page price agree; compliance and ongoing accuracy remain required. Relevant hotel structured data supports validation but does not replace onboarding/feed delivery. [Certification](https://support.google.com/hotelprices/answer/11946631?hl=en).

Free booking links have no Google placement/click fee, but supplier or connectivity service fees may still exist. Their ranking is separate from Hotel Ads; paid bidding does not buy higher free-link ranking. [Free booking links](https://support.google.com/hotelprices/answer/10472393?hl=en). Check the [official partner directory](https://travel.google/partners/hotels/find-a-partner/) for candidates, then verify OTA/brand/inventory support directly; directory inclusion alone does not prove a partner will distribute MaxTravel's contracted inventory. No candidate has been commissioned.

**Status:** assessment completed; inventory, account, technical certification and commercial approval pending. Keep hotel public-price feeds disabled until these gates pass. Do not promise an onboarding deadline: Google's overview and step-by-step timelines differ, and real timing depends on acceptance and readiness.

## 3. Search/AI crawler policy and agent readiness

| System | Evidence-backed control | Recommended MaxTravel posture |
|---|---|---|
| Google Search / AI Overviews / AI Mode | Indexable public content and normal Search eligibility remain foundational. Search Console now has a separate Search generative AI inclusion control. | Serve substantive public content as HTML; inspect canonical/indexability and the owner's current inclusion setting. Do not change account choices without authorization. |
| Gemini-related Google-Extended uses | Google-Extended is a separate robots product token, not a distinct HTTP crawler; it is not a Google Search ranking signal. | Make an explicit owner decision on its documented uses, separate from Googlebot. Do not promise that enabling it forces Gemini references. |
| Bing / Copilot | Bingbot accessibility, clear canonical pages, internal links and supported indexing controls matter. IndexNow can notify participating engines about genuine URL changes. | Keep high-value content accessible; optionally add owner-approved IndexNow on actual publish/update/delete, not perpetual resubmission. |
| ChatGPT search | OAI-SearchBot is for search. GPTBot is for potential model training. ChatGPT-User is user-initiated retrieval and is not the search eligibility control. | Permit OAI-SearchBot for intended public pages; decide GPTBot independently. Do not blanket-grant private URL access. |
| Perplexity | PerplexityBot surfaces search links; Perplexity-User retrieves on user request and generally ignores robots rules. | Permit legitimate public-content requests, verify published IPs and retain normal authentication and abuse controls. |

Sources: [Google AI guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [Search generative AI control](https://support.google.com/webmasters/answer/16908024), [Google crawler roles](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers), [Bing guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a), [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots), [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers).

### Security and testing

- Robots.txt is crawl guidance, not authorization or secrecy. Private bookings/passengers/payments must require authentication and record-level authorization; noindex alone cannot protect them. For public URLs that should not be indexed, let crawlers read `noindex`; do not accidentally block discovery of that directive. [Google developer SEO guide](https://developers.google.com/search/docs/fundamentals/get-started-developers), [Bing noindex guidance](https://www.bing.com/webmasters/help/block-urls-from-bing-264e560a).
- Avoid a bot-specific `Allow: /` group that unintentionally overrides private-route exclusions in the wildcard group. Either use a coherent shared group or repeat necessary restrictions and test every specific agent. [Bing robots guidance](https://www.bing.com/webmasters/help/how-to-create-a-robots-txt-file-cb7c31ec).
- A spoofed user-agent is not identity. If bot access is blocked at a WAF/CDN, use official IP verification and only narrowly scoped public-content exceptions; never disable the WAF site-wide. [Bingbot verification](https://www.bing.com/webmasters/help/Verify-Bingbot-2195837f), [Google crawler verification](https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot).
- Preserve user-friendly forms: real labels, field errors, keyboard/focus behavior, named submit buttons and explicit fare review/confirmation steps. User-facing and agent-visible prices must agree. Agents must not bypass customer consent, authentication or payment confirmation.
- `llms.txt` is optional documentation, not a ranking lever. Google explicitly says it does not use such files to improve Search visibility. Prioritize real content and verified business facts instead. No universal agent-commerce protocol is required for this SEO release; revisit a protocol only for a named authorized partner/use case. [Google AI guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

## 4. Privacy-safe analytics specification

**Current status:** account access, property IDs, consent rules, live measurement and baseline numbers have not been verified. Do not label this setup complete. Prepare instrumentation behind configuration/consent gates; activation requires the owner's property IDs and permission. Select GA4 directly or GTM, not duplicate deployments of both event pipelines.

### Proposed implementation (design, not a legal-compliance certification)

1. Use a conservative basic-consent design: optional analytics tags do not load or send before analytics consent; booking functions remain usable after rejection. Keep advertising consent off unless separately approved. A consent-mode implementation is not itself a banner or a determination of legal compliance. Owner/privacy review must establish applicable jurisdictions, notice and retention rules. Google distinguishes basic blocking from advanced cookieless measurement. [Consent-mode overview](https://developers.google.com/tag-platform/security/concepts/consent-mode).
2. Allowlist event fields. Never transmit traveler name, email, telephone, DOB, passport, PNR, ticket number, payment identifier/token, free-text search/support text or raw provider responses to analytics. Sanitize path, query, fragment, title and referrer before events; map private dynamic URLs to route templates. GA4 redaction is defense-in-depth, not a substitute for preventing sensitive data entering the data layer. [Google Analytics PII guidance](https://support.google.com/analytics/answer/6366371?hl=en), [GA4 data redaction](https://support.google.com/analytics/answer/13544947?hl=en).
3. Use a separate random analytics transaction identifier, with any mapping retained only in the secured booking system. Do not reuse PNRs. Define `value` consistently: gross booking value is not the agency's net revenue; store and label net commission/margin separately in controlled business reporting. GA4 supports purchase/refund events and transaction IDs. [GA4 ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce).
4. Emit `purchase` once only after server-verified successful payment **and confirmed ticket issuance**, from an idempotent state transition. A payment callback, thank-you URL or client event alone is insufficient. Repeated callbacks, reloads and replayed webhooks must not create duplicate purchases. Refunded/cancelled bookings need explicit adjustment and reconciliation, not deletion of history. Test locally with synthetic states first.
5. Keep UAT/test/internal traffic outside the production business dashboard; include `environment` in controlled test instrumentation. Do not count test payment success as real revenue or mark `search`/WhatsApp clicks as confirmed bookings.
6. Disable unnecessary automatic form/outbound-click capture until audited: WhatsApp links, tel links, private query strings and support form destinations can leak data. Track explicit generic actions such as `contact_click` with `channel=phone|whatsapp`, without recipient numbers/message text.

### Funnel contract

| Event | Trigger | Safe parameters | Conversion treatment |
|---|---|---|---|
| `page_view` | Consented public page view | Canonical/template path, content group | Diagnostic |
| `flight_search` | Valid submitted search | Broad route code, trip type, cabin, traveler-count bucket | Diagnostic; no raw dates/PII needed by default |
| `view_item_list` | Successful fare-results render | Result count bucket, route, currency | Diagnostic |
| `select_item` | User chooses offer | Public fare family/category, route, currency | Diagnostic |
| `begin_checkout` | Enters reviewed booking flow | Currency, amount if authorized, item category | Funnel step, not sale |
| `payment_success` | Verified payment success | Non-sensitive state only | Operational; not confirmed booking |
| `purchase` | Paid + issued, exactly once | Random analytics transaction ID, consistent value/tax/currency/items | Confirmed booking key event |
| `booking_failed` | Terminal failure | Allowlisted error category/stage only | Never a positive conversion |
| `refund` | Verified refund transition | Analytics transaction ID, currency/value/items | Revenue adjustment |
| `contact_click` | Phone/WhatsApp action | Channel, public content group | Lead interaction, not sale |

QA acceptance: denied-consent browser session sends zero optional analytics requests; no sensitive fields in any test payload; synthetic duplicate callbacks yield one purchase; payment-only/pending-ticket/refused-payment states yield zero purchases; refund totals reconcile; analytics never blocks checkout. Mark the purchase event as a key event only after QA. Verify using permitted test tools before activation, then reconcile a consent-eligible sample against the booking ledger.

### Dashboard specification and baseline

No measured values are currently available; **unknown is not zero**. Use a first complete 28-day production window after launch as baseline (and export historical data if an existing verified property has it). Keep source, date range, time zone, exclusions and missing-data notes beside every chart.

| Dashboard | Fields | Source / caveat |
|---|---|---|
| Search health | Intended canonical pages; crawled/indexed status; excluded reason; sitemap status; errors | Search Console/Bing after owner verification; submissions are not guaranteed indexing |
| Organic discovery | Clicks, impressions, CTR, query/page/device/country; branded vs non-branded rules | Search Console; account query suppression/aggregation means totals can differ |
| Public funnel | Consented landing → search → selection → checkout → issued purchase; drop-off by stage | GA4 + secured ledger reconciliation; denied consent creates measurement gaps |
| Commercial | Confirmed bookings, gross booking value, refunds, agency net revenue where available | Booking ledger is transaction source of truth; distinguish attribution from financial accounting |
| Experience | Mobile p75 LCP/INP/CLS by template; field-data availability | Target ≤2.5 s / ≤200 ms / ≤0.1; lab scores are not field results |
| Fare quality | Authorized active offers, expired offers shown, price/deep-link mismatches, failures | First-party checks after supplier authorization; no invented fares |
| AI discovery | Google generative AI impressions; Bing citations/pages; observable AI referral sessions | Separate measures; none equals total AI visibility |
| Local | Profile discovery/actions, directions, calls, website visits | Eligible verified Business Profile; a click is not a customer or booking |

As of this research date Google documents a **Generative AI performance report** with impressions for supported AI Overviews/AI Mode surfaces; it is not a universal all-AI click/revenue report. Review its actual availability and data in the owner's property. [Google report documentation](https://support.google.com/webmasters/answer/16984139). Bing's AI Performance reports citation activity across supported surfaces, not a search rank or complete AI exposure census; newer preview topic measures can be approximate. [Bing AI Performance](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/), [October 2026 Topics Portfolio beta](https://blogs.bing.com/webmaster/2026/10/introducing-topics-portfolio-beta-in-ai-performance/).

Classify observable referrals from verified hosts such as chatgpt.com and perplexity.ai without assuming missing referrers mean no AI traffic. Keep a reproducible manual prompt/query sample as qualitative evidence (date, product, geography/context, answer and source URL), never as a guaranteed universal ranking or fabricated recommendation score.

## 5. Qualitative competitor/content strategy

Search sample on 20 October 2026: `Hyderabad to Delhi flights booking`, plus targeted official OTA route pages. This is a research search, **not a controlled India/mobile Google rank audit**. No volume, difficulty, market share, backlink count, MaxTravel ranking or local-pack position is claimed. The confirmed office locality is Secunderabad; local-pack positions and demand volumes remain unmeasured.

| Observed publisher/page | Useful pattern visible in the sample | MaxTravel response |
|---|---|---|
| [Goibibo HYD–DEL](https://www.goibibo.com/flights/hyderabad-to-delhi-flights/) | Route page includes fare-family comparisons and booking steps | Explain total-price/baggage/change-rule differences clearly, only from actual authorized offers |
| [ixigo HYD–DEL](https://www.ixigo.com/cheap-flights/hyderabad-new-delhi-hyd-del?refs=flights) | Route information, fare/date presentation and linked return direction | Provide route utility and relevant internal links; do not copy its prices or marketing claims |
| [MakeMyTrip route/airline example](https://www.makemytrip.com/flights/hyderabad-new_delhi-spicejet-tickets.html) | Rendered results include timestamp, fare breakup and fare-rule sections | Use consistent content/data freshness and avoid misleading airline-route headings when inventory differs |
| [Air India Express HYD–DEL](https://www.airindiaexpress.com/en-in/book-flights/hyderabad-to-delhi-flights) | Dated fare cards include observation time and availability caveat | If authorized, expose date-specific observed offers with expiry, not timeless teaser fares |
| [IndiGo route page](https://www.goindigo.in/domestic-flights/hyderabad-to-delhi-flights.html) | Airline-owned route guide, extras and booking links | Reference authoritative airline policies while distinguishing agency support from airline responsibility |

The sampled fares were not verified through checkout and must not be copied into MaxTravel. This sample does not prove any of these publishers' integration status or ranking positions.

**Prioritization hypotheses, to validate with real demand data:**

1. Verified local office/contact/help pages and `/flight-booking-guide`: establish identity and explain how real assistance works.
2. Five substantial routes supported by the business's genuine customer demand and intended inventory; unique airport/transfer guidance, current official-source links and genuine customer questions. Do not multiply route permutations simply to enlarge the sitemap.
3. A transparent `/pricing-transparency` and `/cancellation-and-rescheduling` guide: disclose MaxTravel's actual service fees, airline-rule dependency, support hours, escalation route and what happens when payment succeeds but ticketing fails.
4. Domestic/international service hubs linking to the small route set, policies and support. Delay generic `cheap-flight-tickets` or `last-minute-flights` pages unless they add distinct evidence-backed value; never claim consistently cheapest fares.
5. Original agency expertise: anonymized, permissioned case studies; date-stamped checklists and explanations reviewed by the real support team. Avoid paid fake reviews, scraped pages, fake accreditations and purchased spam links.

Validate prioritization using owner-provided Search Console queries, aggregated enquiry/booking routes, and an authorized keyword tool export filtered to India and relevant languages. Until then mark demand/difficulty **unmeasured**. Compare usefulness, intent fit, inventory rights and support capacity rather than invented volumes.

## 6. Ninety-day roadmap with measurable acceptance criteria

Day 1 means the start of authorized implementation. Google/supplier approval time is external and not guaranteed to fit the period.

| Period | Work and dependencies | Acceptance / measurement |
|---|---|---|
| Days 1–7 | Resolve domain/app routing; protect UAT; audit private URLs; collect verified entity/office facts and access inventory | Canonical public site serves correct app over HTTPS; intended pages return 200; private data inaccessible without authorization; no test fare/payment presented as live |
| Days 8–14 | Build/QA metadata, canonical strategy, sitemap, robots controls, five useful route drafts and support/policy pages; owner verifies accounts | 100% of submitted URLs canonical/indexable/200; zero invented fares/accreditations; zero public test offers; crawl tests cover intended public/private paths |
| Days 15–30 | Activate consent-gated measurement only after permission; verify GSC/Bing; collect baseline; office content/photo verification | All analytics QA cases pass; duplicate purchase tests pass; first reporting window clearly marked partial; business facts signed off |
| Days 31–60 | Publish verified editorial content; improve mobile bottlenecks; use search/enquiry evidence to reorder pages; finish supplier rights/production checklist | Track actual indexed/intended-page ratio; zero unintended duplicate/facet URLs in sitemap; target mobile p75 CWV only when field data sufficient; each guide has owner/source/review date |
| Days 61–90 | Compare full 28-day windows; improve pages with impressions but weak intent/CTR; optimize measured abandonment; prepare metasearch submission if readiness passes | Report absolute/delta clicks, non-brand impressions, confirmed bookings, net/gross distinction and confidence/missing data; publish no promised growth percentage without baseline |
| Approval-dependent | Owner-authorized Google Flights/Hotel Center/metasearch applications, sandbox certification, live launch | Written approval + authorized inventory + end-to-end operational sign-off, not elapsed time |

Set growth targets after the first complete baseline: choose realistic incremental organic-click and confirmed-booking targets from actual traffic and available support capacity, record them as targets rather than forecasts, and review seasonality. Initial numeric targets above are **quality-control acceptance criteria**, not claims of existing performance or guaranteed rankings.

## 7. Required owner inputs and external actions

| Input/action | Why needed | Status |
|---|---|---|
| Verified legal name/registration, trading history and authorized signatory | Accurate trust content and applications | Requires business verification |
| Office address, hours, phone/WhatsApp; map identity; signage/photos | Honest local presence | Address/contact and daily 09:00–21:00 owner-confirmed; Maps identity matched; office photos/signage proof still required |
| Genuine review/profile URLs and use rights | Testimonials and `sameAs` without fabrication | Requires verification |
| Supplier production credentials through secure secret management, agreement and public/metasearch display rights | Real inventory and legal redistribution | Requires supplier approval; never place secrets in report/code/client |
| Payment live onboarding, refund and reconciliation ownership | Real commercial operation | Requires payment provider/owner approval |
| Existing GSC property access or owner-applied verification token; Bing site verification; GA4 ID; optional GTM container | Account setup and measured baseline | Pending owner access/approval; no account created |
| Consent/privacy policy, retention and analytics scope approval | Safe activation | Requires owner/privacy review |
| Existing Business Profile owner access | Local discovery and accurate profile | Existing profile found; owner access pending. Sunday closed and old .us links need deliberate review; no duplicate profile or edits |
| Google Flights/Hotel Center acceptance and engineering contacts | Partner-specific integration | Requires external partnership |

For Business Profile, confirm customers really can visit the staffed office during stated hours and that address/signage/name are real. Online-only businesses and virtual mailing addresses do not become eligible merely because a website displays an address. Check for an existing profile before any owner-authorized claim to avoid duplication. [Business eligibility](https://support.google.com/business/answer/13763036?hl=en-GB), [representation rules](https://support.google.com/business/answer/3038177?hl=en).

### Evidence and implementation boundaries

- **Completed:** read the supplied brief; verified official sources; sampled competitor content; prepared this research, gates, measurement contract and roadmap.
- **Not executed / pending authorization:** account creation/verification, permission grants, profile edits, outreach/form submission, vendor purchases, analytics activation, supplier calls, live feeds, booking/payment transactions.
- **Uncertain/unverified:** MaxTravel's partner eligibility, contracted distribution rights, production readiness, account ownership, legal registration/accreditation, baseline traffic/revenue and actual Google/AI inclusion.
- **Read failure:** `https://developers.google.com/travel/flights/otas/getting-started` returned 404. No protected access was attempted; use Google's official onboarding channel for approved specifications.
- No Google Flights or Hotel Center application has been submitted or rejected; outstanding gates are missing business evidence, account access and external acceptance.

Account changes, supplier feeds and partner applications remain pending the relevant owner authorization and external approval.
