# Policy disclosure CI regression diagnosis

Source: https://github.com/alpesh15gb/MaxTripJack/actions/runs/40045645106/job/120726617770

Exact tested remote commit: `3f4aa2437ba80acc03c3bcd3581c4ee5f559bdd4`.
The completed job recorded 410 passed / 10 failed. All ten failures and their retries stopped at `getByText('Original supplier policy details', {exact:true}).click()`:

| Suite | Unique scenarios | Desktop/mobile failures |
| --- | ---: | ---: |
| duration-policy | Normal width and 320px | 4 |
| result-clarity | Supported hotel cancellation meaning | 2 |
| search-responsiveness | Metadata before/after room detail | 4 |

Downloaded screenshot/error artifact `12541043329` (SHA-256 `6df3751e18a4d27a4e5a683f73c2b36c51b32b88c37a3f643a289718ea4f9cdf`) and inspected all ten initial failure screenshots. Desktop pixels show the truthful new **Supported supplier policy details** summary; date windows and unknown-charge wording remain visible. Mobile/320px viewport captures show intact room cards and the start of the lower policy area; the lower summary is outside the captured viewport, so the matching error-context snapshots—not unseen pixels—establish its presence there.

The locator was updated in three test files. No date, numeric-source, unknown-unit, no-rupee, no-payment, request-count or metadata-invariance assertion was removed or weakened. The dedicated refreshed-terms suite already uses its correct distinct comparison summary and contains no obsolete label.

Reviewing assertions after the failing click also exposed a masked compatibility regression: existing `hotelOption.cancellation.policy` fixture text was omitted by the new allowlist. Added only that bounded scalar string field; arbitrary nested policy objects remain unsupported. Unit/SSR regressions verify the text survives, secrets and net fields do not, raw dates and reference amounts remain visible in supported details, and the readable timeline never invents currency/units or numeric charges.

No local browser was launched. This diagnosis uses completed CI logs/screenshots plus local fixture/static checks. The corrected full browser suite still requires a fresh authorized CI run; the old 410-pass result is not a pass for the correction or the new refreshed-terms tests.

Checks on correction: 349 unit tests passed; ESLint and fresh nonincremental TypeScript passed; Playwright discovery listed 46 cases across the three affected suites plus refreshed terms (including its 14 viewport cases); diff whitespace check passed. No local browser run or new browser pass is claimed.
