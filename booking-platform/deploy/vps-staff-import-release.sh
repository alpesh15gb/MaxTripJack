#!/usr/bin/env bash
set -euo pipefail
umask 077
# Verified downloads; configure private CRM storage before the pinned app update.

task_crm_fix="$(mktemp -d /root/maxtravel-crm-fix-XXXXXX)"

curl -fsSL 'https://raw.githubusercontent.com/alpesh15gb/MaxTripJack/3412b7d0438e27ae9cca25f2b4e2e98af1c38b58/booking-platform/deploy/vps-update.py' -o "$task_crm_fix/helper.py"
curl -fsSL 'https://raw.githubusercontent.com/alpesh15gb/MaxTravel/50029505ebb9a57e43ddac59943f60ab5269fda1/scripts/vps-enable-encryption.py' -o "$task_crm_fix/encryption.py"
curl -fsSL 'https://raw.githubusercontent.com/alpesh15gb/MaxTripJack/531f9a5f5bbb23177313be659f9822e96457538e/booking-platform/deploy/vps-update.py' -o "$task_crm_fix/update.py"

printf '%s  %s\n' \
 '5b88f65d42e5b006cdfecc092c254c9196669bb5762ef776a1e75027f44a5fac' "$task_crm_fix/helper.py" \
 '5b657d8de4c5d5a8730f986dfec15f1570a34a5d1645f524752b4ff6e81fcd56' "$task_crm_fix/encryption.py" \
 '766038b69e39bc286e0feb458ce53d8c3d98483dbf865c8fa476f18ec649e659' "$task_crm_fix/update.py" | sha256sum --check -

python3 -B "$task_crm_fix/encryption.py" --helper "$task_crm_fix/helper.py"
python3 -B "$task_crm_fix/encryption.py" --helper "$task_crm_fix/helper.py" --apply
python3 -B "$task_crm_fix/update.py"
python3 -B "$task_crm_fix/update.py" --apply
