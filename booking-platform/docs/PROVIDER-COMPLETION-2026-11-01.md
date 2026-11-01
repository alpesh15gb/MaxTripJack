# Provider completion and verification — 2026-11-01

## Delivered behavior

- One-way, connecting, return-flight and hotel risk mappings use stored supplier quotes/searches, actual airport geography and sealed guest names. Billing identity is not replaced by traveller identity. Multiple hotel rooms remain one property/stay risk entry. Sensitive passport/PAN/card data and arbitrary client fields are excluded.
- Flight-local timestamps convert to UTC with airport-specific IANA timezone identities and runtime ICU date rules. Unknown locations/times and daylight-saving folds/gaps fail closed. The adapted OpenFlights identity database is pinned, attributed and published under ODbL; its numeric offset/DST flags are not used.
- Payment payload validation occurs before reserving an initiation attempt. Stored quote costs and payer details must match the order. Lost-response recovery and original-provider attribution remain unchanged.
- A pinned-key RSA JWS verification primitive validates signature, KID, algorithm, issuer and explicitly selected clock convention. Runtime webhook decoding remains disabled pending the actual merchant delivery contract. JSON hints never establish capture or refund completion.
- Cancellation submission is recorded before supplier HTTP. A 180-second lease prevents overlapping workers/staff calls. A crash or unknown result only permits status reconciliation, never blind resubmission.
- Pending hotel cancellations check daily. Unknown outcomes remain scheduled after five attempts; flight checks slow to hourly. Persisted supplier progress, errors, last/next checks and follow-up markers appear in Operations and exports. Long-pending/error cases can be filtered separately.
- Confirmed cancellation and one CRM outbox event commit atomically; a repeat completion produces no second event. Cancellation is not a customer refund. Signed progress updates appear in CRM case history/customer activity with IST check times and do not send another booking-confirmation notification/PDF.

## Deliberately disabled pending merchant confirmation

New PayGlocal checkout stays blocked in code before order/payment side effects, even with valid UAT keys. The immutable blocker list identifies pre-issuance ticket handling, billing-country format, merchant transport version, webhook envelope, hotel cancellation-policy coding and multi-city representation. Ancillary/reissue payment payloads also require confirmed guidance. There is no environment bypass. No production host or automatic refund-settlement status has been added.

## Verification

The accompanying regression suite covers travel mapping, timezone/DST boundaries, malformed data, sensitive-field exclusion, RSA signature tampering/expiry, immutable holds, daily cancellation scheduling, expired-lease recovery, concurrent checks, SQL rollback and exactly-once CRM completion. Disposable PostgreSQL fixtures exercise the actual SDK encrypted payload and payment/refund recovery. Signed CRM receiver fixtures verify case-history updates, forged-event denial, replay/stale revisions and unchanged receipt/notification counts.

Final verification passed on clean source clones: lint, TypeScript, production builds and worker compilation; 483 booking unit checks; 610 main desktop/mobile browser checks; six payment-disabled browser checks; 12 final operations UI checks after visual review; 50 native unit checks and native type checking; two web/native contract checks; SEO and production CSP/nonce checks. Six mocked hosted-checkout UI cases remain explicitly deferred while payment activation is blocked; these are not real-provider certification tests.

The real PostgreSQL suites passed payment/refund concurrency, encrypted mapped payload roundtrips, loss recovery, cancellation leasing/daily scheduling, migration readiness and rollback. Real local HTTP checks passed authentication/ownership, flight/hotel checkout fixtures, CRM commands, flight services, SMTP accept/reject/held responses and genuine MFA enrollment/recovery.

CRM's full main suite and isolated agency journeys passed, including ticketing, visa, cancellation accounting, idempotent finance, audit and reporting. The current signed receiver passed pending-cancellation history, event replay/stale revisions, forged-event denial and unchanged receipt/notification counts.

The real two-app proof passed flight and hotel HTTP checkout → simulated capture → booking worker → signed CRM delivery, with permanent case IDs and one receipt/invoice per booking. It also verified desktop/mobile My Trips and CRM views, administrator assignment, delegated staff start/submission, separate administrator approval, worker replay protection and staff finance denial.

All upstream payment/supplier responses in these checks are synthetic. Actual TripJack/PayGlocal UAT acceptance remains separate. Local evidence is retained privately under `.artifacts/provider-completion-20261101`; no credentials are part of the evidence committed to Git.

## Deployment

The booking candidate image must include and apply additive migration `019-cancellation-reconciliation` using the existing migration-owner configuration before starting the new application/workers. Keep the established database, vault key and private provider mounts. Build/verify the candidate before replacing running services. The migration runner records 019 once and can be rerun safely. Health now returns 503 when the new cancellation columns are missing.

CRM has no schema migration for this change. Update it with the signed cancellation-summary receiver support. Keep payment activation disabled on both preview and VPS until merchant contract confirmation and UAT acceptance. The staged UAT keys remain private and are not part of either Git repository.
