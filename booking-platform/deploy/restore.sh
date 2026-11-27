#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 && "$1" = "--replace-database" && -f "$2" && -s "$2" ]] || { echo "Usage: restore.sh --replace-database /absolute/archive.dump (replaces existing data)" >&2; exit 1; }
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose --project-directory "$app_root" --env-file "$app_root/.env.production" -f "$app_root/compose.production.yaml" --profile '*')
"${compose[@]}" exec -T postgres pg_restore --exit-on-error --file=/dev/null < "$2"
services="$("${compose[@]}" config --services)"
writers=()
while IFS= read -r service; do
  if [[ -n "$service" && "$service" != postgres ]]; then
    writers+=("$service")
  fi
done <<< "$services"
if (("${#writers[@]}")); then
  "${compose[@]}" stop "${writers[@]}"
fi
"${compose[@]}" exec -T postgres pg_restore -U maxtravel -d maxtravel --clean --if-exists --single-transaction < "$2"
echo "Restore complete. Verify the database and encryption secrets before restarting services."
