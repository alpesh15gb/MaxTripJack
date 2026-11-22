# Deploy booking-flow audit fixes

Run in a VPS shell after the release is available on `origin/main`. The subshell keeps database values out of command output. Apply migration `033-office-enquiries.sql` before publishing the enquiry forms. The booking worker needs the same release for international booking contacts.

```bash
(
  set +x
  set -e
  cd /opt/max-travel-booking/booking-platform
  git switch main
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
    up -d --no-deps --no-build --pull never --force-recreate --wait booking-worker
  docker compose --env-file .env.production -f compose.production.yaml \
    up -d --no-deps --no-build --pull never --force-recreate --wait app
  git log -1 --oneline
  docker compose --env-file .env.production -f compose.production.yaml ps app booking-worker
  curl -fsS --max-time 15 http://127.0.0.1:3108/api/health
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
(
  set -e
  for path in privacy-policy terms-of-use; do
    html="$(curl -fsS --max-time 15 -H 'Host: maxtravel.in' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:3108/$path")"
    grep -Fq 'class="legal-site public-refresh"' <<< "$html"
    printf 'Booking app serves /%s\n' "$path"
  done
)
```

Back up and edit the active configuration for the booking hostname.

```bash
sudo cp -a /etc/nginx/conf.d/maxtravel-booking.conf "/root/maxtravel-booking.conf.$(date +%Y%m%d-%H%M%S).bak" &&
  sudoedit /etc/nginx/conf.d/maxtravel-booking.conf
```

In the HTTPS server block for `maxtravel.in`, replace the legacy handlers for both paths with the two exact-match locations from [the booking Nginx template](../deploy/nginx.conf). If a broader static location catches these URLs, add the exact matches to the HTTPS block. Preserve the existing certificate configuration and unrelated locations.

```bash
(
  set -e
  sudo nginx -t
  sudo systemctl reload nginx
  for path in privacy-policy terms-of-use; do
    html="$(curl -fsS --max-time 15 "https://maxtravel.in/$path")"
    grep -Fq 'class="legal-site public-refresh"' <<< "$html"
    printf 'Live Stitch policy verified at /%s\n' "$path"
  done
)
```

## After deployment

Check flight selection, a connecting itinerary, hotel room review, refreshed cancellation terms, promo apply/remove, and pricing controls on desktop and mobile. Use a verified test account with a known PNR to check My Trips. Check the Bus and Partnership forms in **Operations → Enquiries**, where their destination appears as **Booking desk only**. Verify international contacts and seat assignments with Tripjack UAT before accepting live payments. Supplier error 6001 requires supplier investigation if it recurs.
