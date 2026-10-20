# Booking safety audit and local changes — 20 October 2026

This is source review and deterministic fixture coverage, not TripJack/Razorpay certification. No real provider requests, charges, reservations, cancellations, refunds, customer messages, or deployment were performed in this work. Review changes were published after the owner approved the push.

## Required migration and rollout handling

Apply `015-fare-validation.sql` through `npm run db:migrate` before running this version of the application or workers. Rebuild both app and workers together.

**Migration 015 deliberately marks all historical initial-flight quotes `BLOCKED` in both validation phases.** Older records cannot prove whether Fare Validate was already dispatched. This conservative invalidation prevents a new worker from replaying an uncertain old call:

- Unpaid quotes with no payment operation require an explicit new supplier review and renewed customer acceptance.
- Existing paid orders whose Book submission has not started require operations review. Do not reset their validation marker or collect another payment.
- An existing gateway order, expired unpaid intent or interrupted gateway creation must be reconciled first; a new quote is not permission to duplicate an existing payment operation.
- Already-attempted Book jobs continue existing-reference status checks. They never submit Book again.
- `PREPAYMENT` and `PREBOOK` are separate durable phases. Successful prepayment validation does **not** replace the fresh validation after payment. Each phase records its start before dispatch and binds to the exact canonical passenger/extras/amount payload. Error, lost response or process crash prevents automatic replay.
- A `PREBOOK` success left behind by a crash before the Book marker is also blocked on recovery: the old fare is not assumed to remain fresh. Operations must establish the outcome, not retry the call blindly.

No schema fields contain raw passenger documents; the validation binding is a SHA-256 request fingerprint. Existing encryption remains unchanged.

## Corrected logic

1. **Gateway creation crash recovery.** A stale `STARTED` intent (at least two minutes old) can be linked to a staff-supplied existing Razorpay order after verified ID, receipt, amount and INR currency checks. Recovery locks the current order and intent before writing. Concurrent recovery links once; repeated recovery and a late original creator cannot downgrade captured/processing/terminal orders. No replacement gateway order is created.
2. **Interrupted fare validation.** Durable per-phase markers prevent repeating an uncertain or rejected Fare Validate. A paid order requiring investigation becomes `MANUAL_REVIEW`; the worker does not submit Book. Worker final/error writes also check current lease ownership.
3. **Read-only payment recovery status.** `GET /api/payments/status` accepts exactly one owned `bookingId` or `quoteId`. It only offers the existing checkout for a fresh quote with matching unpaid `CREATED` records. Authorized, captured, expired and uncertain records cannot reopen checkout. An owned quote with no currently visible order returns `OUTCOME_UNCONFIRMED`, not permission to restart: an interrupted create request may still be running.
4. **Reissue passenger binding.** The full passenger multiset must match. Repeated membership such as `[Asha,Asha]` cannot substitute for `[Asha,Ravi]`; legitimate equal-name counts remain intact. Names are compared with Unicode/case/whitespace normalization, without stripping meaningful punctuation or accents.
5. **Special-return fare pairing.** Identifier matching is exact membership for supplier arrays or exact equality for a scalar string, never substring matching. Official sample payloads show string-array `msri`; unsupported missing/ambiguous pairing remains rejected instead of guessed.
6. **Supplier money boundary.** Null, blank, boolean and malformed supplier prices are rejected rather than coerced to zero. A hotel markup can no longer turn a missing supplier amount into a payable fees-only quote. Valid numbers/decimal strings and genuine zero-price service amounts remain supported.

## Verification

- New deterministic unit fixtures cover stale/known-uncertain gateway recovery, current-state rechecks, conflicting links, late creator outcomes, fresh/terminal resume eligibility, Fare Validate phase isolation, provider/persistence loss, concurrent checkout, changed passenger/extras payloads, stale PREBOOK success, passenger multiplicity and exact fare pairing.
- Local `node --import tsx --test tests/*.test.ts`, TypeScript and focused ESLint checks passed at the implementation checkpoint. The ordinary `tsx --test` CLI attempted a denied Unix IPC listener in this execution environment; the supported Node loader runs the same tests without that listener.
- New real-PostgreSQL synthetic regressions are included in the existing `test:providers` and `test:checkout` scripts, already invoked by CI. These cover actual transaction serialization and worker decisions as well as the no-network fixtures.
- **The PostgreSQL integration regressions were not run locally:** the disposable database server could not create its Unix socket under the execution policy. The isolated GitHub PostgreSQL run subsequently passed these regressions: https://github.com/alpesh15gb/MaxTripJack/actions/runs/39504128510 . Provider HTTP responses remained synthetic; this is database-backed integration coverage, not real provider UAT.

## Remaining operational boundaries

An abandoned post-ticket payment can still leave its original flight locked against another service/cancellation, especially after quote expiry. This is intentional fail-closed handling until the existing gateway order and any capture are definitively reconciled. There is no invented gateway cancellation/expiry assumption and no automatic replacement payment. Staff should inspect the known order rather than asking the customer to pay again.

Historical or newly uncertain paid Fare Validate operations need supplier/finance investigation. The ordinary booking-reconciliation endpoint only rechecks already-attempted Book operations; it is not an override for this new no-retry guard.

Actual UAT response shapes, wallet behavior, partial cancellations, refunds and device/provider acceptance remain outstanding under the existing project release checklist.
