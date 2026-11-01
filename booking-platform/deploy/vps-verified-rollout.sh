#!/usr/bin/env bash
# Default: inspect only. --apply: update both apps, then activate eligible idle workers.
set -euo pipefail
umask 077
if [[ "$(id -u)" != 0 ]]; then echo 'Run from the VPS root terminal.' >&2; exit 1; fi
case "${1:-}" in ''|--apply) ;; *) echo 'Usage: vps-verified-rollout.sh [--apply]' >&2; exit 2 ;; esac

task_rollout_dir="$(mktemp -d /root/maxtravel-verified-rollout-XXXXXX)"
task_tools_ref='3412b7d0438e27ae9cca25f2b4e2e98af1c38b58'
task_base="https://raw.githubusercontent.com/alpesh15gb/MaxTripJack/$task_tools_ref/booking-platform/deploy"
printf 'Verified operator tools directory: %s\n' "$task_rollout_dir"
for task_tool in vps-update.py vps-integrate.py; do
  curl --proto '=https' --tlsv1.2 -fsSL --retry 3 "$task_base/$task_tool" -o "$task_rollout_dir/$task_tool"
done
cd "$task_rollout_dir"
sha256sum --check <<'CHECKSUMS'
5b88f65d42e5b006cdfecc092c254c9196669bb5762ef776a1e75027f44a5fac  vps-update.py
63440dfd0284d9c5c18b33ae4039b925074e9c892f55b479459d03dc2ce2f66a  vps-integrate.py
CHECKSUMS

python3 -B ./vps-update.py
if [[ "${1:-}" == --apply ]]; then python3 -B ./vps-update.py --apply; fi
python3 -B ./vps-integrate.py
if [[ "${1:-}" == --apply ]]; then
  python3 -B ./vps-integrate.py --apply
  echo 'Both applications updated; eligible worker activation checks completed. PayGlocal remains held.'
else
  echo 'Inspection complete. No application, database or worker change was requested.'
fi
printf 'Retain operator tools and recovery directories. To retry activation only after resolving its preflight: python3 -B %q/vps-integrate.py --apply\n' "$task_rollout_dir"
