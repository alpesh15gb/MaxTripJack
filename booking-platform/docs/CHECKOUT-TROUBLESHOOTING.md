# Checkout and verification diagnostics

The Email/WhatsApp switches and payment configuration endpoint report whether settings are present. They do not prove that Evolution can send a message, that the travel supplier is responding, or that Razorpay accepts the credentials.

## Read-only check on the existing VPS

After pulling the latest code, this command can inspect the currently running image even before it is rebuilt:

```bash
cd /opt/max-travel-booking/booking-platform
git pull --ff-only origin main
docker exec -i max-travel-booking-app-1 node --input-type=module - --check-razorpay \
  < scripts/diagnose-checkout.mjs
```

The report contains booleans, fixed status labels and HTTP status codes. It does not print credentials, phone numbers, OTPs, customer records, order bodies or wallet balances. Checks use only provider GET requests and read-only database schema/permission queries. No message, order, booking or payment is created. The optional `--check-razorpay` flag checks credentials only when a test key is configured; omit it to skip that probe.

- `evolution.state` should be `open`. For this VPS, `configuration.evolutionExpectedInstanceMatch` checks the selected instance name `max travel`; this is the API instance name, not its WhatsApp display name. A different intentional instance can be valid even when this flag is false.
- Evolution HTTP 401/403 suggests rejected credentials or access; 404 suggests the configured instance or route could not be found. `open` establishes a connection state, not successful OTP delivery.
- `database.challengeTablePresent`, each challenge-table privilege, and the phone column/privilege flags should be true. Checks use the application's actual runtime `DATABASE_URL`, so a successful owner-account migration alone cannot mask missing runtime permissions. See [WhatsApp setup](CHECKOUT-WHATSAPP-VERIFICATION.md) for the existing migration helper if any schema or permission flag is missing.
- `tripjack.flight` and `tripjack.hotel` independently probe the same account endpoint checked before a new payment order is created. `success: true` and `walletBalanceFinite: true` do not establish that the wallet covers a particular booking; the checkout route checks that amount itself. A supplier failure can prevent Razorpay from opening before its SDK is even loaded.
- `razorpayCredentialCheck.authentication: accepted` establishes test API credential acceptance, not browser SDK availability or a successful payment.
- `diagnostic_timeout` applies only to this probe's 12-second limit. It does not establish that the normal supplier request, which has a different timeout, will fail.

After the new image is installed, the equivalent command is:

```bash
docker exec max-travel-booking-app-1 node scripts/diagnose-checkout.mjs --check-razorpay
```

## Install the checkout recovery update

This update does not add another database migration. The earlier WhatsApp schema migration must already be installed. Rebuild and recreate only the app; obtain the existing database password in a subshell so Compose can interpolate its configuration without changing the database:

```bash
cd /opt/max-travel-booking/booking-platform
(
  set +x
  set -e
  POSTGRES_PASSWORD="$(docker exec max-travel-booking-postgres-1 printenv POSTGRES_PASSWORD)"
  test -n "$POSTGRES_PASSWORD" || exit 1
  export POSTGRES_PASSWORD
  docker compose --env-file .env.production -f compose.production.yaml \
    up -d --build --no-deps --force-recreate --wait app
)
```

The Razorpay loader now stops after 15 seconds if the SDK does not load. A failed load or launch preserves the payment order and presents **Resume secure checkout**. Explicit resume retries the SDK with the same verified order; it does not automatically create another order or attempt a payment. An expired or uncertain order still requires checking My trips.

## Hotel room review pairing

TripJack's [Hotel v3 contract](https://tripjack.com/page/api-doc) requires the selected room option and review hash from the same pricing response. The previous checkout fetched pricing again during review and compared the original option ID with that new response, which could reject the selection before reaching payment.

The app now keeps a bounded, private copy of the option IDs, availability flags and matching hash on the owned search record. Sign-in retains that record. Review uses the exact saved pair and asks TripJack to confirm its current availability and price; the hash is never sent to the browser. Context expires after ten minutes or when the search expires, whichever comes first. Refreshing a hotel's room options replaces its previous context, so an older selection must be chosen again; a different room is never substituted automatically.

After deploying this update, start a **new hotel search** and choose a room again. Searches made before the update have no saved detail context. This fix uses the existing search JSON field and requires no database migration. A successful supplier review and payment launch still need verification on the deployed site.

## WhatsApp failures after updating

Request a code once using your own test number. Then collect only the new transport diagnostics:

```bash
docker logs --since 10m max-travel-booking-app-1 2>&1 | grep -F 'WhatsApp transport'
```

A failed send records a fixed reason and, when available, the provider HTTP status. It never records the message, code, recipient, instance, key or provider error body. HTTP 400 is not enough to conclude that the phone number is wrong; Evolution can also reject a send for instance/session problems. A timeout or unconfirmed acknowledgement may still deliver a message, so wait before requesting another code.
