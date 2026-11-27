#!/usr/bin/env bash
set -euo pipefail
umask 077
destination="${1:?Usage: backup.sh /absolute/backup-directory}"
[[ "$destination" = /* ]] || { echo "Use an absolute backup directory." >&2; exit 1; }
mkdir -p -- "$destination"
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose --project-directory "$app_root" --env-file "$app_root/.env.production" -f "$app_root/compose.production.yaml")
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$(mktemp "$destination/.maxtravel-$timestamp.XXXXXXXX")"
trap 'rm -f -- "$archive"' EXIT
target="$destination/${archive##*/.}.dump"
"${compose[@]}" exec -T postgres pg_dump -U maxtravel -Fc maxtravel > "$archive"
[[ -s "$archive" ]] || { echo "Database backup is empty." >&2; exit 1; }
"${compose[@]}" exec -T postgres pg_restore --exit-on-error --file=/dev/null < "$archive"
mv -nT -- "$archive" "$target"
[[ ! -e "$archive" ]] || { echo "Backup destination already exists." >&2; exit 1; }
echo "Database backup written and archive verified: $target"
