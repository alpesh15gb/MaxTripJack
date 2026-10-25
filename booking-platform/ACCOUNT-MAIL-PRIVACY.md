# Account email initiation is not delivery

Account signup, reset-request and resend-verification now return after BetterAuth's account/token work and scheduling, **not** after SMTP. They do not assert that mail was delivered. Unconfigured SMTP still rejects initiation uniformly before account lookup. Existing-token reset/verification and sign-in remain available without SMTP.

## Why and contract

Pinned BetterAuth **1.7.7** awaits the supplied reset and verification callbacks. Source reviewed in `node_modules/better-auth/dist/api/routes/`:

- `password.mjs`: unknown email performs dummy token/lookup work and returns generic success; known email creates a reset verification value, then awaits `runInBackgroundOrAwait(sendResetPassword(...))`.
- `email-verification.mjs`: anonymous resend has a 500ms minimum floor but rethrows callback errors. A 30-second SMTP timeout would defeat that floor.
- `sign-up.mjs`: required verification enables synthetic duplicate signup output and password hashing; only new signup invokes the verification callback.

Official BetterAuth guidance says not to await email delivery because of timing attacks, and to use lifetime-retaining platform facilities rather than unattended promises:
https://better-auth.com/docs/authentication/email-password
https://better-auth.com/docs/concepts/email

The callbacks now register **unstarted** mail work with Next's `after`, returning immediately. Only account mail is deferred. Password changes, token consumption, verification, session revocation, errors from those operations, rate limits and trusted origins remain in BetterAuth's awaited path. No generic route error suppression, optimistic password mutation unlock, token exposure, or verification bypass was added.

Installed Next **16.4.1** documentation `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` confirms `after` supports route handlers and Node/Docker deployments, retains work after response, and is bounded by the deployment's invocation duration. Public reference: https://nextjs.org/docs/app/api-reference/functions/after . Scheduling failures are not swallowed. The existing SMTP send owns/aborts its socket within the 30-second deadline.

## Operational truth / limits

- This is **in-process best-effort dispatch**, not a durable queue and not automatic retry. A process crash/restart/termination may lose pending work. No new worker, access, schema or persistence is introduced.
- Fixed-vocabulary `Account mail` logs record kind (`reset`/`verification`) and `attempt-started`, `smtp-accepted`, or `delivery-unconfirmed`. No recipient, content, URL, token or transport exception is logged by this dispatcher. Existing unrelated BetterAuth logging is unchanged.
- SMTP acceptance is not inbox delivery. Rejection/timeout are reported as delivery-unconfirmed; timeout may have delivered. Operator log monitoring must treat failure outcomes and unmatched starts as needing investigation. These logs do not provide per-recipient delivery tracing or durable evidence after log loss.
- Web/native wording explicitly says accepted request is not account-existence or delivery confirmation; check spam, retry after waiting, or contact support. Verification screen also supports being opened without a prior signup and makes no false acceptance assertion.
- This removes SMTP-dependent response/error/latency divergence. It does **not** claim all auth/database paths are mathematically constant-time. BetterAuth retains its dummy work/minimum floor. Memory-adapter signup omits nullable `image` on fresh users while synthetic duplicates return `null`; the test normalizes that adapter representation as well as generated IDs/timestamps/submitted email. Real Postgres response shape remains an external verification item.
- Actual SMTP acceptance/inbox placement, production Postgres, and Next deployment lifecycle/shutdown behavior remain external release gates. Configure a hosting request/task duration comfortably exceeding the 30-second send deadline; do not deploy on a platform that drops `after` work immediately after responses.

## Verification

`node --import tsx --test tests/account-mail-privacy.test.ts` bundles the **actual application auth route/configuration** and uses installed BetterAuth with a disposable memory adapter. Only mail, Next lifetime scheduling/cookie context, server-only marker and DB infrastructure are replaced. No real accounts, credentials, providers or email are used.

- Known and unknown signup/reset-request/resend return equivalent generic response contracts before any SMTP work starts for successful sends, rejected sends, and held/failed timeout simulations.
- Delivery outcomes are recorded without synthetic sensitive details. Timeout work remains pending until explicitly released in the fixture.
- With mail disabled after token issuance, verification succeeds, reset succeeds, reused reset token fails, and the new password signs in.
- Existing mail configuration gate and transport suites cover uniform missing-config 503, existing-token route delegation, hard deadline, real local synthetic TLS socket closure and mail content/configuration preservation.

Full unit suite: 375 tests passed. Browser was not launched. The scheduler test controls the lifecycle boundary; it is not a deployed Next lifecycle test. Existing bounded transport tests exercise the real installed Nodemailer against loopback synthetic servers, not live delivery.

## Real Next/PostgreSQL lifecycle CI gate (test-only follow-up)

`tests/integration.mts` now polls Mailpit within a 35-second deadline instead of assuming mail precedes the signup HTTP response. It still **requires actual local message arrival**, then follows verification, receives reset mail, resets the password, rejects token reuse and signs in with the replacement password.

`tests/account-mail-next-http.mts` starts an unmodified built production Next server and local synthetic SMTP sink, using the existing disposable CI PostgreSQL database. It is restricted to `CI=true`, loopback database and `maxtravel_ci`. It uses real `after`, real BetterAuth/PostgreSQL, and real bounded Nodemailer: success, rejected DATA, and withheld DATA acknowledgements. Every known/unknown HTTP initiation must finish within five seconds, and the held phase verifies all three SMTP sockets are still open when responses finish. Production socket timeouts must subsequently close them and emit sanitized delivery-unconfirmed outcomes. Signup comparison does not normalize nullable fields in this PostgreSQL test. Origin rejection remains asserted; real per-IP rate limits remain enabled with 61-second waits between scenarios. Only per-run synthetic data/processes/sockets are cleaned up. The CI step is bounded to ten minutes.

**Execution status:** TypeScript and ESLint passed locally. The real PostgreSQL/Next lifecycle test has **not run in this executor**: Docker/PostgreSQL binaries/services are unavailable. It is wired into the existing PostgreSQL/Mailpit CI job after the production build and existing HTTP flows. Passing this new CI gate is required before claiming the deployed-lifecycle/PostgreSQL response-shape gate is closed. No CI run was triggered or deployment performed by this change.

## Cookie-less initiation Origin boundary (recovered follow-up)

The pinned BetterAuth 1.7.7 `origin-check.mjs` generic `validateOrigin`
returns without validating a supplied Origin when cookies are absent unless its
caller forces validation. Account-mail initiation cannot rely on that generic
check alone. The three exact POST initiation routes now validate supplied browser
Origin/Referer evidence before SMTP configuration checks or account lookup. The
shared trusted-origin list retains the configured web origin and `maxtravel://`.
Headerless native requests remain supported unless explicitly cross-site. Token
completion, sign-in, and OAuth routes keep their existing BetterAuth behavior.
The recovery workspace’s installed Next 16.4.0 route-handler documentation confirms the standard Request
header interface used here; no Next lifecycle hook was changed.

Focused tests cover configured/unconfigured mail, known/unknown addresses,
trailing-slash paths, rejected origins before infrastructure calls, canonical web
origins, native/headerless requests, malformed browser evidence, and unrelated
route delegation. The real Next/Postgres fixture retains and expands its 403
assertion to all three initiation endpoints, with known and unknown addresses.
That expanded integration assertion still requires CI execution; unit mocks are
not evidence of a real server/Postgres run.

Recovery verification note: the origin and browser follow-ups used a shared Next 16.4.0 dependency tree, while the repository lock targets 16.4.1. Fresh locked combined checks and real Next/PostgreSQL CI remain separate requirements; this recovery does not claim the lost local commit or its evidence was restored.
