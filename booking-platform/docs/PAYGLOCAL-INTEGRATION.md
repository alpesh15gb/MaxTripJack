# PayGlocal implementation

PayGlocal PayCollect is the selected integration for new payments. The customer enters payment details on PayGlocal's hosted page. Existing payments retain their recorded provider.

The encrypted SDK transport, authenticated status recovery and refund infrastructure are implemented. Research on 2026-11-01 found official [flight and hotel payload examples](https://payglocal.in/docs/api-reference/payload-templates), despite the absent email attachment. One-way/return-flight and hotel travel mapping is now implemented from owned server-side data. The published examples/schema still leave merchant-specific questions unresolved. New checkout remains blocked even with valid UAT keys. Supplied key material passed offline cryptographic checks and is staged privately; gateway acceptance remains unverified. See the [research and code findings](PROVIDER-RESEARCH-2026-11-01.md) and [draft clarification reply](PAYGLOCAL-EMAIL-FOLLOWUP.md).

The integration uses the official [credential protocol](https://payglocal.in/docs/getting-started/dashboard-and-key-management), [PayCollect initiation](https://payglocal.in/docs/api-reference/payments-v2/paycollect/gpi), [server status](https://payglocal.in/docs/api-reference/payments-v2/common/get-transaction-status), [refund API](https://payglocal.in/docs/api-reference/payment/refund), and [official Node.js SDK](https://github.com/PayGlocal-Technologies/payglocal-js-client/tree/5f6a93d61007b831e4d78555a15414e3f5c2e4c0).

## Required behavior

- INR one-time hosted sale, fixed UAT host and no raw card data in the application. Token generation calls the unmodified official `payglocal-js-client`, pinned to commit `5f6a93d61007b831e4d78555a15414e3f5c2e4c0` via its official HTTPS source archive and lockfile integrity. No application signing/encryption implementation remains.
- Initiation uses `POST https://api.uat.payglocal.in/gl/v1/payments/initiate/paycollect`, `Content-Type: text/plain`, `X-GL-TOKEN-EXTERNAL: <SDK JWS>`, and the raw SDK JWE as its body. The SDK’s combined `generateJWEAndJWS` builds both tokens. Its unchanged lower-level `src/generateJWS.js` signs bodyless status GETs because the public standalone JWS validator rejects an empty string.
- Travel structures are validated and mapped from the stored quote, itinerary, selected hotel and sealed guests. Payer billing remains separate. Both web and native requests use this server boundary. Airport-local flight times use date-specific IANA rules, with DST ambiguity/unknown airports failing closed. No ticket number, multi-city representation or hotel cancellation code is invented. The immutable merchant-confirmation hold still runs before payment reservations, wallet calls and provider HTTP.
- Collect the payer's billing identity separately from traveller identity; seal it with the order's private details.
- Persist the merchant reference before initiation. An uncertain response never permits automatic resubmission.
- Match authenticated server status to the stored merchant, reference, gateway ID, amount and currency. Authorization alone is not capture.
- Browser returns route back to My trips or offer the native app handoff; they never change financial state.
- Independent server-to-server `POST /api/webhooks/payglocal` accepts the documented bounded JSON envelope, checks the configured MID, matches our stored merchant transaction/reference/amount/currency, and durably makes its original payment/refund status check due. Concurrent/repeated hints are coalesced at one per attempt per minute; no raw webhook, billing or card payload is persisted. Respond 200 after durable enqueue, 503 if storage is unavailable so delivery can retry. Malformed/irrelevant events are acknowledged without state changes.
- Webhook identity fields are public hints, not authentication or payment proof. The worker independently uses the official SDK to authenticate a status GET against our stored references before any financial transition. No callback token decoding or webhook claim marks a payment captured/refund settled. Polling remains a fallback if a webhook is lost. Confirm the merchant webhook signature and delivery contract with PayGlocal; public docs do not establish a signature scheme.
- Duplicate status checks produce one capture, one booking job and one CRM financial event.
- Refunds retain approvals, accepted supplier terms and capture limits. A SENT_FOR_REFUND acknowledgement remains processing; it does not establish settlement.
- Finance can record checked bank/provider settlement evidence after the authenticated refund reference has been linked. The existing approvals and MFA/permissions remain required. Evidence, actor, amount, bank reference and settlement day are retained; a retry records one completion, notification and CRM update. This is explicitly staff-verified evidence, not a fabricated gateway status.
- Website and native clients recover the original payment attempt and never switch its provider after a configuration change. Primary booking navigation uses real links; unresolved checkout guards keep the same order and prevent a fresh search.

## UAT configuration

Use `PAYMENT_PROVIDER=PAYGLOCAL`, `PAYGLOCAL_ENV=UAT`, `PAYGLOCAL_MERCHANT_ID`, `PAYGLOCAL_PRIVATE_KEY_ID` and `PAYGLOCAL_PUBLIC_KEY_ID`. Configure the merchant signing PEM and PayGlocal encryption PEM with `PAYGLOCAL_PRIVATE_KEY_PATH` / `PAYGLOCAL_PUBLIC_KEY_PATH`, or private multiline environment variables `PAYGLOCAL_PRIVATE_KEY` / `PAYGLOCAL_PUBLIC_KEY`. Keep the key material out of Git, chat, browser responses and logs.

Use the UAT GCC Dashboard → Key Management flow in PayGlocal’s [key guide](https://payglocal.in/docs/getting-started/dashboard-and-key-management). Generate/download the merchant signing key and corresponding KID there; download the PayGlocal encryption certificate and its KID. Onboarding must supply matching UAT MID, RSA signing key, PayGlocal certificate and KIDs. Never mix production and UAT key material. Confirm enabled payment methods, billing/risk requirements and refund completion evidence with PayGlocal during acceptance. Public examples vary by payment method and include both API-key and RSA examples; this implementation follows the encrypted/signed credential protocol and must pass merchant UAT before activation.

## Deployment and recovery

Apply additive migrations `017-payglocal-recovery` and `018-payglocal-webhooks` after taking and verifying a database backup. They add polling leases, refund attempt recovery, immutable settlement evidence and bounded webhook wake-up timestamps. Migration 017 was already applied locally and to the isolated preview; it is not rewritten. Keep the existing encryption key, database volume and historical provider attribution. The local development database has been backed up privately and migrated; no VPS configuration was changed.

Run the new `payment-worker` alongside booking, cancellation and refund workers. `npm run build:workers` includes its runtime artifact. Protected Vercel website previews do not run continuous workers. Before UAT purchases, inspect queued jobs and start the reviewed worker configuration on the test VPS.

PEM paths refer to paths inside the runtime container. Mount them read-only and make them readable by runtime UID 10001, or configure private multiline environment values. The VPS currently uses a frozen private Compose configuration; changing a separate `.env.production` alone may not update the running service. Preserve the active configuration and pinned image when preparing a deployment.

Only the fixed PayGlocal UAT origin and INR charging are enabled. `AUTHORIZED` is not paid; only a matching authenticated `SENT_FOR_CAPTURE` sale creates a capture. Unknown outcomes never re-initiate checkout or repost a refund. Production origins, merchant risk-field variations, DCC/foreign-currency interpretations and automatic refund settlement statuses require confirmed merchant acceptance before extension.

## Isolated verification

- RSA signature/digest and JWE decryption with independently generated keys; fixed host/path and amount/currency/reference binding.
- Real disposable PostgreSQL migrations, concurrent initiation/capture, lost-response recovery by merchant reference, outbox rollback and late capture without duplicate supplier submission.
- Real SQL refund concurrency, lost acknowledgements, capture ceiling, checked settlement evidence, atomic rollback and exact retry without duplicate notifications/CRM events.
- Previous mocked desktop/phone UI checks exercised the provisional payer validation, traveller/payer separation, one hosted handoff and foreign-URL refusal. Those six checks are now explicitly deferred pending confirmation of the merchant travel contract. Unavailable checkout is tested on both viewports. Native URL/billing guards, type checking and Android/iOS JavaScript exports were previously verified; actual payload alignment remains pending.

All provider responses in these checks are synthetic. Real merchant UAT, physical devices and production activation remain separate acceptance work.

## Email alignment verification — 2026-11-01

451 unit checks pass. The real disposable PostgreSQL suite applies migrations 001–018, verifies official SDK encrypted requests and exact initiation headers, proves duplicate delivery/recovery/rollback behavior, and proves that complete synthetic keys cannot bypass the travel contract hold. A separate desktop/phone run passes four unavailable-checkout/API checks with valid synthetic SDK credentials. The six previous mocked hosted-UI checks are retained but explicitly deferred while merchant confirmations remain pending; they are not counted as passing merchant acceptance. Lint, TypeScript, worker compilation and the isolated production build pass. Production dependency audit reports zero vulnerabilities. These checks do not contact PayGlocal or certify the merchant travel payload.

## Provider-contract completion — 2026-11-01

Published flight and hotel templates are mapped and exercised through the actual SDK encryption/signing and PostgreSQL attempt/capture/refund recovery fixture. New runtime checkout remains blocked by the immutable `PAYGLOCAL_CONFIRMATION_BLOCKERS` list, regardless of supplied keys or environment flags. Multi-city and ancillary/reissue payment representations are explicitly unavailable pending merchant guidance.

`verifyPayGlocalJws` supplies pinned RSA/KID, algorithm, issuer and explicitly configured issuance-clock validation. It rejects token tampering, unknown algorithms, remote key selection, expired/future tokens and mixed clock units. It is a verification primitive: it is not connected to live webhook decoding until PayGlocal confirms the delivery envelope and claim contract. Existing JSON webhook hints still only wake authenticated status checks; no incoming financial claim settles money.

Booking migration `019-cancellation-reconciliation` adds leased supplier checks, recorded supplier status/errors and staff follow-up timing. Pending hotel cancellations check daily without an attempt ceiling; uncertain flight amendments continue at a slower cadence. Confirmed cancellation and its CRM outbox event commit together. Staff can filter follow-ups in Operations; signed updates record next-check times in CRM case history without sending a fresh booking-confirmation message. Refund settlement remains separate.

See [implementation and verification handoff](PROVIDER-COMPLETION-2026-11-01.md).
