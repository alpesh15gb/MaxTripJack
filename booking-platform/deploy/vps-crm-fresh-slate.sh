#!/usr/bin/env bash
# CRM workspace test data, audit history and business numbers. Default: inspect only.
set -euo pipefail
umask 077

if [[ $# -gt 1 || ( $# -eq 1 && "${1:-}" != "--apply" ) ]]; then
  printf '%s\n' 'Usage: bash vps-crm-fresh-slate.sh [--apply]' >&2
  exit 2
fi

task_reset_tools="$(mktemp -d /root/maxtravel-crm-reset-tools-XXXXXX)"
curl -fsSL 'https://raw.githubusercontent.com/alpesh15gb/MaxTripJack/3412b7d0438e27ae9cca25f2b4e2e98af1c38b58/booking-platform/deploy/vps-update.py' -o "$task_reset_tools/helper.py"
curl -fsSL 'https://raw.githubusercontent.com/alpesh15gb/MaxTravel/5e9d0eb8a32aa6776f82bceff68addb18aa98c0c/scripts/vps-reset-crm.py' -o "$task_reset_tools/reset.py"

printf '%s  %s\n' \
 '5b88f65d42e5b006cdfecc092c254c9196669bb5762ef776a1e75027f44a5fac' "$task_reset_tools/helper.py" \
 'dc9b552be37b2b3e87c14c21102cd859692a35131a8d140e2f2bd4bcb3f409db' "$task_reset_tools/reset.py" | sha256sum --check -

python3 -B "$task_reset_tools/reset.py" --helper "$task_reset_tools/helper.py" --owner-email 'max@maxtravel.us' --clear-audit --reset-business-numbering
if [[ "${1:-}" == "--apply" ]]; then
  python3 -B "$task_reset_tools/reset.py" --helper "$task_reset_tools/helper.py" --owner-email 'max@maxtravel.us' --clear-audit --reset-business-numbering --apply
fi
