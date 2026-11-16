# Company settings and pricing

Company identity: `/operations/settings` (existing `companies:manage` permission).
Pricing: `/operations?desk=pricing` (`pricing:manage`). Both require verified email,
2FA and an active staff grant. Corporate customer accounts remain a separate desk.

Company settings include trading/legal name, optional GSTIN, support contacts,
Indian office address, office days/hours, Maps link and a PNG/JPEG logo. Saving is
version-checked, audited with before/after details (logo hash only), and used on
subsequent website requests, generated vouchers and outgoing mail signatures and
Reply-To. Sender credentials and MAIL_FROM remain environment-controlled. No
email is sent by the settings screen. Existing downloaded PDFs and sent emails
are not modified. Archived original PDFs are not stored by this change.

Pricing rules are per FLIGHT/HOTEL and public/corporate audience. A corporate
rule replaces the public rule. Fixed markup and service fee apply once per quote.
Choose percentage markup OR target margin. Markup rounds to the nearest paise;
margin rounds up to the next paise. Fixed markup and fee are added afterward.

- 10% markup on INR 10,000 = INR 11,000 before fixed charges.
- 10% target margin on INR 10,000 = INR 11,111.12 before fixed charges.
- Target margin excludes gateway fees, taxes and other costs; it is not net profit.
- Publishing replaces the active rule for the chosen scope and preserves history.
- All zeros produce no uplift for that scope. Existing orders retain their totals;
  existing unexpired quotes retain their quoted price until normal refresh/review.

## Deploy on the current VPS

Run as the existing deployment user. This reads owner credentials from the
existing Postgres container without printing them, uses them only for the
one-off migration, and does not recreate Postgres. Migration 021 is additive.

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
  services=(app booking-worker)
  if [ "$(docker inspect max-travel-booking-notification-worker-1 --format '{{.State.Running}}' 2>/dev/null || true)" = true ]; then
    services+=(notification-worker)
  fi
  docker compose --env-file .env.production -f compose.production.yaml \
    up -d --no-deps --force-recreate --wait "${services[@]}"
)
```

The notification worker is recreated only if it is already running. This avoids
enabling a previously disabled notification queue as a side effect of deployment.

After deployment, open company settings and save the verified details. Confirm
public Contact/Office pages, download an existing voucher, and review a pricing
rule's sample calculation. Verify real mail delivery through the existing SMTP
setup. Local UI checks use mocked admin APIs; the VPS migration and real delivery
are deployment checks, not claimed as locally verified.
