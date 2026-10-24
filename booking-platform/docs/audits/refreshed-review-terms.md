# Refreshed review terms — 2026-10-24

## Finding and implementation
A successful refresh replaced the previous quote, announced its total, and reset consent, but did not identify changed conditions. The flight cards are search snapshots, not authoritative fresh review data.

The review response now includes a bounded customer-facing term snapshot derived only from the supplier review. Refresh retains the immediately previous quote in component memory and renders a labelled before/after disclosure independently of price changes. New selections clear the comparison. Existing traveller drafts, Back navigation, per-quote consent keys, stale-response checks and uncertain-payment guards are unchanged.

Comparable fields: hotel room, meal plan, inclusions, refundability, normalized cancellation schedule and booking notes; reviewed flight baggage/refund indicators per journey and passenger category; fixture-backed fare-rule notes. Metadata, booking IDs, expiry and supplier financial internals are excluded. Equivalent schedule timestamps and reordered inclusion lists do not create changes. Missing, malformed and ambiguous fields are unknown, never “none”. Conflicting fare aliases do not break review.

This is intentionally not an exhaustive rule-difference engine. Unsupported policy shapes and flight meal benefits are not inferred. Previous/latest supported policies remain available together, with an explicit coverage warning even when comparable details have no changes. Unsupported schemas are unavailable, not recursively exposed. Cancellation amount currency, units and basis are never invented.

## Evidence and guidance
- Existing authoritative implementation contracts: `flight-fare-details.ts`, `hotel-presentation.ts`, `supplier-flow.ts`, and provider-review fixtures (`fareRules.fareRule.miscInfo`). The normalizer consumes `tripInfos` from review, never the search selection.
- W3C WCAG 2.2 SC 3.3.4 recommends reviewing, confirming and correcting important financial submissions before finalization: https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html (accessed 2026-10-24). This motivates visible refreshed terms alongside existing fresh consent, not a claim of complete WCAG certification.
- Supplier reference https://tripjack.com/page/api-doc returned a JavaScript-only shell in this research pass. No additional flight meal or policy schemas were inferred from it.

## Verification
Fixture suite covers same-price stricter hotel terms, no semantic changes, price-only changes, unknown fields, return-flight baggage/refund changes, fare-rule notes, canonical cancellation schedules, bounds/private fields, ambiguous aliases, and rendered disclosure/status semantics.

Local browser was not run (explicitly prohibited). No live provider, payment, deployment or push actions were performed. `npm test` could not create the tsx CLI IPC socket (EPERM); the same tests run through listener-free `node --import tsx --test tests/*.test.ts`. Initial build with external node_modules symlink failed Turbopack root resolution; local dependency hardlinks resolved that build setup issue. Generated Next types are needed before standalone TypeScript checks in a fresh worktree.

Initial commit checks: 311/311 unit tests passed (including 11 new cases); ESLint passed; production Next build passed; `tsc --noEmit` passed after build; `git diff --check` passed. These are fixture/static/build results, not live-provider or browser proof.


## Independent review hardening
The independent review found three adversarial gaps in the first patch: lossy room/inclusion normalization, index-based journey identity, and the inherited recursive raw-policy renderer reused by the comparison. Fixed before integration:
- Full room/inclusion list validation; malformed or oversized values are wholly unknown, never partially equal. Text is rejected over bounds rather than silently shortened.
- Stable ordered segment airport/departure identity; duplicate or incomplete itineraries cannot be paired. Journey-array reorder does not create changes.
- Shared explicit public policy projection on the server and defensive renderer sanitization. Current and historical policies no longer recursively expose arbitrary nested data. Only fixture-backed policy text and normalized hotel cancellation fields are supported. Unknown fields, credentials, net-fare accounting, and unsupported nested alert payloads are excluded. The UI warns that complete policies may be unavailable.
- Adversarial regression tests cover malformed lists, long text, reorder/duplicate/missing itinerary identity, and synthetic nested secrets/net values in both current and refreshed rendered HTML.

Hardening checks: 314/314 unit tests passed (14 refreshed-term cases), ESLint, production build, TypeScript, and diff checks passed. Independent re-review requested against these changes; no browser or live-provider verification claimed.

## Visual acceptance refinement
After remote CI passed the refreshed-term scenarios, the real screenshot evidence still showed machine-oriented UTC timestamp strings in hotel cancellation comparisons. The canonical strings now remain comparison-only; a separate presentation value uses readable India Standard Time (IST) dates and preserves seconds/milliseconds at non-minute boundaries. Supplier amounts retain the explicit unverified-currency/unit/basis warning. Cosmetic formatting cannot create a term difference.

The comparison presents a short “Same price does not mean same terms” warning and honest missing-data coverage; the longer scope explanation sits in the existing expandable policy disclosure. All material changes and unknown values remain expanded.

Renewal now explicitly focuses the refreshed-terms heading; ordinary checkout-step navigation still focuses the review heading. New browser assertions check the focused heading and that the skip link is not focused. The prior full-page screenshot alone could not prove skip-link focus: its fixed `top:-100px` offscreen positioning can show up inside a scrolled full-page capture. The unfocused link is now clipped as well, and the existing focus style restores it; browser assertions also verify it remains focusable and visible when deliberately focused. No capture-specific DOM mutation hides the link.

No local browser was launched for this refinement. Updated CI assertions require readable IST labels, no UTC-machine strings in the visible comparison, unverified units, correct focus, and retained keyboard-accessible skip navigation on both viewports. Fresh CI/screenshots remain required for visual acceptance.

Refinement checks: 351 unit tests, ESLint, production build, fresh TypeScript and diff checks passed; 14 refreshed-term viewport cases discovered without browser launch. Unit rendering verifies readable IST, unchanged canonical equality across display-only changes, explicit monetary uncertainty, and sub-minute boundary precision.
