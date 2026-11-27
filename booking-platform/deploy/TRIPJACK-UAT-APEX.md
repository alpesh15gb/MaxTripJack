# Isolated TripJack UAT on Apex

Use the audited booking image `max-travel-booking:uat-0deb36a` after TripJack confirms Flight and Hotel v3 UAT access from Apex. Set `helper_revision` to the reviewed setup commit from the deployment handoff, then run the following from the repository as root. Docker Compose 2.30 or later supports raw environment files, which preserve the existing UAT credential values. [Docker Compose environment files](https://docs.docker.com/reference/compose-file/services/#env_file)

```bash
(
  set -euo pipefail
  git fetch origin codex/launch-readiness
  setup=$(mktemp)
  trap 'rm -f -- "$setup"' EXIT
  git show "${helper_revision:?Set the reviewed helper revision}:booking-platform/deploy/start-tripjack-uat.sh" >"$setup"
  bash "$setup" "${app:-max-travel-booking-app-1}"
)
```

The script verifies the candidate revision and creates the `max-travel-uat-0deb36a` project with a dedicated PostgreSQL volume, app, Mailpit, and booking, cancellation and refund workers. It copies only the two supplier keys and the Razorpay test key and secret from the existing app. The credentials and new database and session secrets are stored under `/root/max-travel-uat-0deb36a`. Keep those files private. Booking workers start after the isolated checkout preflight succeeds. Retry the same command to reuse the private configuration and database.

Open a new terminal on the workstation. Run the SSH tunnel command at the local prompt, before signing into Apex in that terminal. Keep that terminal open during testing.

```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:43108:127.0.0.1:43108 -L 127.0.0.1:48025:127.0.0.1:48025 root@APEX_HOST
```

Open `http://127.0.0.1:43108/account` in a fresh browser profile and register `traveller-uat@example.test`. Retrieve its verification link from Mailpit at `http://127.0.0.1:48025`, preferably in a separate browser profile. The verification link uses the same `127.0.0.1:43108` origin. Use TripJack-approved traveller details and scenarios for supplier submissions. [Mailpit Docker configuration](https://mailpit.axllent.org/docs/install/docker/)

## Booking and after-sales acceptance

1. Start with one approved domestic flight. Review the fare and complete Razorpay Test Mode checkout. In My Trips, wait for **Ticketed** and verify the itinerary and ticket reference.
2. Before the hotel case, sync TripJack city regions into the isolated database with the command below. Book an approved refundable rate, verify the **Confirmed** status and voucher, then check the cancellation offer against the reviewed terms.
3. Use separate approved tickets for extras, reissue and cancellation so one change does not invalidate another case. Verify paid and free extras by traveller and segment. Verify the reissued itinerary and the original ticket's affected segments. Exercise full and partial flight cancellation and full hotel cancellation through staff offer, customer acceptance, staff submission and final status. Reconcile any eligible refund against the same Razorpay test payment.

Run these commands in the Apex shell after startup. The Compose function targets the isolated project and directory explicitly.

```bash
uat_compose() {
  local state=/root/max-travel-uat-0deb36a
  docker compose --project-name max-travel-uat-0deb36a \
    --project-directory "$state" --env-file "$state/compose.env" \
    -f "$state/compose.yaml" "$@"
}

uat_compose run --rm --no-deps booking-worker node --conditions=react-server \
  --import ./scripts/standalone-server.mjs dist/sync-catalogue.mjs
```

For staff cancellation and refund actions, register `staff-uat@example.test`, verify it through Mailpit, and enable two-factor authentication from the account page. Then grant the test account the required permissions in the isolated database. The query should print `INSERT 0 1`.

```bash
uat_compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U uat_owner -d booking_uat' <<'SQL'
INSERT INTO admin_grants (user_id, permissions, active)
SELECT id, ARRAY['bookings:read', 'finance:read', 'cancellations:manage', 'cancellations:execute',
                 'refunds:manage', 'refunds:execute'], true
FROM "user"
WHERE email = 'staff-uat@example.test' AND "emailVerified" AND "twoFactorEnabled"
ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions, active = true;
SQL
```

Record only sanitized status, amounts and test references. The private SSH tunnel supports browser payment verification. Test signed Razorpay webhook delivery and CRM integration separately on an approved UAT endpoint.
