#!/usr/bin/env bash
set -euo pipefail
umask 077
destination="${1:?Usage: backup.sh /absolute/backup-directory}"
[[ "$destination" = /* ]] || { echo "Use an absolute backup directory." >&2; exit 1; }
mkdir -p -- "$destination"
target="$destination/maxtravel-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_dump -U maxtravel -Fc maxtravel > "$target"
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_restore --list < "$target" >/dev/null
echo "Database backup written and archive verified: $target"
