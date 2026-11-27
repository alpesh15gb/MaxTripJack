# Max Travel launch audit · 27 November 2026

## Audit scope

The audit followed flight and hotel journeys from search and review through payment, fulfilment, My Trips and after-sales. It covered the web and native clients, authentication and account ownership, staff operations, database migrations and recovery, CRM delivery, and the build and CI paths. Repository-wide automated checks accompany focused manual review of the launch-critical code.

## Findings fixed in this checkout

| Area | What was incorrect | Correction |
| --- | --- | --- |
| Payment recovery | A replay could return an old gateway order after its state changed. A lost attempt with no order could leave native and web checkout locked. | Resume only the same eligible order. Recheck state and expiry under the database lock. Clear an expired attempt after an owner-scoped check proves there is no order. |
| Flight extras and fulfilment | A refreshed extras quote could coexist with the old payable quote. A delayed worker could overwrite a final booking state. | Retire the predecessor atomically when a refresh succeeds. Preserve terminal orders when old jobs surface. Refresh short-lived extras before payment and keep ambiguous extras writes in recovery. |
| Cancellation | A retry could rewrite the customer’s consent timestamp. Offer expiry could be evaluated using the time before a lock wait. A mobile retry could create a new request key. | Preserve the original consent and audit event, use the database wall clock after acquiring the lock, bind consent to one offer version, and retry the same native request. |
| CRM dispatch | A worker could lose its lease while preparing an event and still send it. Delegated permissions could outlive the account’s eligibility. | Fence delivery by the current lease and count an attempt before dispatch. Keep the event ID and body stable across retries. Recheck verified identity, role and account eligibility. |
| Web and native recovery | Malformed responses could crash trip lookup. Some trip and staff requests could hang or silently lose their state. Signed-out or unauthorized native reads could leave private trips visible. | Add bounded reads, explicit recovery, a Next.js root error screen, and account-scoped state clearing. Validate traveller details and gateway responses before checkout proceeds. |
| Startup and rollout | The health route checked one old migration’s columns. The VPS updater omitted the authentication migration. Profiled workers could start early, and the shared Compose env file could expose PostgreSQL bootstrap credentials to the app and workers. | Check the required migration ledger and authentication schema, run both migrations before cutover, wait for PostgreSQL across profiles, and keep bootstrap credentials out of runtime services. |
| Database restore | A failed backup could leave an archive with a normal filename. Archive listing missed truncation. Restore could leave workers writing and apply part of a failed restore. | Publish only an archive whose contents were read back. Verify before quiescing all Compose application services and restore transactionally. |
| Release verification | Cross-app contract tests started without the web TypeScript alias configuration. Some browser fixtures depended on old copy or Next.js runtime assumptions. | Set the correct project configuration, exercise production HTTP headers in CI, and repair the affected browser fixtures and assertions. |

## Baseline verification

- The local production HTTP server returned ready against a real PostgreSQL 17.12 database. The security check verified CSP nonce rotation, HSTS, clickjacking protection and private cache controls.
- A local backup drill restored the migrated booking and authentication schema into an empty PostgreSQL database. Full decoding rejected a truncated archive that still had a readable index. A forced restore failure retained the previous records. The restricted application role could read migration status and write booking records, while schema creation and migration-ledger mutation were denied.
- Real PostgreSQL fixtures exercised guest-to-account ownership transfer, booking reports, encrypted payment transport and recovery, cancellation, refunds, and idle worker startup. Supplier and payment traffic in these fixtures was simulated.
- The production server and local Mailpit passed registration, verification, reset, booking access, and the complete Better Auth MFA and fallback-code lifecycle. A separate SMTP fault fixture passed acceptance, rejection, and held acknowledgements. Isolated supplier fixtures completed flight and hotel checkout, ancillary and replacement purchases, and delegated CRM command flows.
- The Node.js 24 production build and worker builds passed, along with web lint, 929 unit tests, and both cross-app contract tests. The isolated SEO smoke passed 7,503 HTTP and HTML assertions. All ten WebKit smoke scenarios passed across desktop and iPhone emulation.
- Chromium covered all 1,200 configured desktop and phone cases across two runs. The combined result was 1,194 passes and six configured skips after rerunning the two corrected hotel-rate tests. The standalone PayGlocal gate suites passed six scenarios and skipped six scenarios reserved for the merchant contract.
- Docker Compose 5.6 validation and the VPS rollout checks passed 41 tests. The retained-volume container test requires a Docker Engine and was skipped here. The shell backup and restore regression passed separately.
- Native lint, TypeScript, 61 tests, Expo dependency checks, and Android and iOS JavaScript bundle exports passed. Mobile production and development dependency auditing reported zero advisories.
- Web and mobile lockfile audits reported zero advisories after scoped build-tool dependency updates. [GitHub advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

## Release decision

**Keep live checkout on hold.** PayGlocal needs the merchant-specific flight and hotel travel contract and merchant UAT. TripJack needs successful provider acceptance beyond search, including actual review, ticketing or voucher, after-sales, and timeout recovery in the approved provider environment. The current booking provider environment and payment keys are limited to UAT and testing. [PayGlocal SDK](https://github.com/PayGlocal-Technologies/payglocal-js-client) · [Razorpay order checks](https://razorpay.com/docs/api/orders/fetch-with-id)

Production cutover also depends on deployed CRM and SMTP checks, production reverse-proxy and container smoke tests, load and monitoring checks, a restore rehearsal on the production infrastructure against a disposable target, and signed device builds tested on Android and iOS. [UAT acceptance matrix](../UAT-READINESS.md) · [Expo production builds](https://docs.expo.dev/deploy/build-project/)

## Reference guidance

- Layout and application error handling, production builds, and reverse proxy boundaries. [Next.js error handling](https://nextjs.org/docs/app/getting-started/error-handling) · [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- Database clock semantics, row locking, and transactional archive restoration. [PostgreSQL date and time functions](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT) · [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html) · [PostgreSQL restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
- Compose health dependencies and profiled services. [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) · [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/)
