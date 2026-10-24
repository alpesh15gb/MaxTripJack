# Flight-service consent boundary

Scope: post-ticket ancillary and reissue service reviews only. Initial-booking
requirements, provider amounts, encrypted traveller data, quote ownership/expiry,
provider confirmation and payment verification remain authoritative and unchanged.

## Evidence and contract

The existing `flight-services-flow.mts` fixture and ancillary producer establish
numeric `conditions.st` (supplier validity seconds). The existing
`trips-experience.spec.ts` fixture establishes a `restriction` text and text-list
alerts. `public-supplier-policy.ts` already supports bounded complete alert text.
The official TripJack reference (`https://tripjack.com/page/api-doc`) was checked
read-only; its text response is a JavaScript shell, so no additional service keys
or nested alert schema are inferred from it. This is intentionally a narrow,
fixture-backed supported contract, not a claim of exhaustive provider support.

A v1 public disclosure contains only `version`, `blocked`, and labelled text
`lines`. Conditions must be an object; only numeric integral validity >=30 seconds
and bounded nonblank restriction text are supported. Alerts, when present, must
be complete text or at most 20 complete text strings. Text is at most 2000
characters, never truncated. Empty condition objects/alert lists preserve existing
valid fixtures; absent/malformed conditions, unknown condition keys (including
financial/private/provider objects), unsupported alerts and oversized text block
the entire disclosure without returning partial lines. Unrelated raw review
metadata is not customer consent data and is never copied into this DTO. Full raw
supplier review remains persisted for validation, provider operations and audit.

Web/native validate the exact versioned wire shape independently of server types,
reject old raw responses and malformed lines, and refuse confirmation before any
payment call. Native parser parity is tested against the server/web implementation.

## Payment safety and recovery

New paid/free creation rechecks stored raw consent before wallet, PSP, order or
job effects, and checks the locked quote again before new order creation. Pending
unsafe existing paid intents cannot yield charge credentials through either
create replay or payment status. Create returns a bounded refusal with the
existing booking identity; status preserves identity and unresolved state but
removes resumability. Captured status still resolves; verification remains
available. Existing free-order acknowledgement is still idempotent. No intent,
marker, order or raw review is deleted by these guards.

Legacy captured service jobs are checked again before the first supplier submission.
Unsupported disclosure parks the order in MANUAL_REVIEW and its unattempted job in
REVIEW, under the owned lease, with the fixed SERVICE_TERMS_UNAVAILABLE reason.
Captured money, gateway intent, quote and amendment evidence remain intact; there
is no automatic refund/cancellation or false BOOKING_FAILED outcome. Already-attempted
jobs retain read-only supplier reconciliation so a known supplier success is not
hidden and no paid operation is submitted twice.

## Verification boundary

Unit/native contract and source-binding tests plus existing PostgreSQL/mock-provider
CI integration assertions cover unsupported paid/free creation with zero new
provider/order/intent/payment/job effects, raw evidence preservation, supported
service flow, pending refusal and captured verification recovery. Browser fixtures
cover supported, blocked, missing, raw, malformed and financial-label responses.
Local browser execution and live supplier/payment calls were not performed.
The PostgreSQL/mock-provider assertions require the existing disposable CI service;
adding them is not a claim that they were run locally.

Local checks (24 October 2026): 359 web unit tests via `node --import tsx --test
 tests/*.test.ts`; web ESLint; webpack production build; worker bundling; TypeScript;
46 native tests; native TypeScript; `EXPO_NO_TELEMETRY=1 CI=1 npm run lint`.
The usual `npm test` tsx CLI could not bind its local IPC socket in the sandbox;
the direct Node loader runs the same test files without requiring that socket.
Expo telemetry was disabled to avoid a home-directory write. Direct `eslint .`
has the unchanged native baseline of 17 errors/1 warning (hooks/assets); the
repository Expo lint command passes. Browser scenarios were discovered/listed,
not executed. No permissions, schema, credentials, dependencies, deployment or
live-provider configuration was changed.
