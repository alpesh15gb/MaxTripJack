# Max AI enquiries and Safar CRM

**Booking is in testing. Safar CRM contains real business transactions.** This guide replaces the earlier MaxTravel CRM integration instructions. Do not deploy the old `alpesh15gb/MaxTravel` receiver or redirect the legacy booking CRM sender to Safar.

The VPS audit on 17 November 2026 found no configured legacy CRM destination, no delivered events and no enquiry events. The queue contained 7 `booking.confirmed`, 1 `booking.failed` and 8 `payment.captured` events from booking tests. The user stopped `max-travel-booking-crm-worker-1`. Preserve those 16 records and leave that worker stopped.

## Customer and staff workflow

Max AI prepares visa, insurance, holiday and cruise enquiries. The visitor reviews an editable draft, enters contact details outside model chat and explicitly consents before saving. This does not reserve travel, apply for a visa, issue insurance or take payment. Contacts remain unverified.

The booking site atomically saves the enquiry, an audit event and an immutable delivery payload. Actor-scoped request IDs recover the same receipt after uncertain responses. Reusing an ID with changed details returns a conflict. Exact retries still work after the requested travel date has passed.

Booking staff use `/operations/enquiries`. Existing verified-email, MFA and permission requirements apply: `bookings:read` to view, `bookings:reconcile` to update status/notes, `integrations:manage` to retry eligible delivery. Staff updates use version checks. Permissions are not automatically granted by this release.

Safar staff use **Website enquiries** at `/enquiries`. This is a separate inbox with assignment, status and notes. The boss sees unassigned enquiries and can assign them; staff see enquiries within their existing access scope. Existing MFA and password-change requirements apply. Structured budgets are separately stored and projected only to users allowed to see profit information. Contact details are explicitly marked unverified.

The receiver writes only the new enquiry, enquiry-financial and enquiry-audit tables. It does not create or update existing customers, cases, tasks, bookings, invoices, payments or supplier records. No automatic conversion into a native sales case or customer is included.

## Test/live separation

`SAFAR_ENQUIRY_MODE=test` is the default. The server saves that mode with each new enquiry and inside its signed schema-version 2 envelope. Neither customer input nor the model chooses it. Retries reuse the original payload. Changing configuration later cannot relabel old test enquiries as live.

Safar opens **Live enquiries** by default. **Test enquiries** is a separate view with prominent labels. Test records are stored in the isolated enquiry tables, never the transaction tables. This separation does not create a second CRM database.

When booking is ready for live business, change only `SAFAR_ENQUIRY_MODE=live` through a deliberate deployment of the booking app and enquiry worker. Existing test enquiries retain their original mode. Do not bulk-update the saved mode or recreate payloads to move them into Live.

## Dedicated delivery

The new `enquiry-worker` uses the `enquiries` Compose profile and these private booking settings:

```dotenv
SAFAR_ENQUIRY_URL=https://crm.maxtravel.in/api/integrations/max-ai/enquiries
SAFAR_ENQUIRY_KEY_ID=<dedicated-key-id>
SAFAR_ENQUIRY_SIGNING_KEY=<dedicated-private-secret>
SAFAR_ENQUIRY_MODE=test
```

Safar's `deploy/.env.production` uses `SAFAR_MAX_AI_SIGNING_KEYS`, a JSON object mapping dedicated key IDs to their private signing secrets. The setup helper below creates a matching pair without displaying it. These settings do not replace OmniRoute, SMTP, database, Supabase or legacy `CRM_*` keys.

HMAC authenticates the raw body, event ID and timestamp. The receiver rejects expired signatures, malformed payloads and conflicting replays. A valid acknowledgement must identify Safar and match the enquiry ID, reference and original environment, with a valid Safar record ID. A generic HTTP 200 or a receipt from the previous CRM is not success. Payloads and acknowledgements are bounded; leases and retries are fenced, with a maximum of 12 attempts before staff intervention.

New enquiry records have an explicit Safar destination. Migration 025 leaves earlier enquiry destinations NULL and does not rewrite their outbox records. Older records show `DESTINATION_REVIEW` or `LEGACY_DELIVERY` and cannot be retried into Safar. Any future transfer requires a separate review. The ordinary `crm-worker` excludes enquiries and must remain stopped in this testing deployment.

## Pull, configure and deploy

These commands target the confirmed VPS directories. Run each block only after the preceding block succeeds. They do not reset, seed, restore or recreate either database. The helper only changes the named environment settings and makes private backups of the two files. Do not paste those backups or keys into chat.

First pull both correct repositories, keep the old sender stopped, and configure the private test connection. The existing booking image supplies Node 24; its entrypoint is overridden and no app process or network is started by the helper container.

```bash
(
  set +x
  set -e
  cd /opt/max-travel-booking/booking-platform
  git pull --ff-only origin main
  cd /opt/safar-crm
  test -f deploy/.secrets
  test -f deploy/.env.production
  git pull --ff-only origin main
  docker stop max-travel-booking-crm-worker-1
  test -f /opt/max-travel-booking/booking-platform/.env.production
  docker run --rm --network none --user 0:0 --entrypoint node \
    --mount type=bind,src=/opt/max-travel-booking/booking-platform,dst=/booking \
    --mount type=bind,src=/opt/safar-crm/deploy,dst=/safar-deploy \
    max-travel-booking:local /booking/scripts/configure-safar-enquiries.mjs \
    --booking-env /booking/.env.production \
    --safar-env /safar-deploy/.env.production
)
```

Deploy Safar first. Its existing deployment procedure backs up the database and uploaded files, applies pending migrations transactionally, builds and checks application health. The image tag below retains the prior running image; it does not copy or restore the database. Instance settings determine the actual container names.

```bash
(
  set +x
  set -e
  cd /opt/safar-crm
  test -f deploy/.secrets
  test -f deploy/.env.production
  . deploy/instance.sh
  rollback_tag="safar-crm:before-max-ai-$(date +%Y%m%d%H%M%S)"
  docker tag "$(docker inspect -f '{{.Image}}' "$APP_CONTAINER")" "$rollback_tag"
  printf 'Retained app image: %s\n' "$rollback_tag"
  bash deploy/deploy.sh
)
```

Then deploy booking migration 025 and the app. The historical `migrate-company-settings.mjs` name runs all registered migrations, including 024 and 025, using owner credentials only for that one-off process. The running app keeps its restricted database credentials. Compose still requires database-password interpolation for app-only operations; the subshell reads the existing value without printing or persisting it.

```bash
(
  set +x
  set -e
  cd /opt/max-travel-booking/booking-platform
  POSTGRES_PASSWORD="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_PASSWORD)"
  POSTGRES_USER="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_USER)"
  test -n "$POSTGRES_PASSWORD"
  test -n "$POSTGRES_USER"
  export POSTGRES_PASSWORD POSTGRES_USER
  docker compose --env-file .env.production -f compose.production.yaml build app
  docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
    -e POSTGRES_PASSWORD -e POSTGRES_USER app node scripts/migrate-company-settings.mjs
  docker compose --env-file .env.production -f compose.production.yaml \
    up -d --no-deps --force-recreate --wait app
  docker exec max-travel-booking-app-1 node scripts/check-safar-enquiries.mjs
  docker compose --env-file .env.production -f compose.production.yaml --profile enquiries \
    up -d --no-deps --force-recreate --wait enquiry-worker
  docker compose --env-file .env.production -f compose.production.yaml --profile enquiries ps app enquiry-worker
)
```

The diagnostic reads configuration presence, schema readiness and queue counts. It authenticates a deliberately invalid `{}` body against Safar and requires the exact validation rejection before database ingestion. It sends no valid enquiry, creates no record and prints no keys or customer details. This proves connectivity and signature validation, not end-to-end delivery or enquiry permissions. If it fails, the block stops before launching the new sender. Do not bypass the failure by starting the old CRM worker.

## Acceptance and rollback

After the diagnostic passes, explicitly submit an identified test enquiry through the website review form. It should appear once in booking Operations, retain `Test`, receive a matching Safar receipt and appear under **Website enquiries → Test enquiries**. The Live view should remain unchanged. Test each service, uncertain-response recovery, assignment and permitted budget visibility on desktop and mobile. Do not use real customer data for a synthetic check. Saving a test enquiry creates an isolated enquiry record, so this acceptance step is deliberate rather than part of the read-only diagnostic.

If there is a problem, stop only `max-travel-booking-enquiry-worker-1`. Retain queued and saved enquiries. The new schema is additive; routine app rollback should keep it and all existing data. Do not restore an older Safar database dump or run reset/seed/clean-start commands to roll back application code, because real transactions may have occurred since the backup. Restore the retained application image through the established instance deployment process if needed.

## Local verification and limits

Safar's PostgreSQL harness executes all 50 committed migrations in isolated PGlite. It exercises signed ingestion, test/live separation, replay conflicts, assignment, MFA, staff scope and budget projection. It fingerprints 25 existing business tables and numbering sequences before and after migration/import/triage and requires them to remain unchanged. The browser suite imports the actual inbox UI with synthetic responses at desktop, mobile and 320px widths; it does not bypass production login.

Booking passed 736 tests, TypeScript, ESLint, production build and all worker bundles. Its 48 selected desktop/mobile enquiry cases passed; Safar's 20 inbox cases also passed. Booking tests cover confirmation/consent, actor-scoped persistence, immutable retries, strict receipts and a PostgreSQL queue harness executing all 25 migrations, preserving unrelated test events and holding historical destinations. Setup/diagnostic cases check secret-free output, key preservation, rollback and read-only SQL.

These local checks do not prove deployed networking, live Supabase/PostgREST configuration or multi-process database concurrency. Deployment health, the signed no-write diagnostic and a deliberate test enquiry are separate acceptance steps. No live transaction records were used in local tests. The booking build reports an existing Next.js security advisory; its dependency upgrade remains separate from this integration correction.
