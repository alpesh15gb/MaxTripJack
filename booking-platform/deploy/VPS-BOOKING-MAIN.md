# Deploy booking main on Apex

Use the Apex root terminal during a maintenance window. The command targets the existing booking project and its running workers at `maxtravel.in`. It reads the active Compose files and container settings, including the PostgreSQL password needed to resolve Compose interpolation. The release checkout contains no production environment file.

## Inspect the reviewed revision

Replace `REVIEWED_MAIN_SHA` with the full commit approved for this deployment. Keep the same root shell for both steps.

```bash
umask 077
repo=/opt/max-travel-booking
revision=REVIEWED_MAIN_SHA
git -C "$repo" fetch --no-tags origin refs/heads/main &&
  test "$(git -C "$repo" rev-parse 'FETCH_HEAD^{commit}')" = "$revision" &&
  release_dir="$(mktemp -d /root/maxtravel-booking-main-XXXXXX)" &&
  mkdir "$release_dir/source" &&
  (set -o pipefail
   git -C "$repo" archive --format=tar "$revision:booking-platform" |
     tar -xf - -C "$release_dir/source") &&
  python3 -B "$release_dir/source/deploy/vps-deploy-booking-main.py" "$revision"
```

Confirm the inspection lists the expected app, workers and pending booking migrations. It should report **Inspection complete**. A discrepancy stops the deployment before any stop, migration or restart.

## Apply and verify

```bash
flock -n /run/lock/max-travel-booking-release.lock \
  python3 -B "$release_dir/source/deploy/vps-deploy-booking-main.py" "$revision" --apply &&
  curl -fsS --max-time 15 http://127.0.0.1:3108/api/health &&
  curl -fsS --max-time 15 -o /dev/null https://maxtravel.in/destinations
```

The operator builds a revision-labelled image before stopping the booking app and running workers, checks a PostgreSQL backup, and applies pending booking and authentication migrations, including booking migration `035-flight-price-alerts`. The app must report `ready` before the same workers restart on the new image. The script verifies the PostgreSQL container identity after rollout and keeps runtime database credentials restricted.

Running workers resume processing their existing queues after rollout.

Check the revision label and the status of the running services with these read-only commands.

```bash
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "$(docker inspect --format '{{.Image}}' max-travel-booking-app-1)"
docker ps --filter 'label=com.docker.compose.project=max-travel-booking' \
  --format 'table {{.Names}}\t{{.Status}}'
```

Keep the private rollout directory printed by the script. Before migrations start, the script attempts to resume the original images if cutover fails. After `migration-started.json` appears, use the private logs, original Compose snapshot, and verified dump to assess recovery before starting an old image or restoring data.

Price alerts require separate production TripJack Air Search and SMTP activation. See [Flight price alerts](../docs/FLIGHT-PRICE-ALERTS.md).
