# Integration and operations



Read DELIVERY-STATUS.md for implemented scope and release checks. Real provider testing is deferred.



Official contracts: https://tripjack.com/page/api-doc (flights FMS/OMS v1, fare rules v2, hotels v3); https://razorpay.com/docs/api/refunds/normal-refunds-idempotent ; https://github.com/razorpay/razorpay-node/blob/master/documents/order.md . Fixed UAT hosts and test Razorpay keys are enforced.



## Local setup

For a fresh source checkout, first run `node scripts/init-local.mjs`. It creates random local database/auth/encryption secrets and Mailpit settings, and never overwrites an existing .env.local. Then run the setup commands below. Provider keys remain blank until you configure real test credentials.



Private .env.local holds database/auth/encryption/SMTP/provider/CRM secrets. .env.example contains names only. Preserve TRAVELLER_ENCRYPTION_KEY for encrypted records.



```text

docker compose --env-file .env.local -f compose.dev.yaml up -d --wait

npm run db:migrate

npm run db:auth

npm run dev -- --hostname 127.0.0.1

npm run worker:bookings

npm run worker:notifications

npm run worker:crm

```



Enable CRM delivery after configuring the receiver; see ../crm-review/BOOKING-INTEGRATION.md for migrations, owner/branch mapping and signing keys. Retry payloads are frozen; stale revisions are ignored.



With hotel UAT credentials, run npm run catalogue:sync. Searches check 100 mapped properties per group; customers can choose additional groups. All rooms share occupancy/child ages. Email goes to local Mailpit; production needs SMTP. Email delivery is at-least-once and can duplicate after a crash following SMTP acceptance.



## Admin



Create/verify accounts and enrol authenticators at /account, then run:



```text

node --env-file=.env.local --import tsx scripts/grant-admin.mts operations@example.com operations

node --env-file=.env.local --import tsx scripts/grant-admin.mts finance@example.com finance

```



Grants replace previous roles. viewer is read-only. Refunds above REFUND_SECOND_APPROVAL_MINOR (default 5000000; INR 50000) require another approver. Company linking requires a verified MFA account; one login per company is enforced.



## Workflow/recovery



Search → select → review price/rules → guests → accept server total → Razorpay → verified capture → supplier job → supplier confirmation. Payment success alone does not confirm travel.



A quote reuses its gateway order. Uncertain creation is recovered using the existing Razorpay ID; receipt/amount/currency must match. Finance can reconcile captures for a saved order. Supplier attempts are committed before Book; unknown outcomes only query details. Operations can resume those checks.



Cancellation: request → staff charges review → expiring offer → customer acceptance → single supplier submission → confirmed cancellation → separate approved refund. Unknown submissions are not repeated. Lost flight amendment IDs need TripJack investigation. Refund checks reuse the same idempotency key or known refund ID.



## Verification



```text

npm test

npm run test:integration

npm run test:providers

npm run build

npm run build:workers

```



Stop workers before synthetic tests; keep the local server running for authentication. Tests mock provider HTTP and never make real charges or travel reservations.



## VPS



Create private .env.production. DATABASE_URL uses postgres:5432 inside Compose; BETTER_AUTH_URL is the HTTPS public domain. Set POSTGRES_PASSWORD for Compose interpolation.



```text

docker compose --env-file .env.production -f compose.production.yaml build

docker compose --env-file .env.production -f compose.production.yaml up -d postgres

docker compose --env-file .env.production -f compose.production.yaml run --rm app node scripts/migrate.mjs

docker compose --env-file .env.production -f compose.production.yaml run --rm app node --conditions=react-server --import ./scripts/standalone-server.mjs dist/migrate-auth.mjs

docker compose --env-file .env.production -f compose.production.yaml run --rm app node --conditions=react-server --import ./scripts/standalone-server.mjs dist/sync-catalogue.mjs

docker compose --env-file .env.production -f compose.production.yaml --profile crm --profile notifications up -d

```



Adapt deploy/nginx.conf to the domain/certificate. App port 3108 binds loopback; Postgres is not published. /api/health reports readiness. deploy/backup.sh creates/verifies an archive; deploy/restore.sh explicitly replaces data and leaves services stopped. Back up encryption/auth/signing secrets separately. Restore drill and monitoring still need validation.



## Mobile



See ../mobile-app/README.md. EXPO_PUBLIC_API_URL must match the HTTPS backend origin configured by BETTER_AUTH_URL. Provider secrets never belong in native bundles. Native Razorpay requires a development/release native build, not Expo Go.



## Final coding additions — 15 October 2026



The code now includes automatic refund and cancellation reconciliation workers, transient-data maintenance, worker heartbeats and email retry controls, TripJack wallet display/pre-payment check, airport autocomplete, saved profile editing/use, recovery-code sign-in, device-session/password controls and admin CSV exports. CRM receives confirmation identifiers, true platform status and actual payment method; supplier/financial mutations are guarded in CRM.



Start `npm run worker:refunds`, `npm run worker:cancellations` and `npm run worker:maintenance` alongside the booking worker. Cancellation polling stops after 240 checks for staff investigation; it never resubmits an uncertain cancellation. Wallet checking is a preflight, not a fund reservation; a later supplier rejection still follows the failed-booking/refund workflow.



Additional checks: `npm run test:refunds`, `npm run test:cancellations`, `npm run test:security-production`. The production security check targets a local built server at port 3109. CI definitions are in each project's .github/workflows folder. SECURITY.md records the scoped dependency findings and runtime controls.



### Restricted production database role



Keep owner credentials in a private .env.migration file, separate from runtime .env.production. Use the .env.migration.example template. Run schema/auth migrations with MIGRATION_DATABASE_URL, then scripts/provision-runtime-role.mjs with the owner URL and a random RUNTIME_DATABASE_PASSWORD. The application role is maxtravel_app and cannot create schemas/tables or modify migration history.



After Compose creates its private network/database, these deployment-only commands can be used:



```text

docker run --rm --network max-travel-booking_default --env-file .env.migration max-travel-booking:local node scripts/migrate.mjs

docker run --rm --network max-travel-booking_default --env-file .env.migration max-travel-booking:local node --conditions=react-server --import ./scripts/standalone-server.mjs dist/migrate-auth.mjs

docker run --rm --network max-travel-booking_default --env-file .env.migration max-travel-booking:local node scripts/provision-runtime-role.mjs

```



Set runtime DATABASE_URL to maxtravel_app, keep owner/provisioning credentials out of .env.production, then run `npm run release:check`. The earlier generic migration commands assume owner access; use the separate owner-file commands for the restricted deployment. Configuration, real certification tests and deployment remain deferred as requested.



## Advanced flight services (17 October 2026)

Run the latest database migrations and rebuild the app/workers. Multi-city, partial cancellation, post-ticket extras and one-time reissue now share the existing payment and worker infrastructure. See FLIGHT-SERVICES.md for contracts, recovery and mandatory UAT checks.

## CRM staff commands and automatic confirmation PDFs

Apply SQL migration 014-crm-commands with `npm run db:migrate`, then rebuild the website and workers. Configure optional CRM_COMMAND_KEYS and CRM_STAFF_ACTORS only after setting up distinct per-staff mapped administrator grants. CRM setup, permissions, unknown-outcome recovery and BOOKING_DOCUMENT template automation are documented in ../crm-review/TWO-WAY-BOOKING-INTEGRATION.md. Real deployed acceptance remains required.

## Booking safety update — 20 October 2026

Apply migration `015-fare-validation` before this app/worker version. It intentionally blocks historical initial-flight quotes because previous Fare Validate dispatches cannot be proved: unpaid checkouts require an explicit fresh review only after any existing payment operation is reconciled; paid/unattempted orders require operations review, not a retry or second charge. PREPAYMENT and PREBOOK validation are separate durable phases. See [booking safety and rollout notes](docs/BOOKING-SAFETY-2026-10-20.md) for recovery contracts and the local/database verification boundary.
