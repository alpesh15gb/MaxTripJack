# WhatsApp or email verification

Customers can choose Email or WhatsApp inside flight and hotel checkout. WhatsApp uses the configured Evolution API v2 instance; email keeps the existing SMTP transport. Neither method reserves travel or starts payment. The selected fare or room stays in the booking workspace.

## Configure the existing Evolution instance

Add these server-only settings to `.env.production`:

```dotenv
EVOLUTION_API_URL=http://host.docker.internal:8084
EVOLUTION_API_KEY=YOUR_EXISTING_EVOLUTION_API_KEY
EVOLUTION_INSTANCE="YOUR_CONNECTED_INSTANCE_NAME"
```

The production Compose file maps `host.docker.internal` to the VPS host gateway. This URL addresses an Evolution installation published on host port 8084 from inside the app container. For a different deployment, use its reachable private URL or HTTPS URL. Instance names are case-sensitive; spaces are supported and encoded in the request path. Keep the key out of Git and browser configuration. No Evolution webhook is required for OTP verification.

The WhatsApp choice appears when the three settings are valid. This reports configuration availability, not a live connection guarantee. The instance must already be connected in Evolution Manager. Failed requests offer email fallback; a lost acknowledgement leaves the code usable because the message may still arrive. The application never creates or reconnects an Evolution instance or retries a send automatically.

## Upgrade before restarting the app

This release requires **both** the application migration `020-whatsapp-verification` and the updated Better Auth schema migration. New phone columns are selected by ordinary authentication too, so run migrations before starting the new app. The changes are additive.

For the existing `max-travel-booking` Compose deployment, after pulling and updating `.env.production`:

```bash
cd /opt/max-travel-booking/booking-platform
(
  set +x
  set -e
  POSTGRES_PASSWORD="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_PASSWORD)"
  POSTGRES_USER="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_USER)"
  test -n "$POSTGRES_PASSWORD" || exit 1
  test -n "$POSTGRES_USER" || exit 1
  export POSTGRES_PASSWORD POSTGRES_USER

  docker compose --env-file .env.production -f compose.production.yaml build app
  docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
    -e POSTGRES_PASSWORD -e POSTGRES_USER app node scripts/migrate-checkout-identity.mjs

  # Refresh an already-running CRM worker before enabling new phone sign-ins.
  running_services="$(docker compose --env-file .env.production -f compose.production.yaml --profile crm ps --status running --services)"
  if printf '%s\n' "$running_services" | grep -qx 'crm-worker'; then
    docker compose --env-file .env.production -f compose.production.yaml --profile crm up -d \
      --no-deps --force-recreate --wait crm-worker
  fi
  docker compose --env-file .env.production -f compose.production.yaml up -d \
    --no-deps --force-recreate --wait app booking-worker refund-worker maintenance-worker
)
```

The one-off helper uses the existing app database target with the captured owner credentials, or an explicitly supplied `MIGRATION_DATABASE_URL`. It runs the registered application migrations, runs the auth migration, and grants the existing `maxtravel_app` role access to the new challenge table when that role exists. It does not change database passwords or persist owner credentials. Failed migration exits stop the sequence before app replacement. If owner access uses a separate database endpoint, export the correct private `MIGRATION_DATABASE_URL` only inside this subshell and add `-e MIGRATION_DATABASE_URL` to the `run` command. Keep that owner URL out of `.env.production` so the running application retains its restricted database access.

The maintenance worker removes expired phone challenges after one day. The optional CRM restart preserves the updated contact email handling: phone-only accounts export the booking contact email instead of an internal auth alias. This does not start a CRM worker on deployments where that service is unused. All running workers that import the updated database maintenance code must use the new image after migration.

## Customer identity and existing trips

- A WhatsApp code proves ownership of that phone number. A new number creates a customer account with a verified phone, without claiming a verified email.
- Existing email customers can open Account → Connect WhatsApp number, prove the number, and use either method for the same account. An already bound number cannot be reassigned or silently merged. Linking is bound to the signed-in, verified-email account and atomically claims an unbound number.
- Phone-only customers should keep using that number to access their trips. A contact email entered during booking is for travel updates; it does not merge accounts or grant access to existing email-account trips.
- The internal auth schema alias for a phone-only account is hidden from account UI, booking contact prefills, password-reset actions, and CRM customer email. CRM uses the actual booking contact email while preserving the account owner ID.
- Corporate, admin, and operations access still require a verified real email and MFA. Existing authenticator protection also applies when signing in through WhatsApp.

## Verification and validation

Codes are six digits, expire after five minutes, allow five incorrect attempts and are consumed atomically once. Only keyed hashes and hashed identifiers are stored. Sends have per-phone and request limits; resending rotates the code. Purpose and account binding prevent a sign-in code from connecting a number to another account.

Automated tests use synthetic provider responses or local test HTTP servers; they never send real WhatsApp messages. After deployment, use your own test inbox and WhatsApp number to check both channels, then confirm that flight and hotel selections survive verification. Test an existing email account's linking flow before expecting both methods to show its trips.

The v2 transport uses `POST /message/sendText/{instance}` with top-level `number`, `text` and `linkPreview`, matching the [Evolution 2.3.7 source schema](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/validate/message.schema.ts). Provider acceptance is not a delivery or read receipt.
