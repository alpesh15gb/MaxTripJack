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

The booking app's public package feed returned a redirect to `/login` during the audit. The booking app now serves its own enquiry-only trip ideas when the published feed is unavailable. It uses the published feed again on the first successful request. No CRM deployment or configuration changes are needed for the fallback.

Read-only check (do not follow redirects):

```bash
curl -sS --max-time 15 -o /dev/null -w 'Catalogue HTTP: %{http_code}\nRedirect: %{redirect_url}\n' https://crm.maxtravel.in/api/public/travel-packages
```

## Privacy Policy and Terms of Use routing

The live booking hostname previously served static copies at `/privacy-policy` and `/terms-of-use`. The booking app now renders both URLs with the Stitch layout and original published wording. After rebuilding the booking app, check the app's direct response before changing the proxy:

```bash
for path in privacy-policy terms-of-use; do
  curl -fsS -H 'Host: maxtravel.in' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:3108/$path" |
    grep -o 'class="[^"]*stitch-theme[^"]*"' | head -1
done
```

In the active Nginx server block for `maxtravel.in`, remove the static handlers for those two exact paths if the general `location /` already forwards to the booking app. If the legacy files are matched by a wider static rule, replace the two exact-match locations with proxies using the same upstream and forwarded headers as the booking app's `location /`. Keep the policy files available for rollback until both public URLs show Stitch. Validate the configuration with `nginx -t`, reload Nginx and check the two public URLs. Apply the routing edit only to the booking hostname.

## After deployment

Check flight selection/reload, a connecting itinerary, hotel room review/recovery, refreshed cancellation terms, promo apply/remove/rejection, and pricing controls at desktop and mobile sizes. Supplier 6001 requires supplier-side investigation if it recurs; the UI recovery does not claim to fix that upstream rejection. Do not retry an existing captured booking as part of this test.
