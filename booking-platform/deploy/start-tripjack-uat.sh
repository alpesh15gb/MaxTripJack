#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

revision=0deb36a8426f8b98afe2e7b12ef5bae210c962fc
image=max-travel-booking:uat-0deb36a
project=max-travel-uat-0deb36a
state="/root/$project"
source_app="${1:-max-travel-booking-app-1}"

if [[ $EUID != 0 ]]; then
  echo 'Run on Apex as root.' >&2
  exit 1
fi

exec 9>"$state.lock"
flock -n 9
if [[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") != "$revision" ]]; then
  echo 'The UAT candidate image must carry the audited revision label.' >&2
  exit 1
fi

if [[ ! -d $state ]]; then
  if docker volume inspect "${project}_database" >/dev/null 2>&1 ||
     [[ -n $(docker ps -aq --filter "label=com.docker.compose.project=$project") ]]; then
    echo 'Existing UAT resources have no matching private setup directory. Inspect them before retrying.' >&2
    exit 1
  fi
  if [[ $(docker inspect --type container --format '{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}}' "$source_app") != 'max-travel-booking app' ]]; then
    echo 'The credential source must be the existing booking app container.' >&2
    exit 1
  fi

  staging=$(mktemp -d "$state.XXXXXXXX")
  trap 'rm -f -- "$staging"/{runtime.env,postgres.env,migration.env,compose.env,compose.yaml}; rmdir -- "$staging"' EXIT
  # Transfer only the existing UAT supplier and gateway test credentials into a private file.
  docker exec -i "$source_app" node - >"$staging/runtime.env" <<'NODE'
const keys = ['TRIPJACK_FLIGHT_API_KEY', 'TRIPJACK_HOTEL_API_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const values = keys.map(key => [key, process.env[key]?.trim() ?? '']);
if (values.some(([, value]) => !value || /[\x00-\x1f\x7f]/.test(value)) ||
    !/^rzp_test_[A-Za-z0-9]+$/.test(process.env.RAZORPAY_KEY_ID?.trim() ?? '')) {
  console.error('Both TripJack keys and a valid Razorpay test key and secret must be configured.');
  process.exit(1);
}
for (const [key, value] of values) console.log(`${key}=${value}`);
NODE
  owner_password=$(openssl rand -hex 32)
  runtime_password=$(openssl rand -hex 32)
  auth_secret=$(openssl rand -hex 32)
  encryption_key=$(openssl rand -hex 32)
  cat >>"$staging/runtime.env" <<ENV
DATABASE_URL=postgresql://maxtravel_app:$runtime_password@postgres:5432/booking_uat
BETTER_AUTH_URL=http://127.0.0.1:43108
BETTER_AUTH_SECRET=$auth_secret
TRAVELLER_ENCRYPTION_KEY=$encryption_key
PAYMENT_PROVIDER=RAZORPAY
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
MAIL_FROM=Max Travel UAT <noreply@example.test>
SEO_INDEXING_ENABLED=false
MAX_AI_ENABLED=false
SEARCH_PREWARM_ENABLED=false
GUEST_CHECKOUT_ENABLED=false
ENV
  cat >"$staging/postgres.env" <<ENV
POSTGRES_DB=booking_uat
POSTGRES_USER=uat_owner
POSTGRES_PASSWORD=$owner_password
ENV
  cat >"$staging/migration.env" <<ENV
MIGRATION_DATABASE_URL=postgresql://uat_owner:$owner_password@postgres:5432/booking_uat
RUNTIME_DATABASE_PASSWORD=$runtime_password
BETTER_AUTH_URL=http://127.0.0.1:43108
BETTER_AUTH_SECRET=$auth_secret
ENV
  : >"$staging/compose.env"
  cat >"$staging/compose.yaml" <<'YAML'
x-booking: &booking
  image: max-travel-booking:uat-0deb36a
  pull_policy: never
  read_only: true
  cap_drop: [ALL]
  security_opt: [no-new-privileges:true]
  tmpfs:
    - /tmp
    - /app/.next/cache:uid=10001,gid=10001,mode=0700
  env_file:
    - path: runtime.env
      format: raw
services:
  postgres:
    image: postgres:17-alpine
    env_file:
      - path: postgres.env
        format: raw
    volumes: [database:/var/lib/postgresql/data]
    healthcheck:
      test: [CMD, pg_isready, -h, 127.0.0.1, -U, uat_owner, -d, booking_uat]
      interval: 3s
      timeout: 3s
      retries: 25
  mailpit:
    image: ghcr.io/axllent/mailpit:v1.34.0@sha256:23a2ef85bc50853ab3093645d1d64679afd8887e89da5e48a88940c172591a4e
    ports: ['127.0.0.1:48025:8025']
  migration:
    <<: *booking
    profiles: [setup]
    env_file:
      - path: migration.env
        format: raw
  app:
    <<: *booking
    ports: ['127.0.0.1:43108:3000']
    healthcheck:
      test: [CMD, node, -e, "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 3s
      timeout: 3s
      retries: 20
  booking-worker:
    <<: *booking
    command: [node, --conditions=react-server, --import, ./scripts/standalone-server.mjs, dist/booking-worker.mjs]
  cancellation-worker:
    <<: *booking
    command: [node, --conditions=react-server, --import, ./scripts/standalone-server.mjs, dist/cancellation-worker.mjs]
  refund-worker:
    <<: *booking
    command: [node, --conditions=react-server, --import, ./scripts/standalone-server.mjs, dist/refund-worker.mjs]
volumes:
  database:
YAML
  mv -T -- "$staging" "$state"
  trap - EXIT
fi

compose=(docker compose --project-name "$project" --project-directory "$state" --env-file "$state/compose.env" -f "$state/compose.yaml")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait --wait-timeout 90 postgres mailpit
"${compose[@]}" run --rm --no-deps -T --interactive=false migration node scripts/migrate.mjs
"${compose[@]}" run --rm --no-deps -T --interactive=false migration node --conditions=react-server --import ./scripts/standalone-server.mjs dist/migrate-auth.mjs
"${compose[@]}" run --rm --no-deps -T --interactive=false migration node scripts/provision-runtime-role.mjs
"${compose[@]}" up -d --no-deps --wait --wait-timeout 90 app

"${compose[@]}" exec -T app node --input-type=module -e '
import { diagnoseCheckout } from "./scripts/diagnose-checkout.mjs";
const { local, tripjack, razorpayCredentialCheck } = await diagnoseCheckout({ checkRazorpay: true });
console.log(JSON.stringify({ local, tripjack, razorpayCredentialCheck }, null, 2));
if (local.health.status !== "ready" || local.authChannels.email !== true ||
    local.paymentsConfig.provider !== "RAZORPAY" || local.paymentsConfig.configured !== true ||
    razorpayCredentialCheck.authentication !== "accepted" ||
    Object.values(tripjack).some(account => account.success !== true || !account.walletBalanceFinite)) {
  process.exitCode = 1;
}
' </dev/null

"${compose[@]}" up -d --no-deps --wait --wait-timeout 90 booking-worker cancellation-worker refund-worker
for attempt in {1..10}; do
  active_workers=$("${compose[@]}" exec -T postgres sh -c '
    PGPASSWORD="$POSTGRES_PASSWORD" exec psql -Atq -v ON_ERROR_STOP=1 -h 127.0.0.1 -U uat_owner -d booking_uat
  ' <<'SQL'
SELECT count(*) FROM worker_heartbeats
WHERE name IN ('bookings', 'cancellations', 'refunds') AND last_seen > now() - interval '15 seconds';
SQL
  )
  if [[ $active_workers == 3 ]]; then
    break
  fi
  sleep 2
done
if [[ $active_workers != 3 ]]; then
  echo 'One or more UAT workers have not written a recent heartbeat.' >&2
  exit 1
fi
echo 'All three UAT workers are reporting heartbeats.'
"${compose[@]}" ps --status running
