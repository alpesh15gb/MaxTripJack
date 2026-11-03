# CRM confirmation delivery contract

## Release order

Deploy and verify the CRM current-revision document guard **first**, then deploy
the booking producer fallback. Do not deploy the new producer against the old
receiver. Existing frozen producer payloads remain valid with the new receiver
(the schema and event body hashing are unchanged). These changes are local only;
no VPS or production deployment was performed. This producer change alone is not
sufficient: older queued PDFs must not remain eligible after a newer
status-only snapshot.

- The repeatable-read CRM snapshot (including payments/refunds) is authoritative.
  Snapshot and database failures remain retryable delivery failures. No financial
  values are fabricated or omitted when PDF generation fails.
- A confirmation PDF is optional. Render/read failure, transport oversize, or an
  observed revision change omits it with an event ID + reason-only warning. No
  traveller data, document bytes or exception details are logged.
- A revision change during rendering refreshes the authoritative snapshot once
  and drops the PDF. Continued changes do not create an unbounded render loop.
- A PDF is frozen only if the booking revision still matches in the outbox save
  statement. Loss of lease or a further observed revision race retries normally.
- Saved delivery bodies are immutable across retries. The signed event ID/body
  pair is unchanged; the receiver deduplicates exact repeats and rejects ID
  collisions. Receiver monotonic revisions prevent older snapshots overwriting
  newer state. Network failures and receiver financial rejections still retry.
- CRM stores status, finance, document availability, revision and event ID in one
  transaction. `documentsCurrent` is false unless this revision actually supplies
  an eligible document. Signed PDFs are stored as private attachments; staff
  downloads require document access and current source/customer scope. No PDF
  is automatically sent or attached to customer email by this event receiver.

## Operational limits

PDF delivery is best effort, not guaranteed eventual document delivery. An event
frozen without a PDF will never regenerate it during retry. The receiver ignores
same-revision later events, so there is **no same-revision document backfill**.
A future legitimate revision can provide a new staff-download attachment. A
missing PDF is unavailable, not a current PDF. Customer delivery remains an
explicit action governed by payment and audited-exception checks.

The existing distributed boundary remains: booking changes not yet received by
CRM cannot invalidate a PDF there, and a change after a staff download cannot
retract a copy already downloaded. These checks do not claim atomicity across
the booking database and CRM database.
The signed booking-event format is unchanged; this path introduces no provider credentials or delivery calls.
