# Deploy the booking-flow improvements

This release improves flight fare comparison, nearby departure-date navigation,
hotel destination coverage and room selection, and the shared checkout. Traveller
or guest details stay in the mounted checkout when changing a selection; contact
verification remains passwordless. Optional extras are collapsed, the selected
trip stays compact, and phones use one submit button with the reviewed total.
The price breakdown remains available through a disclosure. Expired quotes still
require refreshed terms before payment; an uncertain promo total still blocks
payment until it is confirmed.

Hotel destination continuation requests bounded batches. Each displayed hotel
retains its original server search for room availability and review. A reloaded
property restores its owned server snapshot; loading more restarts destination
browsing so earlier inventory remains reachable. Displayed prices always come
from search or quote responses, including when changing flight dates.

## Schema and configuration

Migration `023-promo-discovery.sql` is additive. It adds checkout visibility to
promo codes, with a private default for existing codes. The existing migration
wrapper applies pending migrations, including prerequisite migration 022 when
needed. Run the migration before recreating the app with this release.

In `/operations/promos`, enable **Show in checkout offers** only for codes intended
to appear in **Available offers** at Review & pay. Existing codes stay private
until that option is enabled. Eligible customers may still enter a private code
manually. Suggestions and savings are calculated for the current owned quote;
they do not change provider prices or pricing rules.

No pricing, payment-provider, supplier, SMTP or authentication environment changes
are required. Keep `.env.production` and its restricted runtime `DATABASE_URL`
unchanged. The commands below pass the existing PostgreSQL owner credentials only
to the one-off migration container. They do not replace runtime credentials or
recreate PostgreSQL.

## Existing VPS deployment

Run these commands only after the reviewed release is available on `origin/main`.
They target the existing `/opt/max-travel-booking/booking-platform` checkout,
`compose.production.yaml`, and `max-travel-booking-postgres-1` container. If those
identities differ, inspect the active deployment before substituting paths or
container names. Retain the existing database backup and previous image for the
normal deployment recovery process.

The subshell disables command tracing before retrieving credentials. Values are
captured without printing them and leave the shell environment when the subshell
exits. Do not add `echo`, `printenv`, `docker compose config` or shell tracing that
would display the captured environment.

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
  docker compose --env-file .env.production -f compose.production.yaml \
    run --rm --no-deps -e POSTGRES_USER -e POSTGRES_PASSWORD \
    app node scripts/migrate-company-settings.mjs
  docker compose --env-file .env.production -f compose.production.yaml \
    up -d --no-deps --force-recreate --wait app booking-worker refund-worker

  git log -1 --oneline
  docker compose --env-file .env.production -f compose.production.yaml ps
  curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3108/api/health
)
```

The shared image is rebuilt once. Only the app, booking worker and refund worker
are recreated; their existing runtime settings remain in effect. A failed build
or migration stops the subshell before service recreation. These instructions
are a deployment procedure, not evidence that deployment has been performed.

## Release validation and post-deployment review

Final release validation passed:

- Unit tests: **639/639** (`npm test`).
- ESLint, Next.js production build and TypeScript checks: **passed**.
- Worker build: **passed**, producing all **9 bundles**.
- Full browser suite: **772/772 passed** with four workers in **8.2 minutes**;
  log: `.artifacts/mmt-flow-release/browser-release.log`.
- Separate payment-unavailable checks: **2/2 passed**, desktop and mobile.

Screenshots were visually reviewed at **1440px desktop**, **390px mobile** and
**320px narrow mobile**. Flight comparison, hotel results and room plans, checkout,
and hotel confirmation retain readable totals and controls without horizontal
clipping. Hotel room plans show full-stay totals, clear cancellation terms and one
Continue action per rate; confirmed stays show guest and room details rather than
flight-ticket placeholders.

Browser validation uses fixture emulation, synthetic inventory and intercepted
payment requests. No real bookings or payments were made. These checks do not
establish live supplier availability, a live database migration or VPS deployment.

Check the following through Review & pay, stopping before payment:

- Compare flight offers, choose a fare, and change a nearby departure date while
  retaining a valid return date, traveller counts and cabin.
- Search a hotel destination, load more stays, inspect rooms, and reload a later
  property's page. Confirm that returning to results and loading more works.
- Change a flight or room after entering details. Confirm valid entries remain,
  optional extras can be skipped, and expired quotes show refreshed terms.
- At phone width, confirm one bottom action, accessible price breakdown, visible
  form fields and no horizontal overflow or overlapping controls.
- Verify public eligible promo offers appear, private codes are absent from the
  suggestions, and applying/removing a code updates the reviewed total. Verify
  an unconfirmed promo result prevents payment until resolved.

Do not create a booking, charge, refund or notification as part of this UI review.
Existing order recovery must continue to use its original order and amount.
