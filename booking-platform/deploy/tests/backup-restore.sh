#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

deploy="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -f -- "$scratch/bin/docker" "$scratch/docker.log" "$scratch/backups/"*.dump "$scratch/backups/".maxtravel-*; rmdir -- "$scratch/bin" "$scratch/backups" "$scratch"' EXIT
mkdir "$scratch/bin" "$scratch/backups"
export PATH="$scratch/bin:$PATH"
export DOCKER_TEST_LOG="$scratch/docker.log"
cd -- "$scratch"

cat > bin/docker <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == compose && "$2" == --project-directory && "$4" == --env-file && "$6" == -f ]]
[[ "$5" == "$3/.env.production" && "$7" == "$3/compose.production.yaml" ]]
shift 7
profile=""
if [[ "$1" == --profile ]]; then
  profile="$2"
  shift 2
fi
case "$1" in
  config)
    [[ "$profile" == '*' && "$2" == --services ]]
    printf '%s\n' config >> "$DOCKER_TEST_LOG"
    printf '%s\n' app payment-worker enquiry-worker catalogue-worker postgres
    ;;
  stop)
    [[ "$profile" == '*' ]]
    printf '%s\n' "$*" >> "$DOCKER_TEST_LOG"
    ;;
  exec)
    shift 3
    case "$1" in
      pg_dump)
        printf '%s\n' dump >> "$DOCKER_TEST_LOG"
        printf 'fixture-archive\n'
        ;;
      pg_restore)
        [[ "$(cat)" == fixture-archive ]]
        if [[ "$*" == *--file=/dev/null ]]; then
          printf '%s\n' verify >> "$DOCKER_TEST_LOG"
          [[ "${DOCKER_TEST_FAIL_VERIFY:-0}" == 0 ]]
        else
          [[ "$*" == *--single-transaction ]]
          printf '%s\n' restore >> "$DOCKER_TEST_LOG"
        fi
        ;;
      *) exit 1 ;;
    esac
    ;;
  *) exit 1 ;;
esac
SH
chmod +x bin/docker

bash "$deploy/backup.sh" "$scratch/backups"
bash "$deploy/backup.sh" "$scratch/backups"
archives=(backups/*.dump)
[[ "${#archives[@]}" -eq 2 ]]
if DOCKER_TEST_FAIL_VERIFY=1 bash "$deploy/backup.sh" "$scratch/backups"; then
  echo "Backup published an unverifiable archive." >&2
  exit 1
fi
archives=(backups/*.dump)
partials=(backups/.maxtravel-*)
[[ "${#archives[@]}" -eq 2 && "${#partials[@]}" -eq 0 ]]

: > "$DOCKER_TEST_LOG"
if DOCKER_TEST_FAIL_VERIFY=1 bash "$deploy/restore.sh" --replace-database "${archives[0]}"; then
  echo "Restore accepted an unverifiable archive." >&2
  exit 1
fi
[[ "$(cat "$DOCKER_TEST_LOG")" == verify ]]

: > "$DOCKER_TEST_LOG"
bash "$deploy/restore.sh" --replace-database "${archives[0]}"
[[ "$(cat "$DOCKER_TEST_LOG")" == $'verify\nconfig\nstop app payment-worker enquiry-worker catalogue-worker\nrestore' ]]
echo "Verified atomic backup publication, preflight before quiescence and transactional restore."
