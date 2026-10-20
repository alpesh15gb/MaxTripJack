# Booking experience verification — 20 October 2026

This work improves the existing TripJack flight/hotel application. It does not certify TripJack/Razorpay production access, issue tickets, charge customers, or deploy the application.

## Baseline observed

- Website production build, ESLint and all 26 existing unit tests passed before changes.
- The existing website separates its marketing search from the working booking form; homepage hotel party selection was not preserved.
- Native account-bound state and asynchronous search/review results required isolation.
- Payment-order crash recovery and passenger identity validation require deterministic regression coverage, not happy-path screenshots alone.

## Acceptance matrix

| Journey | Required evidence |
| --- | --- |
| Home to flight results | One explicit search, airports/dates/party preserved; same-day return supported; invalid dates/route rejected |
| Flight comparison | Clear full-party estimate, baggage and fare-family terms; per-leg selection; combined returns not counted as a long layover |
| Hotel search | Adults and child ages preserved per room; full-stay/all-room total; room/meal/cancellation terms distinguishable |
| Review | Authoritative provider review, visible expiry, no silent acceptance of changed price or rules |
| Traveller entry | Required identity fields follow reviewed conditions; no passport/PAN/contact drafts in persistent browser storage |
| Payment | Existing quote-bound order reused; dismissal and unknown outcomes do not create duplicate payment attempts or claim confirmation |
| Confirmation | Supplier status, not browser payment success alone, determines ticket/hotel confirmation |
| My trips | Itinerary first, record-local details, pending states updated after pagination, recoverable errors |
| Native identity | Sign-out/account change removes previous trips, travellers, contact details and quote; late responses cannot restore them |
| Interrupted supplier calls | Uncertain side effects reconciled through existing IDs, never blindly resubmitted |
| Accessibility | Keyboard use, named controls, responsive layout, focus/error context and readable contrast |

## Verification boundaries

The local cloud runtime permits application build/unit checks but denied PostgreSQL Unix-socket startup. Database/provider fixture checks must run in the isolated GitHub Actions service environment; local success is not claimed for those checks. Browser evidence uses synthetic intercepted provider responses, not actual supplier inventory or real travellers.

Actual TripJack UAT, Razorpay test checkout/webhook delivery, physical Android/iOS devices, concurrent customer use, backup restoration, production secrets/domain and deployment acceptance remain separate release requirements. Existing supplier safety constraints and authorization checks must remain intact during the visual refresh.

## Local verification checkpoint

- Web: 59 deterministic tests passed using `node --import tsx --test tests/*.test.ts`; full ESLint passed. Final production build and worker bundles also passed.
- Native: 40 offline state/recovery tests, TypeScript and Expo lint passed. Android and iOS Hermes exports passed; these are bundles, not signed releases or device-interaction acceptance.
- Browser: 52 cases across 1440px desktop and 390px mobile are authored and discover successfully. They have **not executed** in this runtime; screenshots have **not been produced**. GitHub Actions adds an isolated synthetic browser job without replacing existing database/provider checks.
- Production dependency audit at this checkpoint reported zero vulnerabilities. This is not a security certification.
- Independent source review checked payment no-downgrade locking, per-phase Fare Validate crash handling, native identity/restart guards and fail-closed unknown status handling. It does not replace database/browser/device execution.

## Important recovery and rollout limits

Web recovery stores only opaque quote/booking references in sessionStorage and covers same-tab reload/navigation, not guaranteed browser closure, a new tab, another device or cleared storage. An unresolved marker remains locked on 401/404; switching accounts in that tab requires returning to the original account to resolve its payment. No private traveller fields are persisted. Native restart recovery stores only an account-scoped opaque quote ID in existing SecureStore; actual native storage/device restart remains an acceptance item.

Migration `015-fare-validation` intentionally invalidates historical initial-flight review quotes. Follow [the safety rollout instructions](BOOKING-SAFETY-2026-10-20.md): reconcile existing payment operations and paid/unattempted bookings instead of collecting another payment. Do not enable this code against an unmigrated database.

Publication and CI results remain pending user approval. Do not describe this checkpoint as merged, deployed, provider-certified or end-to-end browser verified.
