# Deploy booking-flow audit fixes

Run in a VPS shell. The subshell keeps database values out of command output and clears its environment on exit. No schema migration or new environment setting is required for this patch. Rebuild the shared image and recreate the booking worker as well as the app because cancellation comparison is used in both.

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
  docker compose --env-file .env.production -f compose.production.yaml up -d --no-deps --force-recreate --wait app booking-worker refund-worker
  git log -1 --oneline
  docker compose --env-file .env.production -f compose.production.yaml ps
  curl -fsS http://127.0.0.1:3108/api/health
)
```

## Package catalogue dependency

The booking app's upstream public URL returned a redirect to `/login` during the audit. The latest `alpesh15gb/MaxTravel` CRM source includes `/api/public/travel-packages`. Updating only the booking app cannot correct an outdated CRM deployment or a reverse-proxy authentication redirect.

Read-only check (do not follow redirects):

```bash
curl -sS --max-time 15 -o /dev/null -w 'Catalogue HTTP: %{http_code}\nRedirect: %{redirect_url}\n' https://crm.maxtravel.in/api/public/travel-packages
```

For the repository's documented CRM deployment layout, deploy using its existing backup/migration/rollback script:

```bash
(
  set -e
  cd /opt/max-travel-crm
  git pull --ff-only origin main
  test -r /opt/max-travel-crm-secrets/crm.env
  bash deploy/crm-deploy.sh
  curl -sS --max-time 15 -o /dev/null -w 'Catalogue HTTP: %{http_code}\nRedirect: %{redirect_url}\n' https://crm.maxtravel.in/api/public/travel-packages
)
```

Expected catalogue HTTP 200, without a redirect. If the documented directory/secrets layout does not exist, stop and inspect the existing CRM deployment configuration; do not substitute the Safar CRM checkout. If it still redirects after deploying, inspect the public route's reverse-proxy authentication rules. Keep private CRM/admin routes protected.

## After deployment

Check flight selection/reload, a connecting itinerary, hotel room review/recovery, refreshed cancellation terms, promo apply/remove/rejection, and pricing controls at desktop and mobile sizes. Supplier 6001 requires supplier-side investigation if it recurs; the UI recovery does not claim to fix that upstream rejection. Do not retry an existing captured booking as part of this test.
