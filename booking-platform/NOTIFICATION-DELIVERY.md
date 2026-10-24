# Notification delivery bounds

Customer notifications remain **at-least-once**, with at most 12 reserved attempts before operator retry. SMTP acceptance and the database acknowledgement cannot be atomic; duplicate mail remains possible after a crash, a lost SMTP response, or a lost database acknowledgement. `delivered_at` means SMTP accepted the message, not that it reached an inbox.

- Before SMTP, the worker conditionally renews its still-valid lease and reserves one attempt. A lost/replaced/expired lease, uncertain renewal, shutdown, or overly late renewal response cannot authorize a send.
- The 90-second lease includes a 30-second total SMTP deadline and 15 seconds of acknowledgement headroom (not a separate database-operation timeout). Renewal round-trip latency is counted conservatively with a monotonic clock. Preparation happens before renewal. Shutdown is rechecked after the awaited renewal; a reservation committed during shutdown remains counted, but cannot start SMTP.
- Each message owns its TCP socket. At the deadline the socket is destroyed before reporting failure, including DNS/connect and TLS/STARTTLS phases. Merely racing a promise or calling ordinary SMTP transport `close()` would not cancel active I/O. Nodemailer still performs TLS, certificate validation, SNI and SMTP authentication. Existing account email content/configuration behavior is retained, with the same bounded lifetime.
- SMTP errors/timeouts follow existing capped exponential retry. SMTP acceptance followed by failed/missing DB acknowledgement does **not** execute the failed-send requeue update: it keeps the lease until expiry and logs `acknowledgement-unknown`. The reserved attempt remains counted.
- State updates are conditional on the lease token. Logs contain notification ID/outcome only, not addresses, message content, or credentials.

Timers are not distributed fencing: process suspension/event-loop starvation or infrastructure clock anomalies can still outlive a lease. These changes reduce overlap, not guarantee exactly-once delivery. Provider-side idempotency would be stronger; stable message IDs alone do not guarantee recipient deduplication. A durable `ambiguous`/manual-review state with reconciliation would require a separately reviewed migration, operator UI and retention/retry policy; no such schema change is included here.

## Verification

`node --import tsx --test tests/*.test.ts` avoids the tsx CLI's IPC listener. Tests cover fake clocks/transports, late connect/success, real installed Nodemailer with loopback synthetic STARTTLS and SMTPS servers, and server-observed TLS socket closure when the DATA acknowledgement is withheld. TLS tests require local loopback sockets and OpenSSL (ephemeral one-day test certificate generated in a temp directory, no credential files committed). No real provider or email recipient is contacted.

Transport contracts checked against installed Nodemailer 10.1.1 SMTP transport/connection source and official documentation:
- https://nodemailer.com/extras/smtp-connection (`connection` and `secured` options)
- https://nodemailer.com/smtp (TLS and timeout settings)

Production/live SMTP and live Postgres concurrency are not exercised by these tests.
