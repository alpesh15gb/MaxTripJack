# Booking reports: scope and evidence

`/operations/reports` is a finance-permission-only operational reporting centre.
It does not initiate supplier, gateway, email or analytics requests and does not
change role grants. Generic booking list/CSV views no longer include supplier
cost; that field belongs to this finance-only projection.

## Date and money contract

- Dates select **order creation in Asia/Kolkata**, inclusive of both calendar
  dates, at most 366 days. SQL uses an explicit zone, not the DB session zone.
- All child payment/refund records belong to that same order cohort, including
  later captures/refund updates. This is **current state**, not period cash flow,
  historical close, tax reporting, bank settlement, profit or production revenue.
- INR only. Totals/counts cross the API as decimal strings; money remains exact
  integer paise. No conversion through JS Number or floating point.
- Base confirmation keeps the existing visibility-ledger contract: product/status,
  no parent or service kind, server confirmation evidence and exact captured
  payment/currency match. CRM event delivery is not required for confirmation.
- Payment and refund records aggregate separately before joining orders. Pending
  refunds are not completed money and are never deducted from captured totals.
- There is no per-order environment marker. UAT labeling remains mandatory;
  production/test attribution cannot be invented by filtering these records.

## Query and export contract

Summary, statuses, scopes and the detail page share one statement snapshot and
normalized parameterized filters. Cursor pagination affects detail only and
preserves PostgreSQL microseconds with a UUID tie-break. Summaries cover the
whole filtered cohort. Status breakdown buttons apply a new server-side cohort;
financial summary cards are not pretend current-page filters.

CSV exports the full cohort, never the visible page, and rejects over 5,000 rows
rather than truncating. It includes fixed columns, applied filter/timezone/context
metadata on every data row and corresponding response headers (also for empty
exports). Empty exports retain stable headers only: filter values are in response
headers/date filename, not nonexistent data rows. `_minor` columns mean paise;
matching `_inr` columns provide exact decimal rupees without floating-point conversion.
Text fields are quoted/escaped and formula-leading controls neutralized for
initial spreadsheet viewing. CSV applications and re-save behavior differ;
import text as text. This is not a universal spreadsheet-execution guarantee.

Data can change between an on-screen report and a separately generated CSV.
Each states its own generation time; this schema-free phase does not claim
historical report snapshots. Failure or access loss clears previous figures;
unknown values are not displayed as zero. Draft filters do not affect the
applied report or export until Apply.

## Verification

- `node --import tsx --test tests/admin-report-projection.test.ts tests/booking-report.test.ts`
  exercises actual route/page/authorization code with deterministic session and
  database boundary doubles. It is not proof of SQL arithmetic.
- `TEST_DATABASE_URL=postgresql://...@127.0.0.1:PORT/payglocal_disposable node --import tsx tests/booking-report-postgres.mts`
  requires an explicitly named loopback disposable DB, creates a unique schema,
  applies existing migrations, verifies real SQL, and drops only that schema.
  Includes a loopback HTTP fixture with synthetic identity and real grants/ledger
  SQL. No provider transactions occur. It is wired into the existing PostgreSQL
  CI step before the build.
- `tests/browser/booking-reports.spec.ts` exercises the actual client component
  in a bundled synthetic HTML shell on desktop/mobile with intercepted APIs.
  Production page authorization is covered separately by the route/page tests.
  It does not establish full authenticated-production-browser coverage.
- `tests/booking-report-next-http.ts`, invoked by the existing CRM command-flow
  fixture after server startup, reuses that fixture's real signed-in session and
  existing finance grant. It checks the actual Next page, JSON, CSV, generic cost
  omission and denial after the fixture's existing grant-revocation step. This is
  real Next/auth integration, not browser interaction; it creates no extra role
  grants or identities and does not disable authentication limits.

Report styles are namespaced under `reports-*`; controls override the shared
global defaults and the page has an explicit responsive width. At phone widths
the same semantic table rows become labeled cards: booking identity precedes
its amounts and expandable breakdown, with no horizontal scrolling. Explicit
table roles and visually hidden column headers preserve the table's structure.
Browser fixtures check identity bounds after expanding and keyboard-toggling
details, not merely page overflow. Their hotel fixture uses CONFIRMED with a
matching status bucket, while flight fixtures use TICKETED. The isolated
component screenshots do not validate the full root layout, Geist font, global
CSS cascade or deployed rendering. Those still require authenticated browser QA.

Relevant technical references:
- PostgreSQL date/time comparisons: https://www.postgresql.org/docs/current/functions-datetime.html
- PostgreSQL statement snapshots: https://www.postgresql.org/docs/current/transaction-iso.html
- CSV safety limitations: https://community.owasp.org/attacks/CSV_Injection
- CSS display/table accessibility: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/display#tables

Historical cash-activity reporting needs separate evidence work. Payment/refund
rows lack `captured_at`/`completed_at`; outbox dates are system-recorded times,
not provider settlement dates. Refund request/approval also emits `refund.updated`,
so only explicitly completed, linked events could support an observed-activity
report, with missing-evidence counts. Do not silently relabel `created_at`.

## Generic operational exports (2026-10-25 review)

`/api/admin/export/[resource]` retains each resource's existing permission and
cost-safe SQL projection. It now uses an explicit column allowlist, so empty
exports have the same headers as populated exports and unexpected result fields
cannot leak. CSV uses the finance export's formula/control escaping; timestamps
are ISO UTC strings (not JSON strings with extra quote characters). Dates select
**the selected resource's creation time** in Asia/Kolkata, inclusive, up to 366
days and 5,000 rows. Refund creation is not refund completion; payment creation
is not capture. Headers and audit detail identify the timezone and date basis.
The operations form explains that distinction and paise/text-import conventions.
CSV is not XLSX: spreadsheet auto-conversion of identifiers and large numbers,
and formula behavior after re-saving, remain application-specific. Import IDs
and exact minor amounts as text when exact preservation is needed.

`tests/operations-export.test.ts` runs the actual route with synthetic auth/DB
boundaries: empty/populated schema, timezone SQL, date rejection, oversized
result rejection, full-width formula text, ISO date formatting, bigint text and
unexpected-cost-field omission. Actual database timezone-boundary execution and
Excel/LibreOffice visual/import QA are not claimed by those tests.

## Confirmation record semantics

`booking-document.ts` labels a fully cancelled order **Cancelled booking record**
and explicitly says it is not valid for travel and not evidence of a completed
refund. Ancillary documents say confirmation, not receipt. Booking and agreed
refund amounts use exact integer paise conversion rather than JS Number.
Supplier-confirmed eligibility gates and the existing revision-bound, best-effort
CRM PDF attachment behavior are unchanged. Authoritative CRM snapshots remain
separate from delivery acknowledgement; neither acknowledgement nor a PDF means
a refund completed or cash settled.

`tests/booking-document.test.ts` exercises actual renderer control flow using
synthetic database/vault/PDF boundaries for cancelled, ticketed and paid states
and values beyond JS safe integer range. It does not prove final PDF pagination,
fonts, customer document correctness or live supplier behavior.

Research basis (design guidance, not claims of these integrations):
- Booking.com post-booking lifecycle: confirm cancellation result before changing
  status; keep order information current; asynchronous notifications can duplicate
  or arrive out of order: https://developers.booking.com/demand/docs/development-guide/application-flows/post-booking
- Stripe refund state model distinguishes pending/action-needed/succeeded/failed/
  cancelled, supporting separate refund semantics rather than treating a request
  as money returned: https://docs.stripe.com/api/refunds
- OWASP CSV injection guidance and spreadsheet re-save limitations:
  https://community.owasp.org/attacks/CSV_Injection

Independent-review follow-up: nullable legacy cancellation offers are shown as
unavailable, never zero or a document-generation failure. Historical partial
cancellation wording describes its scope without asserting travel is still active
following a later full cancellation. The renderer regression includes both.
Real PDFKit synthetic cancelled/ticketed/28-traveller hotel fixtures were rendered
with Poppler and visually inspected: all one page, readable amounts/warnings,
no observed clipping or overlap. This covers those fixtures only, not arbitrary
names/scripts or all itinerary sizes. The existing disposable PostgreSQL fixture
now also asserts the actual generic export route's IST boundary inclusion/exclusion
under Honolulu session timezone and stable empty headers. That extension is
CI-pending; local PostgreSQL executables/disposable DB are unavailable.
Reproduce those synthetic real-renderer PDFs from the booking app with
`node tests/render-booking-documents.mjs /tmp/booking-document-qa`, then render
with `pdftoppm -png`. The script defaults to a fresh temporary output directory.
