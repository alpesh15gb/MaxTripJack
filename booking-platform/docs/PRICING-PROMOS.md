# Pricing rules and promo codes

Staff require verified email, enabled authenticator and `pricing:manage`.

- `/operations?desk=pricing`: open an active record to edit or remove it. Editing
  publishes a replacement, checks that the original is still active, and preserves
  history. Removal deactivates the rule. A removed corporate rule falls back to the
  public rule. Existing quotes and bookings retain their totals.
- Fixed service fee and percentage service fee can be combined. The percentage
  uses the complete Tripjack supplier amount, rounded to the nearest paise, once
  per quote. It does not use the marked-up selling price. For ₹10,000 supplier cost,
  10% markup + ₹50 fixed markup + 2% service fee + ₹25 fixed fee = ₹11,275.
- `/operations/promos`: create, edit or disable a code. Choose fixed INR or a
  percentage of the selling price, flight/hotel/both eligibility, minimum value,
  expiry and an optional maximum discount. The expiry input uses the browser's
  local timezone and is stored in UTC. Code names are unique and cannot be renamed.
  Codes are reusable; this version has no usage-count or per-customer limits.
  Existing and new codes are private by default. Enable **Show in checkout offers**
  to share a code with checkout customers whose current booking qualifies. Leave
  it unchecked for codes you distribute directly.
- Review & pay accepts one code per new booking. Discounts are capped at the
  available difference between selling price and supplier cost. The customer sees
  the actual discount. **Available offers** shows eligible public codes, the saving
  calculated for the current quote, the minimum booking value where applicable,
  and expiry. Customers can also enter a code manually. The supplier amount is
  never discounted.
- Applying/removing is server-calculated against an owned, unexpired quote, under
  a row lock. Reapplication does not stack. Changing extras clears the discount;
  reviewing a new quote requires applying the code again. A payment already
  started cannot change its code or amount. Before creating an order, the server
  rechecks the promo's active state, expiry and calculated amount. Promo details
  are recorded on the order for audit. Existing payment recovery retains its
  original amount even if the promotion is later disabled.

## Deployment

Migrations 022 and 023 are additive and required before starting the new app image.
Migration 023 adds checkout visibility with a private default for all existing codes.
The existing owner-credential migration wrapper runs all pending migrations.
No SMTP, payment or pricing environment changes are needed.

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
    up -d --no-deps --force-recreate --wait app
)
```

After deployment, test an edited rule using a fresh flight and hotel search.
Create a private promotion and a promotion with **Show in checkout offers** enabled.
At Review & pay, verify that only the eligible public code appears in **Available
offers**. Apply and remove it, then enter the private code manually and verify
the discounted amount before opening payment. Local automated UI tests use synthetic
inventory and payment stubs. They do not book travel or prove a VPS migration.
