# Pinned booking + CRM VPS update

`vps-update.py` is for the existing Ubuntu Docker deployments on `maxtravel.in`
and `crm.maxtravel.in`. It is not a generic installer. Python 3.8+, Git, Docker
and Docker Compose v2 are required; run as root on that VPS.

The source pins are booking `e793cb26de9aa7108cb056f54d8eb7a2d44c82f6` and CRM
`679c3257c504b7f46596156605ee7a493728795f`. Later app releases require updating
and reviewing those pins. Build logs do not imply that a VPS rollout has run.

Run without flags for an inspection; use `--apply` for the update. The updater:

1. Captures the active Compose chains and current container environment
   overrides into root-private recovery files. It pins original image IDs,
   preserves networking/ports/mounts, checks existing storage identities and
   refuses missing or different database/upload volumes.
2. Prints only boolean integration readiness checks, not signing keys or API
   credentials. It does not rotate secrets or grant users additional access.
3. Checks out the two pinned commits into fresh private directories and builds
   both candidates before stopping either app. Existing Git checkouts, local
   secrets and unrelated stacks are not changed. Tracked build files are made
   readable for the non-root images while their recovery parent stays private.
   Builds can take several minutes;
   their logs are saved in the printed recovery directory.
4. Verifies the PostgreSQL migration-owner connection using the existing booking
   PostgreSQL container's credentials, inside a one-off container. The owner
   connection is held only in a separate private migration configuration, not
   added to the new application runtime.
5. Stops only the previously running travel applications/workers, takes a
   PostgreSQL custom-format dump and verifies its archive catalogue, and runs
   the existing CRM backup plus a restore verification into a separate recovery
   directory. Uploads/package media are part of that CRM backup.
6. Applies the committed booking migrations through 019 and CRM migrations
   through `20261031100000_case_workflow`; no reset, seed or live-data restore is
   used. CRM's normal startup may safely recheck its migrations.
7. Starts the two apps, verifies their health and the PayGlocal payment hold,
   resumes only their previously running worker services, and checks that all
   those services use the candidate images. Existing historical payment provider
   credentials are retained; new checkout selects PayGlocal UAT and remains held.
8. Prints booking job/outbox/notification queue counts. Previously inactive
   booking workers are deliberately not enabled before their queues and
   integration settings are reviewed. No synthetic capture or real payment,
   supplier purchase, refund or test message is initiated by the updater.

Recovery data lives under `/opt/maxtravel-deployments/<timestamp>-<suffix>`.
Keep it private: the Compose snapshots and inspect files contain credentials.
Share only the updater's console summary, not its private logs/configuration.

Before migration starts, a failure attempts to resume only the original running
services, using pinned old images. Once any migration is attempted, the updater
never automatically restores a database or starts an old application against a
potentially changed schema. Review the saved state/backups/logs before recovery.
If a migration or health check fails, the update is incomplete; do not enable
additional workers or lift maintenance mode.

The updater does not change Nginx maintenance rules, external domains, Vercel
trust, WhatsApp provider selection or unrelated containers. After the rollout,
verify public routing and actual TripJack UAT access, review integration booleans
and queued work, and then activate the required booking workers. Test transactions
must use designated test accounts/recipients. PayGlocal merchant confirmation and
real-provider acceptance remain separate from code/build/fixture verification.

Local validation: `python3 -B -m unittest discover -s deploy/tests -v` covers
environment/storage preservation, mismatched volumes, duplicate service
identity, secret comparison redaction, migration connection targeting,
persistence boundaries and pre-/post-migration recovery behavior. Simulated
rollout orchestration checks build/backup/migration ordering and confirms that
previously inactive workers never start. The generated configuration shape was
also checked with Docker Compose. These are local checks, not evidence of a
successful VPS deployment. The safety tests run in GitHub Actions.
