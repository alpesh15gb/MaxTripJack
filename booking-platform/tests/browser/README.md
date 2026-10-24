# Booking UI regression checks

These Playwright tests exercise the **real Next.js production UI** at 1440 px
desktop and 390 px mobile widths. The fixtures intercept every browser `/api/`
request and substitute the Razorpay script. They do not use supplier credentials,
a database, payment credentials, live inventory, or real booking/payment actions.
Unknown API calls fail the test instead of reaching the backend. All external
requests fail closed; the app's editorial photos and fonts are served locally.

This is a UI contract suite, **not** proof that TripJack or Razorpay works. Keep
the existing unit, integration, provider, checkout, refund, cancellation and
production-security checks; this suite does not replace or relax them.

## Covered flows

- Homepage airport normalization and adult occupancy, one auto-search per
  navigation, local route validation, sign-in errors and explicit search retry.
- Hotel destination selection, per-room adults/child ages, room review guest
  grouping, and no-flight/no-stay/no-room states.
- Fare comparison, ordered outbound/return selection, unknown local-time
  duration and complete-journey (COMBO) treatment.
- Optional versus supplier-required documents, stale-price refresh retaining
  traveller fields, explicit reviewed-total acceptance, and friendly required
  details rather than raw supplier flags disguised as cancellation terms.
- Refreshed terms at the same price: before/after flight baggage/refund and hotel
  room/meal/cancellation changes, stable reordered journeys, unknown malformed
  fields, retained traveller drafts, fresh consent, Back/change selection and
  unchanged uncertain-payment/same-order-resume safeguards. Dedicated coverage:
  `refreshed-terms.spec.ts` (7 scenarios on both configured viewports).
- Payment dismissal, same-order resume with a fresh server status check,
  captured/expired-order lockout, 409/503 uncertainty and pending My trips.
- Interrupted/reloaded checkout recovery, no-order-yet and inaccessible-401/404 lockout,
  and opaque identifier-only session storage with no traveller/contact data.
- Synthetic session identity changes clear private in-memory drafts without
  losing the unresolved-payment marker or contacting a real authentication service.
- Populated My trips itinerary and guest counts, per-record inline confirmations,
  truthful pending/failed states, and automatic refresh across older loaded pages.
- Narrow-screen result controls keep their selected values readable, alongside
  the existing full-page horizontal-overflow checks.

## Run on a machine allowed to launch Chromium

```sh
npm ci
npx playwright install --with-deps chromium
npm run build
npm run test:browser
npm run test:browser:report
```

The config starts an isolated production server on `127.0.0.1:3100` and refuses
to reuse an unrelated server. `npm run test:browser -- --list` checks discovery
without launching a browser. Do not disable host/browser security controls if
the execution environment denies Chromium launch; run in the permitted CI job
or another explicitly authorized environment instead.

## Evidence

Successful surface checkpoints attach full-page product screenshots, labelled
with viewport and **synthetic provider data**, plus the intercepted request log.
Failures additionally retain a trace, screenshot and video. The `browser-ui` CI
job uploads `playwright-report/` and `test-results/` even when a test fails.
No screenshot is fabricated when a browser cannot run. CI artifacts exist only
after an actual workflow run; adding this workflow does not publish or run it.

Screenshots are review evidence rather than pixel-perfect baseline approvals.
The assertions verify behavior, request payloads, safety states and horizontal
overflow; a human should inspect the actual screenshot artifacts before visual
sign-off. All traveller names and details in evidence are synthetic.

## Refreshed-terms acceptance evidence

`refreshed-terms.spec.ts` drives the production booking page using the shared
fail-closed API/SDK interceptor. Its synthetic raw supplier values pass through
the production public-policy/term projection in the test runner; independent UI
assertions check the expected values rather than rendering a separate demo.
It attaches before/after, unknown-coverage, fresh-consent, uncertainty and
same-order-recovery screenshots on desktop and mobile. The normal `browser-ui`
job discovers these tests and preserves their screenshots and intercepted API logs.

Authoring checks do **not** constitute browser acceptance: no local browser was
launched for this addition. CI must actually run all 14 viewport cases and produce
artifacts before visual review or main-promotion approval.
