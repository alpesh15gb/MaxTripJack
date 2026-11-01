# PayGlocal implementation

PayGlocal PayCollect is the selected integration for new payments. The customer enters payment details on PayGlocal's hosted page. Existing payments retain their recorded provider.

The UAT implementation is prepared. Merchant onboarding and actual gateway acceptance are pending; no PayGlocal payment has been initiated. Checkout stays unavailable until complete UAT merchant configuration is supplied.

The integration uses the official [credential protocol](https://payglocal.in/docs/getting-started/dashboard-and-key-management), [PayCollect initiation](https://payglocal.in/docs/api-reference/payments-v2/paycollect/gpi), [server status](https://payglocal.in/docs/api-reference/payments-v2/common/get-transaction-status), [refund API](https://payglocal.in/docs/api-reference/payment/refund), and [official JS cryptography reference](https://github.com/PayGlocal-Technologies/payglocal-js-client/tree/5f6a93d61007b831e4d78555a15414e3f5c2e4c0).

## Required behavior

- INR one-time hosted sale, encrypted/signed requests, fixed UAT host and no raw card data in the application.
- Collect the payer's billing identity separately from traveller identity; seal it with the order's private details.
- Persist the merchant reference before initiation. An uncertain response never permits automatic resubmission.
- Match authenticated server status to the stored merchant, reference, gateway ID, amount and currency. Authorization alone is not capture.
- Browser returns route back to My trips or offer the native app handoff. Webhook tokens are never payment proof; the durable worker polls authenticated server status independently. Decoding a callback JWT does not authenticate a payment.
- Duplicate status checks produce one capture, one booking job and one CRM financial event.
- Refunds retain approvals, accepted supplier terms and capture limits. A SENT_FOR_REFUND acknowledgement remains processing; it does not establish settlement.
- Finance can record checked bank/provider settlement evidence after the authenticated refund reference has been linked. The existing approvals and MFA/permissions remain required. Evidence, actor, amount, bank reference and settlement day are retained; a retry records one completion, notification and CRM update. This is explicitly staff-verified evidence, not a fabricated gateway status.
- Website and native clients recover the original payment attempt and never switch its provider after a configuration change. Primary booking navigation uses real links; unresolved checkout guards keep the same order and prevent a fresh search.

## UAT configuration

Use `PAYMENT_PROVIDER=PAYGLOCAL`, `PAYGLOCAL_ENV=UAT`, `PAYGLOCAL_MERCHANT_ID`, `PAYGLOCAL_PRIVATE_KEY_ID` and `PAYGLOCAL_PUBLIC_KEY_ID`. Configure the merchant signing PEM and PayGlocal encryption PEM with `PAYGLOCAL_PRIVATE_KEY_PATH` / `PAYGLOCAL_PUBLIC_KEY_PATH`, or private multiline environment variables `PAYGLOCAL_PRIVATE_KEY` / `PAYGLOCAL_PUBLIC_KEY`. Keep the key material out of Git, chat, browser responses and logs.

Onboarding must supply matching UAT MID, RSA signing key, PayGlocal certificate and KIDs. Confirm enabled payment methods, billing/risk requirements and refund completion evidence with PayGlocal during acceptance. Public examples vary by payment method and include both API-key and RSA examples; this implementation follows the encrypted/signed credential protocol and must pass merchant UAT before activation.

## Deployment and recovery

Apply additive migration `017-payglocal-recovery` after taking and verifying a database backup. It adds polling leases, refund attempt recovery and immutable settlement evidence. Keep the existing encryption key, database volume and historical provider attribution. The local development database has been backed up privately and migrated; no VPS configuration was changed.

Run the new `payment-worker` alongside booking, cancellation and refund workers. `npm run build:workers` includes its runtime artifact. Protected Vercel website previews do not run continuous workers. Before UAT purchases, inspect queued jobs and start the reviewed worker configuration on the test VPS.

PEM paths refer to paths inside the runtime container. Mount them read-only and make them readable by runtime UID 10001, or configure private multiline environment values. The VPS currently uses a frozen private Compose configuration; changing a separate `.env.production` alone may not update the running service. Preserve the active configuration and pinned image when preparing a deployment.

Only the fixed PayGlocal UAT origin and INR charging are enabled. `AUTHORIZED` is not paid; only a matching authenticated `SENT_FOR_CAPTURE` sale creates a capture. Unknown outcomes never re-initiate checkout or repost a refund. Production origins, merchant risk-field variations, DCC/foreign-currency interpretations and automatic refund settlement statuses require confirmed merchant acceptance before extension.

## Isolated verification

- RSA signature/digest and JWE decryption with independently generated keys; fixed host/path and amount/currency/reference binding.
- Real disposable PostgreSQL migrations, concurrent initiation/capture, lost-response recovery by merchant reference, outbox rollback and late capture without duplicate supplier submission.
- Real SQL refund concurrency, lost acknowledgements, capture ceiling, checked settlement evidence, atomic rollback and exact retry without duplicate notifications/CRM events.
- Desktop/phone hosted checkout UI: explicit payer validation, distinct traveller/payer identity, one hosted handoff and refusal of foreign checkout URLs. Native URL/billing guards, type checking and Android/iOS JavaScript exports.

All provider responses in these checks are synthetic. Real merchant UAT, physical devices and production activation remain separate acceptance work.
