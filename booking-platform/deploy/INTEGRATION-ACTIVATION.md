# CRM commands and booking workers on the VPS

First deploy the current tested booking and CRM release with `vps-update.py`. That updater builds and verifies both candidates, backs up their existing databases, applies committed migrations, checks health and preserves the previous worker activation state. It does not activate previously stopped workers or enable checkout.

Keep the reviewed `vps-integrate.py` and its matching `vps-update.py` in the same root-private directory. Run `python3 -B vps-integrate.py` for inspection, then `python3 -B vps-integrate.py --apply` after reviewing the counts. Neither command prints credentials, work emails or private configuration values. Both retain a private recovery directory under `/opt/maxtravel-deployments`.

## Readiness requirements

- Existing booking-to-CRM event URL, signing key, CRM owner and branch must already be correct.
- At least one existing active CRM staff account must have its authenticator enabled. Its exact work email must uniquely match an existing verified booking administrator with MFA, an active admin grant including `bookings:read`, and an active account/company. The tool does not provision users, verify emails, enable MFA flags or grant permissions. Complete those normal onboarding flows in the apps.
- Previously configured actor mappings must still satisfy those identity checks. One booking administrator cannot stand in for multiple CRM identities.
- Pending booking jobs, unconfirmed paid orders, undelivered events/notifications, approved or processing refunds, supplier cancellations, unsettled payment attempts and uncertain commands must be reviewed before first activation. The tool refuses to drain existing work automatically, and rechecks both apps after quiescing them.
- Existing booking SMTP host and sender must be configured. All seven compiled worker entrypoints must be present in the running application image.

## Activation

The tool preserves runtime storage, networks, permissions, environment and application images. It configures the CRM command endpoint and a direction-specific private HMAC key, separate from the booking event key. It maps only eligible existing identities. Staff permissions, record scope, current MFA state and booking grants remain enforced for every command.

Only the two travel apps and their already active workers are paused. After both apps become healthy, a signed STATUS probe for a nonexistent booking must pass authentication and return the expected harmless 404. Checkout must still report PayGlocal held. The existing CRM maintenance worker is resumed with its own storage and command intact.

The seven booking services are `booking-worker`, `crm-worker`, `maintenance-worker`, `cancellation-worker`, `refund-worker`, `payment-worker` and `notification-worker`. Each uses the exact running booking app image, retains its security/storage settings, and has an SQL heartbeat health check. Workers do not inherit the web app's HTTP ports, routing labels, DNS aliases or static network identity. Idle payment polling does not require unfinished merchant configuration.

Success requires all seven worker containers to be healthy and use the correct image. Unrelated VPS containers and Nginx maintenance settings are untouched. On failure, configuration recovery attempts to stop new workers and restore original application/worker configuration. This is not a database rollback; no database reset, financial replay or grant change is performed. Keep the printed recovery directory and share console status only, never its private logs or configuration.

## Verification scope

`python3 -m unittest discover -s deploy/tests` covers the updater and activation policy, private configuration, ambiguous/revoked identities, queue guards, signed-probe ordering, worker isolation and recovery. The two-app disposable test covers actual HTTP, PostgreSQL, SQLite, signed events/commands, worker delivery, replay protection, case/receipt creation, MFA denial, grant revocation and desktop/mobile staff handover. Provider payment and supplier responses in that test are simulated; they do not certify real PayGlocal or TripJack financial operations.
