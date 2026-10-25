# Discovery and trust: evidence-led improvement, 25 October 2026

## Result first

The accepted baseline already had 18 authored public pages, useful airport-pair guides, real office details, payment-versus-confirmation explanations, strict private-page noindex, and owner-gated indexing. It did **not** need hundreds of generated destinations, fake reviews, fabricated fare offers, or an AI SEO file. The concrete improvement is a connected, regression-tested discovery graph built from exactly the existing visible editorial facts. It does not enable indexing or live bookings.

Base examined: `40b4988136c9708ca29a7f9340af52c53da37cc1`, tree `197826e00a7b1b092035c3352912de86a3a6d081`.

## Evidence standard

- **Documentation** means official product/help/search documentation retrieved as text. It establishes the documented behavior, not a successful interactive test.
- **Public page text** means text extracted by the web research tool from the named public page. It establishes those words/links appeared in the extraction, not layout, working interaction, availability or conversion performance.
- **Browser observation:** none in this research. No competitor booking, login, payment, checkout, device comparison, screenshots or authenticated flow was exercised. Local browser launch is explicitly out of scope.
- Retrieval occurred across 24–25 October 2026 UTC. Search snippets were not treated as independent product validation. Competitor claims remain their claims, not verified business facts and not claims MaxTravel may copy.

## Official discovery guidance → decisions

| Primary source | Evidence and interpretation | Code decision |
|---|---|---|
| [Google site names](https://developers.google.com/search/docs/appearance/site-names) | Documentation: homepage WebSite markup can communicate a preferred site name; crawlability matters. Appearance is not guaranteed. | Add `WebSite` using existing MaxTravel name and canonical origin, with stable `#website` ID. Keep UAT noindex. |
| [Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) | Documentation: markup must represent visible content and avoid misleading claims. | Same title/description/review date and official source links feed rendering and graph. Test parity. No Offer, Review, AggregateRating, price or invented SearchAction. |
| [Google AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) | Documentation: crawlable useful content remains foundational; no special schema is required for generative search. | Improve existing entity clarity, not a promised ranking mechanism. No speculative llms.txt, keyword blocks or generated thin pages. |
| [Google robots metadata](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) | Documentation: page-level indexing directives and HTTP headers control eligibility. | Preserve default-off metadata plus request-origin/query/private-path X-Robots-Tag guard. |
| [Bing removal guidance](https://www.bing.com/webmasters/help/?topicid=37c07477) and [robots guidance](https://www.bing.com/webmasters/help/?topicid=cb7c31ec) | Documentation: crawlers need access to see noindex; bot-specific groups can supersede wildcard groups. | Retain existing approved-launch rule allowing private HTML to be crawled for noindex while authentication protects it; keep API crawl exclusion and no bot-specific search bypass. UAT remains disallow-all plus noindex. |
| [Bing sitemaps and AI discovery](https://blogs.bing.com/webmaster/2025/7/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search/) | Documentation: sitemaps aid discovery; they do not guarantee inclusion in search/AI answers. | Preserve reviewed 18-page allowlist, honest modification dates and empty UAT sitemap. No submission, IndexNow or third-party publishing. |
| [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots) | Documentation: OAI-SearchBot and GPTBot have distinct search/training controls. | Preserve existing separation; no new opt-in or launch override. Search crawler allowance does not constitute ranking or citation proof. |

## Ten-competitor public-pattern matrix

| Competitor / primary source | Evidence level and observation | MaxTravel inference / disposition |
|---|---|---|
| [Google Flights](https://www.google.com/travel/flights), [tracking help](https://support.google.com/travel/answer/6235879?hl=en) | Homepage extraction redirected to unsupported-browser notice. Official help documents route/date or individual-flight tracking and configurable alerts. No interactive test. | Revisit functionality requires trustworthy persisted route criteria and delivery capability. Do not advertise alerts while provider/email readiness is incomplete. Existing editorial routes are useful planning, not saved inventory. |
| [Skyscanner](https://www.skyscanner.net), [alert help](https://help.skyscanner.net/hc/en-us/articles/115002499829-How-do-I-set-up-or-cancel-email-price-alerts), [price mismatch help](https://help.skyscanner.net/hc/en-us/articles/202502972-Why-was-the-price-different-on-Skyscanner-to-the-one-I-was-sent-in-my-price-alert) | Homepage returned no extractable lines. Official help documents account-based alerts and warns emailed prices are snapshots, not reserved availability. | Preserve revalidation and no hard-coded public price promises. Alert feature deferred, not imitated with fake timers or notifications. |
| [Booking.com](https://www.booking.com), [How we work](https://www.booking.com/content/how_we_work.html) | Homepage had JS anti-bot gate. Public explanatory page was readable: distinct sections for service operation, recommendations, reviews, pricing, payments and help. | Explain stages and responsibility. Existing pricing/support guides already do this without copying Booking.com's contracts or legal identity. Graph connects those explanations to the visible MaxTravel publisher. |
| [Expedia](https://www.expedia.com) | Public page text: product choices, dates/travellers inputs, Support and Trips links, destination links, qualified bundle savings language. | Support and trip retrieval belong near shopping, with conditions next to claims. Existing guides and support links retained; no unproven savings banner added. |
| [Agoda](https://www.agoda.com), [About Agoda](https://www.agoda.com/about-agoda/) | Homepage exposed only input placeholders. Public about page explicitly explains business, services and support coverage. Its numerical inventory statements differ within the same extraction; not imported or independently verified. | Use only owner-confirmed MaxTravel business/contact data. No scale numbers, accreditation, ownership or round-the-clock coverage fabricated. |
| [MakeMyTrip](https://www.makemytrip.com) | Public page text: My Trips, account entry, product navigation, route and hotel destination links, company/legal links. | A curated discovery hierarchy plus a private trip-management boundary is preferable to indexing customer itineraries. Preserve exact editorial allowlist. |
| [Cleartrip](https://www.cleartrip.com) | Public text: route inputs, trip type, travellers/cabin, Support and My Trips, special-fare eligibility conditions. | Qualification must accompany promotional claims. Existing airport guides should stay planning references; no supplier eligibility inferred from route existence. |
| [ixigo](https://www.ixigo.com) | Public text: optional special fares, route links, Customer Service, flight tracker/fare-alert links, promotional refund language. | Useful routes/support can be adopted as patterns; advertised instant refunds/24x7 coverage cannot be copied into MaxTravel facts. Preserve current conditional refund explanation. |
| [KAYAK](https://www.kayak.com) | Public text: Flights/Stays/Cars navigation, Trips, Explore, flight tracker, travel tips and planning links. | Separate research/planning from transactions. Do not add machine-readable booking/search actions unless an actual supported public endpoint exists. |
| [Trip.com](https://www.trip.com) | Public text: Customer support, Find bookings, destination links and travel-guide links. | Planning content should have sources and a path back to human help, not masquerade as live bookable inventory. Add exact visible official-reference citations to route WebPage markup. |

These are design inferences, not a claim that any competitor pattern increases conversion or that all competitor products were tested.

## Concrete gap → implementation → regression evidence

1. `HomePublicIntro` previously emitted only a business entity. `homeDiscoveryGraph` now adds the real WebSite identity without a fictional search endpoint.
2. Most public pages and all route guides emitted a WebPage publisher reference without defining that publisher in the same document. `editorialDiscoveryGraph` now resolves publisher, website and breadcrumb identities locally. Full business details remain limited to pages already choosing the full profile; other pages use only name/contact data visible in their office card.
3. Schema builders lived inside a React component and were not directly tested. They now live in `src/lib/discovery-graph.ts`, a pure module. It rejects private paths, query-bearing paths, unknown authored routes, invalid breadcrumb trails and unsafe source URLs.
4. Route guides showed official references, but their discovery graph did not connect those references to the page. Optional citation markup now comes from the exact same source objects as the visible links. This is provenance, not endorsement or evidence of partnership.
5. HTTP checks previously validated broad schema prohibitions but not graph resolution or source/date parity. `scripts/verify-seo-http.mjs` now checks unique identities, resolved references, matching canonical/description, visible review date, breadcrumb labels and source links. Existing CI already invokes this script after production build.
6. `tests/discovery-graph.test.ts` exercises all 17 editorial pages plus home, graph identity, metadata equality, source equality, prohibited claims and invalid input. Existing SEO tests continue checking sitemap, noindex, canonical, CSP and owner-confirmed facts.

7. Actual HTTP checks found the custom support page bypassed the shared editorial renderer. Its schema now uses the same connected graph and existing metadata/breadcrumb labels, without inventing a review date or marking up an address not shown in that contact card. A regression test covers this exception.

No UI layout, checkout, onboarding, sitemap allowlist, launch configuration, policy text, review date, business fact, security configuration or deployment changed. No claim of ranking improvement or AI-answer appearance is made.

## Launch and measurement boundaries

Morning launch decision still requires actual provider, payment, notification and operational readiness, not just technical SEO. Keep `SEO_INDEXING_ENABLED` off until explicit approval; independently confirm the real hostname and private/account/CRM noindex headers. After authorized launch, inspect actual crawl/indexing and field performance in owner-controlled tools. Search/AI answer visibility is an outcome to measure, not a guarantee. No analytics credentials, webmaster submissions, external publishing, live transactions or new accounts were created.

The owner-confirmed office hours still conflict with the previously observed Maps Sunday hours; this change does not silently resolve that discrepancy or claim independent legal verification. No new business facts were generated.

## Verification on final local sources

- `node --import tsx --test tests/*.test.ts`: **362 passed, 0 failed/skipped**. Same selected unit files as npm test. Exact npm test's tsx CLI was blocked by sandbox IPC `EPERM` on `/tmp/tsx-1000/21.pipe`. One normal escalation attempt failed before execution with `bwrap: Can't create file at /home/agent/.codex/sessions: Read-only file system`; no denied-path read, modification or workaround was attempted. The parent approved the socket-free Node test runner within the ordinary sandbox.
- `npm run lint`: passed.
- `node_modules/.bin/tsc --noEmit`: passed, full strict configuration unchanged. Initial new-test tuple inference errors were fixed, not excluded.
- `npm run build`: passed, normal Turbopack production build including TypeScript.
- `npm run test:seo:http`: **3,584 HTTP/HTML assertions passed** across 18 public pages, seven private paths, missing pages, UAT, synthetic approved-launch configuration and wrong-origin configuration. Tests launch only credential-free loopback servers and do not enable indexing on any deployed site.
- Separate package-only copy `/tmp/booking-discovery-isolated` (no sibling mobile app or repository-root sources): `npm run build`, `npm run build:workers`, and the same **3,584 HTTP/HTML assertions** all passed. Dependencies were copied from the existing installed tree; this is not a fresh dependency-install or container-runtime proof.
- `git diff --check` and Node syntax check for the HTTP verifier: passed.
- No browser test was launched. No new screenshot, visual, Core Web Vitals, authenticated booking, provider or payment claim is made.
- Docker CLI is absent locally. The existing CI production Docker-context/non-root runtime gate was preserved unchanged and must be checked for the integrated commit by the parent. No CI/push/deployment is claimed by this local handoff.
