# Hotel validation after payment

16 November 2026. The reported booking MT-43B3E5CE has a captured payment, BOOKING_FAILED status, a REVIEW job with attempted=false and checks=0, no persisted supplier reference, and no refund record. These facts locate failure before supplier Book dispatch; they do not identify the specific exception. The old worker did not persist that exception's stage or reason. No existing booking or payment is altered by this patch.

## Correction

The hotel worker previously compared the entire cancellation JSON literally after payment. A supplier review advancing the start of an already-active free-cancellation window therefore caused a pre-booking failure even with an unchanged total, deadline and fee schedule. This is a reproducible code defect and a possible cause of the reported failure, not a confirmed historical diagnosis.

The worker now shares checkout's active-window validation, using the quote's database creation timestamp and the worker's fresh response timestamp. The exception is limited to a forward-moving first zero-charge window which is still active at both observations. The complete schedule must be well formed and contiguous, and refundability must be explicitly true. Then the worker replaces only that first raw `from` value for equality comparison: all other raw policy fields, including unknown supplier restrictions, fee units, notes and deadlines, must match. Price, currency, compliance and a valid fresh booking reference remain required. Original snapshots are not mutated. Missing timestamps and ambiguous schedules fail closed when the policy differs.

Failure stages and allowlisted reason codes are logged as `[booking:job-failed]` and stored in terminal outbox-event payloads under `failure`. No raw exception messages, decrypted guest data, API keys or supplier bodies are logged. Failed status copy now describes a booking failure without asserting that the supplier rejected it.

## Deployment and recovery

Rebuild the image, then recreate **app and booking-worker**. Updating only app does not update the running worker. No schema migration or environment change is required. The refund worker is unchanged.

Existing REVIEW/DONE jobs are not automatically retried or refunded. Do not reset the reported order to PAID or its job to READY as part of deploying this fix. Existing captured payments need a separate authorized resolution after checking the payment's test/live mode and current records. If another failure occurs after deployment, inspect the booking worker's sanitized failure stage/code and the terminal outbox event for that reference.

Validation includes actual worker execution with mocked database/supplier boundaries: rolling-origin success, changed price/fee/compliance blocking, sanitized review/guest failures, lost Book response reconciliation without duplicate submission, and leaving terminal failures untouched. Pure guard tests cover unknown policy fields, currencies, malformed/gapped/overlapping schedules, missing capture time, future/backward/expired origins, and snapshot immutability. No live supplier booking or payment is created by these tests.

Release checks passed: production Next build, all worker bundles, booking-worker syntax check, ESLint on changed TypeScript, 596 unit tests and 40 desktop/mobile booking-status and refreshed-terms browser cases. The worker tests exercise the real runner with mocked boundaries; they are not a live supplier fulfilment test or a real PostgreSQL transaction/concurrency test.
