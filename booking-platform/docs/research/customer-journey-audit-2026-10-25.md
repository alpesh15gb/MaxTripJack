# Customer journey audit — 25 October 2026

## Scope and evidence boundary

Base: accepted `40b4988136c9708ca29a7f9340af52c53da37cc1`, tree `197826e00a7b1b092035c3352912de86a3a6d081`.

Source-reviewed the customer path from search through after-sales and account recovery. Implemented focused recovery/privacy defects rather than replacing already-tested booking machinery. This is **not evidence of a live supplier booking, real payment, delivered email, or executed browser journey**. Browser cases are authored for the normal CI fixture lane. No deployment, credentials, real provider submits, or emails were attempted.

## Customer-first decisions

| Stage | Source evidence and customer experience | Decision |
| --- | --- | --- |
| Landing → search | `home-search.tsx`, `booking-search-state.ts`, `live-booking.tsx`: allowlisted criteria links, native validity, explicit activity and Stop search; no private traveller values in URLs. | Preserve. Avoid duplicate SEO/discovery changes. |
| Search → results | `live-booking.tsx`, `booking-flight-card.tsx`, `hotel-results.tsx`: estimated party totals, flight refinements, group selection and explicit review; hotel enrichment separate from live rates. | Preserve existing loading and stale-generation machinery. |
| Fare/room selection | `hotel-room-view.tsx`, `booking-handoff.ts`, `account-return.ts`: room options before review, same-tab selection recovery, owner/expiry checks, safe return URL, current quote required. | Preserve mandatory account verification and review; never equate sign-in with reservation. |
| Traveller/guest entry | `guest-form.ts`, `guest-validation-rules.ts`, `live-booking.tsx`: errors map to named fields, hidden required sections open, all native constraints retained, optional documents separate; private draft kept only within mounted account workspace. | Preserve. Do not persist passenger documents or contact details for convenience. |
| Changed terms | `refreshed-terms.tsx`, `review-term-changes.ts`, `live-booking.tsx`: before/after changes, fresh consent keyed to quote and total, expiry guard and explicit refreshed-price action. | Preserve and retain existing test fixtures; no cosmetic churn. |
| Payment pending/uncertain | `use-checkout-recovery.ts`, `checkout-recovery.ts`, `live-booking.tsx`: marker before payment create, reconcile by quote/booking, resume same provider order only, no new payment while uncertain. | Preserve; payment credentials/UAT and live submission remain unverified. |
| Confirmation/My trips | `booking-workspace.tsx`: payment, supplier and ticket states separated; private inline confirmation; pending older pages refresh. Found lost-access polling retained previously loaded private records and first-page async completion lacked an explicit post-await stale guard. | **Fixed:** 401/403 on initial, pagination or polling removes retained records and actions, stops pending polls and gives a safe sign-in return. Ignore stale aborted completions. Transient non-access errors still retain data with honest last-loaded wording. |
| Cancellation/refund | `cancellation-request.tsx`, `cancellation-progress.tsx`, `trip-organiser.ts`: cancellation and refund stages separate; confirmed/ticketed eligibility checked; refunds not promised merely from cancellation. | Preserve backend invariants. Separate operations/document owner handles reporting terminology. |
| Account/signup | `account-panel.tsx`, auth route: signup blocked without mail, but SDK error shape could leave a technical/blank message. Email entry was discarded when choosing verification; password could be reused across modes. | **Fixed:** understandable blocked-signup explanation; preserve email between modes in memory, remount the form to clear password; synchronous submit guard and unmount guard prevent duplicate submit and late sign-in navigation. |
| Verification/reset-email | Auth route originally checked SMTP only for signup. Known accounts could attempt unavailable mail while unknown accounts returned generic success. | **Fixed:** uniform pre-lookup 503 during missing-mail configuration for reset and resend too, including trailing-slash paths. Does not disclose whether the address exists and never bypasses verification. Runtime SMTP health is still a release dependency. |
| Reset link | `reset-password-panel.tsx`: network loss was treated as ordinary retry even though the password write could have committed. Invalid-link recovery opened ordinary sign-in rather than recovery. | **Fixed:** bound waiting to 15 seconds, classify explicit 4xx vs unknown failures, no blind retry after unknown result, retain typed password only in current form, offer sign-in/fresh-link next steps, retire token from current history before submitting (protecting reload/Back during a pending write too), guard late completion/unmount and key component by token. Invalid link now leads straight to reset form with safe return context. |

## Official reference research

Retrieved 25 October 2026. These are reference patterns, **not evidence that Max Travel supports every competitor feature**.

- [KAYAK account management and Trips](https://www.kayak.com/c/help/account-trips/) describes verification-based account access and a central place for trip information. Application here: keep account verification explicit and preserve a customer's safe journey destination, without introducing unsupported passkeys or automatic account creation.
- [Ryanair: pending booking payment](https://help.ryanair.com/hc/en-lv/articles/12888974537873-Why-is-my-payment-for-my-booking-pending) distinguishes pending payment from confirmation. Application here: preserve clear pending states; do not transplant Ryanair's timing promise into an unrelated payment provider.
- [Omio: charged but no tickets](https://help.omio.com/hc/en-us/articles/203726731-I-was-charged-but-haven-t-received-my-tickets-what-should-I-do) directs customers to verify payment, inspect booking/email context and contact support when unresolved. Application here: make recovery actionable without claiming a ticket exists or sending another payment.

## Added verification

- `account-action.test.ts`: explicit rejection versus unknown outcomes, deadline expiry, late success cannot change settled unknown outcome.
- `account-mail-gate.test.ts`: real auth route bundled with infrastructure mocks; known/unknown addresses and trailing slashes receive the same outage response before account lookup; existing reset/verification token consumption remains delegated and is not SMTP-gated.
- `browser/customer-recovery.spec.ts`: lost/late reset response, synchronous repeated submit, token retirement + reload, leaving pending reset/sign-in, expired-link recovery, SMTP-blocked signup, email preservation/password clearing, 401/403 during polling/pagination, restored access after reload. Existing fixture records page errors and runs desktop/mobile projects; screenshots requested for meaningful states.

## Verification and release limits

Local lint, Node unit tests and isolated app production build are the applicable performed checks (see handoff for final exact counts/hash). `npm test`'s tsx CLI attempted an unavailable sandbox IPC socket; the identical test files were run with Node's supported `--import tsx --test` runner, without a listener. Fresh-checkout standalone `tsc` initially lacked generated Next `LayoutProps`; production build generates those types.

Browser fixtures are **authored, not locally executed**: local browser launch was prohibited. CI must establish rendered mobile/keyboard/hydration behaviour, screenshots and late-network assertions against the final commit. Test mocks perform no real booking/payment/email action.

SMTP configuration/delivery, live/UAT PayGlocal credentials, supplier integration, payment reconciliation against a real gateway, and production deployment remain separate blocked/unverified release items. No fake completion, guessed refund SLA or unsupported live-booking claim was added.

## Independent review follow-up: identity boundaries

Review found that removing trip cards alone did not clear a booking-reference search, pagination/filter state or secondary errors; settled bookings also had no identity subscription. Confirmation-detail authorization failures were only local inline errors, and MFA enrollment secrets were owned by the longer-lived account page.

The follow-up binds the private trip workspace and signed-in account-security subtree to Better Auth's settled user ID, non-secret session ID and verification state. The installed supported `useSession` hook already responds to cross-tab storage notifications and visibility changes; no new polling or private auth-atom manipulation was added. A settled identity/access change unmounts the old subtree, aborts its reads and clears all derived local state. Confirmation-detail 401/403 now invokes the same full private-workspace reset. Local abort checks after both response and JSON parsing fence late details; other list completions also check the access-loss latch.

401, 403 and transient network failures have separate truthful explanations. During an account refresh, private controls are hidden and inert. A transient account-session error retains the same account-security subtree hidden/inert so an existing unknown password-change or session-revocation lock cannot disappear merely because the session check failed. A confirmed sign-out/access denial or changed identity/session removes that subtree and its MFA URI, backup codes, inputs and device state. The trip subtree also remains hidden/inert on transient session errors, preserving cancellation request keys and unknown-outcome locks; its status polls pause. Only confirmed access loss or identity change destroys that subtree.

New fixture cases exercise an actual same-origin second tab posting the installed session notification format, with the second tab's entire document mocked and no application API requests. Cases cover settled A→B trip transitions, cleared search/filters, late prior-account confirmation, 401/403 detail access loss, signed-out vs network-error states, MFA secrets and delayed enrollment across identities, and preservation of the same-account unknown-write lock after a transient session error. These remain authored browser tests pending authorized CI execution.
