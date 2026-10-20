# SEO and visibility verification — 20 October 2026

Scope: local `work/seo-discoverability-2026-10-20` source and the newly built production artifact. No deployment, DNS change, external account connection, customer database, supplier call, payment, commit or push was performed by this verification task.

## Results

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Deterministic suite | **Passed: 93 tests** | `node --import tsx --test tests/*.test.ts`; includes existing booking/security tests and new content, SEO, analytics and visibility tests. |
| Full ESLint | **Passed** | `npx eslint .`, rerun after the new browser specification. |
| Full TypeScript | **Passed** | `npx tsc --noEmit`, rerun after the new browser specification. |
| Production build | **Passed** | `npm run build`; Next 16.4.0 compiled and generated routes successfully. All document and metadata routes are dynamic. |
| Actual production HTTP / SSR | **Passed: 1,935 assertions** | `npm run test:seo:http` (also verified directly with Node); starts and fetches three isolated loopback server configurations in the same process tree. |
| Browser discovery | **Passed: 66 checks** | `npm run test:browser -- --list`: 56 existing booking checks plus 10 new public-page checks across desktop/mobile. |
| Chromium execution / screenshots / mobile layout | **Not run here** | Known environment denial of Chromium's Unix-socket/runtime capability; no security-control bypass or escalation attempted. Discovery is not execution. |
| Real authenticated reporting / SQL against a database | **Not run** | No database credentials or customer data used. Boundary tests use deterministic authorization/database doubles; SQL was independently reviewed. |
| Search-engine indexing, production domain routing, field CWV, real fares | **Not established** | Local tests are not deployment, supplier acceptance, Google/Bing indexing, or real-user performance evidence. |

The ordinary `npm test` entrypoint was attempted once and blocked **before any test** because the `tsx` CLI's IPC socket `/tmp/tsx-1000/18.pipe` received `EPERM`. The supported direct Node loader above runs the same test glob without that CLI IPC server; it passed. No security setting was changed.

The final package command was executed successfully after it was added. The root `.github/workflows/booking.yml` wiring was reviewed: the HTTP harness runs after build and before Playwright in the credential-free `browser-ui` job, not the separate job that writes database fixture `.env.local`. CI configuration review is not a claim that the newly published workflow has run; the release owner must inspect its result for the actual published commit.

## Actual HTTP coverage

- **Default off:** all 18 public URLs return 200 and server-render distinct titles, descriptions and one H1; clean self-canonicals; noindex meta and `X-Robots-Tag`; robots disallows all; sitemap contains no URLs.
- **Explicit gate on:** requires production mode, exact `SEO_INDEXING_ENABLED=true`, and exact `SEO_SITE_ORIGIN=https://maxtravel.in`. Actual public meta changes to index/follow, robots allows ordinary search while denying `/api/`, and XML contains exactly the 18 public URLs with no queries/private URLs. Named training/product controls remain separately off.
- **Preview and query protection:** even with the gate enabled, actual loopback responses remain `X-Robots-Tag: noindex, nofollow`; query-token variants have a clean canonical and no token in actual meta tags. The canonical-origin positive/negative request decision is independently tested with real `NextRequest` instances. No request was sent to the production domain by this harness.
- **Wrong configured origin:** actual robots, sitemap, HTML meta and response headers fail closed.
- **Private surfaces:** `/book`, `/account`, `/my-trips`, `/travellers`, `/operations`, `/operations/visibility`, and reset-password/token requests retain noindex and private/no-store. The visibility API denies unconfigured/unauthenticated access and is not cacheable.
- **404:** unknown flight-guide slug and unknown ordinary route return actual HTTP 404, not a streamed soft 200.
- **CSP / JSON-LD:** every actual script tag, including JSON-LD, matches the response nonce; nonces differ by request; executable script policy retains strict-dynamic without unsafe-inline/eval. Serializer unit tests cover `</script>`, U+2028 and U+2029 escaping. Actual JSON-LD parses and contains no literal `<`.
- **Truthfulness:** public schema contains no invented Flight, Offer, AggregateOffer, review/rating or price. Visible copy contains no numeric advertised fare or fabricated customer/review count. Office/contact/about HTML and schema retain Secunderabad, 500003 and 09:00–21:00 Monday–Sunday.
- **Hero:** actual homepage HTML has a responsive `<img>`, `srcset`, explicit sizes and image preload; it is not lazy-loaded. This is not a measured LCP or visual-layout result.

Next serializes the root canonical as `https://maxtravel.in` rather than a trailing `/`; these are the same parsed URL. The harness compares parsed URL equality rather than treating that formatting difference as a failure.

## Independent private-reporting security review

`tests/visibility-access.test.ts` bundles the actual route, page and ledger code against narrow deterministic boundary doubles. Nine checks establish:

1. API 401/403/503 failures occur before a ledger read, with private/no-store responses.
2. Both page and API request the exact `finance:read` permission; incoming session headers are forwarded for verification.
3. Unauthorized/unavailable-auth server rendering does not mount the private dashboard component.
4. Successful API execution authorizes before its single aggregate read; query parameters cannot select a user or permission. The endpoint exports no mutation handler.
5. Ledger output preserves large integer amounts as exact strings and contains no customer/booking-level records.

Source review confirmed the existing `administrator` gate uses a verified active principal, requires administrator MFA and an active matching permission grant. Authorization necessarily uses its own identity/account database checks; “before database access” here means before the reporting/booking aggregate is read, not before authentication's own storage lookup.

The confirmed-booking aggregate requires a base order (no service kind/parent), FLIGHT/TICKETED or HOTEL/CONFIRMED, server `booking.confirmed` evidence, and captured payment with matching amount/currency. `EXISTS` avoids multiplying totals on repeated event/payment rows. Database schema constrains these currencies to INR. Captured payments and completed refunds are separate panels with different scopes; neither is labelled production revenue or organic sales. Unknown baselines remain null.

The analytics foundation has no transport, browser IDs, storage or external script. Consent defaults denied; fields and public paths are strictly allowlisted. Purchase eligibility cannot be generated from a view, browser payment callback or capture alone. The future authoritative, consent-linked, idempotent server relay is explicitly **not implemented or activated**.

## Changes owned by verification

- `tests/seo.test.ts`: gate, canonical, registry, crawler, nonce, escaping, office and airport/CTA contracts.
- `tests/visibility-access.test.ts`: independent real-module security boundaries and aggregate mapping.
- `scripts/verify-seo-http.mjs`: reusable credential-free production SSR harness. It refuses to run if local `.env`/production env files exist, rather than loading secrets or altering them.
- `tests/browser/search.spec.ts`: only the obsolete homepage H1 expectation changed to an exact match for the newly approved heading; no booking assertions removed or relaxed.
- This report. Public-page browser tests and the other content/analytics tests were added by their respective owners.

## Remaining acceptance gates

Run all 66 browser checks and inspect real desktop/mobile artifacts in an explicitly permitted environment. Confirm actual deployment host/HTTPS/canonical redirects and source version before any indexing activation. Keep the indexing switch off while this is UAT. Real database aggregate acceptance, provider/payment acceptance, analytics accounts/consent/relay, image licensing, and field performance require their separate authorized checks; this report does not claim them complete.
