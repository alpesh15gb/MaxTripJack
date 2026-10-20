# MaxTravel search-discovery implementation and release checklist

This package adds a public editorial and office-identity layer to the existing booking platform. It does not turn the current TripJack/Razorpay UAT integration into a live commercial service, submit a Google partnership application, or change DNS.

## Deliverables and status

| Requested deliverable | Delivered / remaining boundary |
| --- | --- |
| Current technical audit and priorities | [Domain audit](domain-audit-2026-10-20.md) and [code audit](code-audit-2026-10-20.md). The public `.in` domain serves Hostinger parking, blocks crawlers and returns HTML for sitemap/unknown paths. Hosting target and cutover remain required. |
| Implemented technical SEO | Server-rendered content, page metadata, clean canonicals, noindex workflow/private pages, request-origin/query guards, nonce-safe JSON-LD, generated robots and XML sitemap. Indexing is OFF by default. |
| URL architecture | Eighteen authored public URLs in `src/lib/seo-registry.ts`; authenticated booking/account/operations/API records are excluded. Unknown guides return 404. Content edits must update the authored modification date; dates are not fabricated on each request. |
| Five real route pages | Hyderabad–Delhi, Delhi–Mumbai, Hyderabad–Dubai, Mumbai–Goa and Delhi–Bengaluru. [Official source ledger](route-source-ledger.md). Airport distinctions, transfer guidance and current policy links—not invented flights, fares or availability. |
| Business identity/schema | Owner-confirmed Secunderabad address, telephone/WhatsApp, email and daily 09:00–21:00 hours; matched existing Maps profile. TravelAgency/Organization, WebPage and BreadcrumbList reflect visible content. No ratings, accreditation or fabricated office photos. |
| Google Flights / hotels | [Partnership and integration assessment](search-partnerships-and-roadmap.md). Production acceptance, supplier distribution rights, commercial approval and approved integration specifications remain required. Structured data does not enroll an OTA. |
| GBP / offline trust checklist | Use the existing profile, not a duplicate. Owner access is pending. Correct Sunday hours only with that access; review `.us` website/booking links only after `.in` works. Obtain real office/signage photos and any registration/accreditation evidence. |
| Ninety-day roadmap | [Evidence-backed roadmap](search-partnerships-and-roadmap.md), with baseline and acceptance gates, not guaranteed rankings or traffic. Keyword demand/difficulty remain unmeasured without authorized account/tool data. |
| Tracking and reporting | Private `/operations/visibility` dashboard; authorized UAT booking/payment/refund aggregates, explicit unknown search/organic/AI metrics, and strict consent-denied analytics schema. [Exact analytics scope](analytics-and-visibility.md). No GA4 tags, visitor tracking, outbound sink or purchase relay is activated; account setup and additional approved wiring remain pending. |
| Validation | Deterministic tests, full lint/type/build, plus real HTTP SSR/robots/sitemap/CSP checks. Browser specs preserve prior booking coverage and add public-content cases. Run the commands below and consult the exact commit's GitHub checks. No production CWV or live search-index inclusion is claimed. |
| External access and approvals | Hosting/domain owner target; GSC/Bing verification; GA4 property; GBP owner access; privacy/consent policy; supplier production/public-price rights; Google Flights/Hotel Center partner acceptance. No credentials belong in code or chat. |

## Principal implementation files

- `src/lib/seo.ts`, `seo-registry.ts`; `src/app/robots.ts`, `sitemap.ts`; `src/proxy.ts` and private route layouts.
- `src/components/seo-json-ld.tsx`, `public-content.tsx`; `src/lib/business-profile.ts`, `public-pages.ts`, `flight-guides.ts`; `src/app/(public)/`.
- `src/app/page.tsx` is a server metadata wrapper; `src/components/home-search.tsx` preserves the booking search form and uses responsive/preloaded local hero imagery.
- `src/lib/analytics.ts`, `visibility-readiness.ts`, `visibility-ledger.ts`; private visibility page/API and dashboard component.
- `tests/seo.test.ts`, public-content, analytics, visibility tests; `scripts/verify-seo-http.mjs`; public browser specifications.

## Safe activation order

1. Confirm the intended app host and approved release. Back up the database and encrypted-field keys; apply required migrations with app/workers coordinated. The prior booking release's migration 015 intentionally invalidates historical flight quotes; reconcile affected payments first.
2. Validate actual TripJack/payment UAT and production approvals. Retain the test banner and indexing OFF while the service is still UAT. Never advertise test fares.
3. Configure apex HTTPS and deliberate www/HTTP permanent redirects to `https://maxtravel.in`; verify the real origin certificate, 200 public pages and real 404s. Do not copy the parking A record as an app destination.
4. Review business content and policies, phone/WhatsApp reachability, Maps directions, and accessibility on actual devices. Only use genuine authorized reviews/photos.
5. After explicit approval of the public production site, configure `SEO_SITE_ORIGIN=https://maxtravel.in` and `SEO_INDEXING_ENABLED=true` and restart. Verify raw meta/X-Robots headers under the real TLS origin, robots and the exact sitemap. Preview hosts and parameterized URLs must remain noindex. Keep private data authenticated.
6. Verify existing GSC/Bing properties and submit the sitemap. Enable consented measurement only after account/consent/durable conversion requirements are implemented and tested. A payment alone is not a confirmed booking conversion.
7. Use owner access to update the existing GBP Sunday hours and, only after successful cutover, its intended website/booking links. Preserve correct `.us` email; domain migration is a separate deliberate decision.
8. Monitor real data before declaring growth. LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 are targets, not measured achievements in this implementation. Capture field data once the site has traffic; label laboratory samples separately.

`SEO_AI_TRAINING_ENABLED` controls the named GPTBot/Google-Extended rules only; it is not a universal training ban or a recommendation guarantee. Google-Extended also affects certain Gemini grounding/training uses, separately from Google Search AI features. Review that trade-off before changing it.

## Reproducible checks

```sh
node --import tsx --test tests/*.test.ts
npm run lint
npx tsc --noEmit
npm run build
npm run build:workers
npm run test:seo:http
npm run test:browser
```

The HTTP harness refuses local `.env` files and starts credential-free servers. The CI browser job is the correct location for it; the database/provider job has isolated fixture configuration and retains its separate integration tests. No production configuration, profile, account or supplier transaction is changed by these checks.
