#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" = "--replace-database" && -f "${2:-}" ]] || { echo "Usage: restore.sh --replace-database /absolute/archive.dump (replaces existing data)" >&2; exit 1; }
docker compose --env-file .env.production -f compose.production.yaml stop app booking-worker crm-worker notification-worker refund-worker cancellation-worker maintenance-worker
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_restore -U maxtravel -d maxtravel --clean --if-exists --exit-on-error < "$2"
echo "Restore complete. Verify the database and encryption secrets before restarting services."
