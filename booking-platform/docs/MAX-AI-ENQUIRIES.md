# Max AI service enquiries

Max AI can prepare visa, travel insurance, holiday and cruise enquiries. The customer reviews the details, supplies a contact in the form and explicitly confirms consent before submission. Preparing a chat draft does not create an enquiry. Submitting it does not create a booking, policy, visa application, supplier reservation, payment or refund.

## Persistence and staff workflow

`POST /api/travel/enquiries` validates the confirmed draft and consent, applies shared guest/account access and rate limits, and atomically saves an enquiry, audit event and frozen CRM outbox event. The opaque request UUID is scoped to the current account or HTTP-only shopping cookie. Exact retries return the original receipt, including after its travel date passes; a changed payload under the same key returns a conflict. `GET /api/travel/enquiries?requestId=...` recovers that actor's receipt after an uncertain response. It does not expose contact details.

Booking administrators use `/operations/enquiries`: `bookings:read` allows the register; `bookings:reconcile` allows status and internal-note updates; `integrations:manage` allows retrying CRM delivery. Existing verified-email, MFA and active-access requirements remain. The release does not grant permissions automatically. Version checks prevent concurrent staff edits from silently overwriting one another.

Contacts are customer-provided and **unverified**, including when an account is signed in. The CRM creates a separate provisional lead contact for each enquiry; it does not look up, merge or change an existing customer on the strength of an unverified email or telephone number. Staff should verify the contact before merging records or sharing existing customer information.

## Actual CRM integration

The receiver is the **MaxTravel CRM** repository, `https://github.com/alpesh15gb/MaxTravel`, deployed at the documented `/opt/max-travel-crm` path. It is not the separate Safar CRM.

The booking worker uses the existing signed endpoint `/api/integrations/booking-platform/events`. Schema-version 1 `enquiry.created` events carry an immutable enquiry ID, reference, service, validated draft, contact and consent time. HMAC, timestamp and body-hash checks authenticate the envelope. The receiver creates a native SalesLead and ServiceCase owned by the configured integration staff member/branch, and returns a strict receipt identifying the lead and case. Exact event replays are idempotent; changed contents or a new event identity for an existing immutable enquiry return a conflict.

Structured budgets are stored separately from generic notes and only exposed to staff with `payment:view`. Per-person and total budgets keep their original basis. Missing budgets are not shown as zero. Visa, holiday and cruise leads may be quoted, but the generic sales conversion cannot manufacture an unsupported booking; fulfilment remains a team/supplier process.

The booking register distinguishes:

- `PENDING`: saved locally and waiting for a verified CRM receipt.
- `DELIVERED`: the CRM returned the matching lead/case receipt and the worker saved it.
- `ACTION_REQUIRED`: delivery exhausted 12 attempts; an authorised operator can correct configuration and retry.
- `NOT_CONFIGURED`: the booking app lacks a valid CRM URL/signing-key/key-ID configuration. The enquiry remains saved locally.

A generic HTTP 200 is not a delivery receipt. Network failures and an outdated receiver leave the enquiry queued; they never erase the local save or claim a lead exists. Retries use the same frozen payload and event ID. Booking admin status and CRM sales stage are independent; this release does not claim two-way stage synchronisation.

## Required existing configuration

Keep private values on the VPS. No new OmniRoute key or model setting is required for enquiries.

Booking `.env.production` must already contain:

```dotenv
CRM_EVENTS_URL=https://crm.maxtravel.in/api/integrations/booking-platform/events
CRM_KEY_ID=your-existing-signing-key-id
CRM_SIGNING_KEY=your-existing-private-key-at-least-32-characters
```

The CRM's private environment must have matching `BOOKING_PLATFORM_SIGNING_KEYS` (JSON map from key ID to private signing key), `BOOKING_PLATFORM_OWNER_ID` and `BOOKING_PLATFORM_BRANCH_ID`. The owner must be active and permitted to own cases; the branch must exist. Reuse the existing integration values rather than replacing working signing keys. Do not copy secrets into chat, Git or browser variables.

## Deploy both repositories, CRM first

These commands target the repository's documented existing Docker layout. If the CRM directory or private env file is absent, inspect the actual MaxTravel deployment instead of substituting `/opt/safar-crm`. The existing CRM deployment script below backs up the running CRM, builds its new image, applies committed migrations and checks health with rollback support.

```bash
(
  set +x
  set -e
  cd /opt/max-travel-crm
  git pull --ff-only origin main
  test -r /opt/max-travel-crm-secrets/crm.env
  bash deploy/crm-deploy.sh
)
```

This adds one nullable `SalesLead.requestedBudgetJson` column. Both SQLite and PostgreSQL migrations are committed. The documented CRM Docker deployment uses its existing SQLite migration command; a separately configured PostgreSQL deployment must use its established PostgreSQL migration procedure (`npm run db:migrate:postgres` with private owner credentials), not the SQLite command.

After the CRM deployment succeeds, build the booking app, run migration `024-travel-enquiries` and restart the app plus CRM worker:

```bash
(
  set +x
  set -e
  cd /opt/max-travel-booking/booking-platform
  git pull --ff-only origin main
  POSTGRES_PASSWORD="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_PASSWORD)"
  POSTGRES_USER="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_USER)"
  test -n "$POSTGRES_PASSWORD"
  test -n "$POSTGRES_USER"
  export POSTGRES_PASSWORD POSTGRES_USER
  docker compose --env-file .env.production -f compose.production.yaml build app
  docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
    -e POSTGRES_PASSWORD -e POSTGRES_USER app node scripts/migrate-company-settings.mjs
  docker compose --env-file .env.production -f compose.production.yaml --profile crm \
    up -d --no-deps --force-recreate --wait app crm-worker
  docker compose --env-file .env.production -f compose.production.yaml --profile crm ps app crm-worker
  curl -fsS http://127.0.0.1:3108/api/health
)
```

Despite its historical name, `migrate-company-settings.mjs` runs **all registered booking migrations**, including 024. It replaces only the migration process's credentials with the existing database owner's credentials; the running application retains its restricted connection. Owner values are not printed or persisted. A custom database endpoint can use an explicitly supplied private `MIGRATION_DATABASE_URL` for the one-off process, following the existing deployment documentation. Never put owner credentials in the runtime env file.

The new booking migration grants the existing `maxtravel_app` role access to the enquiry table. The `crm` profile must be running for delivery. Rebuilding the application alone does not replace a previously running CRM worker. Do not use `docker compose down` or delete database volumes.

## Verification

Local automated checks cover schema validation, explicit consent, access/CSRF/rate boundaries, actor-scoped recovery, midnight replay, staff permissions, optimistic conflicts and strict bounded CRM receipts. The receiver integration test uses a freshly migrated isolated SQLite database and the real signed route handler for all four services, replay/collision/authentication failures, customer isolation, finance projection and native sales visibility. It creates no live enquiries and sends no customer messages. PostgreSQL DDL was reviewed; no local PostgreSQL server was available for an actual migration execution.

After deployment, make one deliberately identified test enquiry through the customer review form. Confirm it appears once in `/operations/enquiries`, progresses from pending to delivered with a CRM reference, and appears in the CRM sales register with the correct service, contact warning and budget basis. Refreshing an uncertain submission must recover the same reference. Verify it at desktop and mobile widths. This is a real enquiry submission; do not use a real customer's personal details without their consent. Production delivery is only confirmed by the recorded CRM receipt, not by a successful build or the app health check.
