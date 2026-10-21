# PayGlocal hosted checkout — gated implementation

Base: `453578df4bfd2b8c259a899426ed04738e470a04` (GitHub main and fresh clone verified 2026-10-21). Local branch: `feat/payglocal-hosted-checkout`. No push, migration, deployment, real payment, booking or provider-account changes were performed.

## What is implemented

- New-order provider selection (`PAYMENT_PROVIDER`, server-only) defaults to Razorpay. `PAYGLOCAL` **always returns 503 for new nonzero checkouts before supplier/order/payment side effects; existing Razorpay intents retain their provider and zero-price services bypass gateways**. No configuration flag can enable an unverified transport.
- Provider-neutral routing boundary plus permanent provider attribution. Migration 016 defaults historical payment and intent records to `RAZORPAY`; historical verification/webhooks/reconciliation/refunds remain Razorpay-only.
- Separate persisted PayGlocal attempt with unique transaction reference and gid, amount/currency/MID, safe checkout/status URLs, and STARTED/PENDING/UNKNOWN/CAPTURED states. Transaction-injected helpers reserve once, refuse provider switching, persist initiation, preserve unknown outcomes and bind verified server status to the stored identity.
- A captured transition, booking job and outbox record are in the same database transaction. Repeated/out-of-order status results cannot duplicate fulfillment or downgrade captured funds. A late success on an unexpected booking state becomes manual review rather than retrying supplier booking.
- Hosted-checkout UI response discrimination and validated UAT redirect handling; existing Razorpay UI remains intact. Browser returns never mean payment success. Resume remains disabled for PayGlocal at the actual API until the merchant transport is verified.
- Internal transaction helpers require caller-enforced booking ownership; they are not HTTP endpoints and must never be exposed without authorization.
- Callback endpoint is an untrusted hint only (202, no mutation); webhook endpoint fails closed (503, no mutation). Neither consumes raw input as a verified status.
- Exact integer-minor-unit to decimal-currency conversion; identity and amount validation; explicit UAT URL origin/path allowlist and gid-bound status URL; AUTHORIZED is not paid; SENT_FOR_CAPTURE is a successful sale; unknown/timeout is not failed. SENT_FOR_REFUND is pending, never completed.
- PayGlocal refunds are blocked **before** refund state mutation or outbound requests. Existing supplier-failure refund requests must remain for finance review until a verified refund contract is implemented; never send a PayGlocal gid to Razorpay.

The persistence helpers and payload preparation are intentionally not connected to an enabled HTTP transport. Mock tests demonstrate local behavior only, not UAT interoperability. Additional disposable PostgreSQL 17.10 and 18.4 tests verify migration compatibility, eight-way reservation/capture concurrency and SQL-trigger-induced rollback on a real database.

## Required before UAT activation

1. Confirm the merchant-specific PayCollect version and contract. Public merchant flow describes JWE (`text/plain` with `x-gl-token-external`), V2 GPI describes JSON/JWS, and key-management permits/recommends encryption. Use the official SDK/helper after pinning/reviewing it; do not invent crypto.
2. Obtain merchant-owned UAT MID/key material through a secure secret store, never browser variables or chat. Confirm SDK key identifiers, request signing/encryption, authenticated status response verification and exact MID/merchantTxnId/gid/amount/currency field bindings.
3. Confirm billing-country format, complete mandatory flight billing/risk data, callback URL, hosted redirect URL/path and status URL/path. The current origin allowlist is UAT only. Resolve production host discrepancy (`api.prod.payglocal.in` vs `api.payglocal.in`) before any production work.
4. Confirm webhook signing/authentication, event identity/replay contract and delivery retry behavior. Until then, no callback/webhook can mutate money or booking state.
5. Confirm initiation lookup/reconciliation and idempotency guarantees. After timeout, reconcile the original stored reference; never blindly initiate again.
6. Confirm refund request idempotency, status authentication and final settlement semantics. Acceptance alone is not a completed refund. Add durable refund attempts and reconciliation before enabling refunds.
7. Review/apply migration 016 in an authorized disposable database, test real transactions/races/rollback and supplier failure/refund lifecycle. Run merchant-authorized UAT end-to-end with approved credentials; only then review an activation change.

## References (official, reviewed 2026-10-21)

- https://payglocal.in/docs/merchant/sdks
- https://github.com/PayGlocal-Technologies/payglocal-js-client
- https://payglocal.in/docs/key-management/overview
- https://payglocal.in/docs/key-management/request-construction
- https://payglocal.in/docs/api-reference/payments-v2/paycollect/gpi
- https://payglocal.in/docs/api-reference/payments-v2/common/get-transaction-status
- https://payglocal.in/docs/api-reference/payment/refund

## Local verification

Use `npm ci --ignore-scripts --cache /tmp/maxtripjack-npm-cache`, `node --import tsx --test tests/*.test.ts`, `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, and `git diff --check`. The Node test entrypoint avoids the tsx CLI's unavailable sandbox IPC socket; it runs the same test files. Test logs are in `verification/` (ignored local artifacts) and copied to `/workspace/shared/maxtravel-payglocal-review/`.

No `.env` files were read or created. Full production build passed. `tests/payglocal-postgres.mts` additionally passed against actual native PostgreSQL 17.10 and 18.4, downloaded into a separate temporary runtime using `embedded-postgres@17.10.0-beta.17` and `embedded-postgres@18.4.0-beta.17`; no application dependency or system configuration was changed. Unix-domain sockets were unavailable, so the disposable server used TCP loopback only, with a test-only password and database `payglocal_disposable`; all processes and test data were cleaned up. The script requires explicit `TEST_DATABASE_URL`, rejects non-loopback destinations, never reads `DATABASE_URL`, and cleans up its random schema. This proves local SQL behavior, not production deployment compatibility or merchant interoperability.

The desktop cloud browser cannot reach the command sandbox loopback preview. A supported outside-sandbox launch failed before execution due to the environment's read-only path setup; no security configuration was changed. Provider UAT and live payment/refund remain untested.


Additional verification: `npm run test:seo:http` passed 1,932 actual HTTP/HTML assertions. Repository Playwright browser tests were attempted but none executed: the matching Chromium Headless Shell was absent, and the official download returned HTTP 403 `Domain not in allowlist`. No alternate download or network bypass was attempted. This remains a browser QA blocker, not 66 demonstrated application failures. The generated browser report was moved outside the source checkout to the shared review folder before rerunning lint (otherwise ESLint scans the generated third-party report JavaScript).
