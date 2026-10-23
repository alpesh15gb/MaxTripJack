# Result clarity verification — 23 October 2026

Base: commit `8ec7c5a2856e50d153078c53df327b43378caada`, tree
`1ed489530c17476f47a8a6b3f668852a946ae2a2`.

## Changes

- Customer-facing flight cards use readable local calendar dates and “Outbound
  journey”, retaining total-for-all-travellers semantics.
- Explicit nonstop supplier minutes remain usable. Derived connecting totals
  require a coherent, chronological airport chain with explicit offsets on every
  segment. Missing or contradictory data says “Total duration unavailable”.
- Negative hotel metadata is excluded from benefit badges without turning it
  into an accessibility claim. Technical photo labels such as `CoverImage` are
  omitted; meaningful supplier captions and safe image hosts are retained.
- Cancellation windows distinguish supplied zero-charge policy from charges whose
  exact monetary meaning cannot be confirmed. Positive raw amounts are not
  formatted using the site's INR currency. Original supplier details remain
  available under an explicit warning. Nonzero seconds/milliseconds at exclusive
  policy boundaries are preserved.
- Room comparisons use a compact facts/action grid and readable stay dates.
  Optional selected-room and scoped pending props support the parallel navigation
  change. Pending status is before the action, not hidden below it.

## Verification

- `node --import tsx --test tests/*.test.ts`: **251 passed**.
- Six React server-render tests cover the actual changed components, truthful
  pending/selected states, missing fields, original-policy disclosure, and prices.
- `TZ=America/Los_Angeles node --import tsx --test tests/result-clarity.test.ts`:
  **6 passed**, including local-day preservation across explicit offsets.
- `next typegen` and `tsc --noEmit`: **passed**.
- Whole-repository ESLint: **passed**, no output.
- `git diff --check`: **passed**.
- Playwright `--list` for duration-policy/result-clarity: **12 cases discovered**
  across desktop/mobile, **not executed**.

The standard `npm test` wrapper did not execute tests: the tsx CLI failed with
`EPERM` while creating `/tmp/tsx-1000/21.pipe`. Node's native test runner avoids
that unneeded IPC listener and executed the suite successfully without changing
sandbox permissions.

Existing screenshots in `/tmp/maxtravel-qa/` were inspected as input evidence.
No new browser was launched or screenshots claimed: the prior browser sandbox
restriction was respected. Live supplier/provider/payment behavior and final
visual layout remain unverified by this change. No APIs, payments, external
messages, deployment, public push or remote branch updates were performed.
