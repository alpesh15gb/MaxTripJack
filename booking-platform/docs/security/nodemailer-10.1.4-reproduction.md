# Nodemailer 10.1.4 patch reproduction — 2026-10-25

## Provenance and scope

Reproduced locally from published booking commit `8aa4ec1d81f9c451cd41f36becda17f464a1600d` on branch `security/reproduced-nodemailer-10.1.4`. This is a new reproduction, **not recovery of the lost `5156f7e` object**. Investigation and checks ran 2026-10-25 07:40–07:44 UTC (conversation clock; executor wall clock differs).

Pin booking-platform's only changed dependency from `^10.1.1` / locked `10.1.1` to exact `10.1.4`. Only the root dependency declaration and `node_modules/nodemailer` lock entry change. npm's unrelated lock normalization was discarded. No native dependency, override, app runtime code, credentials, VPS, provider, browser, GitHub publication, or deployment changed.

Primary [10.1.4 release](https://github.com/nodemailer/nodemailer/releases/tag/v10.1.4), dated 2026-10-18, and these advisories were checked at 07:40 UTC:
- [GHSA-8c8m-p3m8-cjg8](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8): nested comments leaking a recipient.
- [GHSA-m943-m63m-w62w](https://github.com/advisories/GHSA-m943-m63m-w62w): group semicolon inside comments/quotes.
- [GHSA-85x2-q946-cp5h](https://github.com/advisories/GHSA-85x2-q946-cp5h): angle close inside a quoted local part changing recipient domain.

All three list affected versions `>=3.0.0 <10.1.4` and patched `10.1.4`. Official npm metadata/tarball fetched with a new writable `/tmp/booking-npm-cache` (old default cache absent). Integrity:
`sha512-EsMnOR2oRv4LGnWvHgcVYkkQ4O2j8KO4WTw6l+PHR4sOXo8SAgIraxtEnGDmotjbhv0hDsu3IuDIFZm8iXwO4A==`.

## Verification

- Six new tests: three public `sendMail` stream envelopes and three actual loopback SMTP RCPT/DATA exchanges, using synthetic `.invalid` recipients, ephemeral `127.0.0.1` ports, bounded timeouts and socket cleanup. No external SMTP.
- Negative control: all **6 fail on 10.1.1**; all **6 pass on 10.1.4**. The quoted-local fixture deliberately expects Nodemailer's public envelope normalization of `>` to space, while preserving the intended recipient domain; this is not a claim of byte-for-byte local-part preservation.
- Full booking suite via `node --import tsx --test tests/*.test.ts`: **382/382 passed**, 07:42–07:43 UTC.
- `npm run lint`: passed. Initial `tsc --noEmit` lacked generated `LayoutProps`; official `next typegen` followed by `tsc --noEmit`: passed.
- `npm audit --package-lock-only --json`: **0 vulnerabilities**, 07:41–07:42 UTC.
- `git diff --check`: passed. Semantic lock comparison changes only `packages[""]` and `packages["node_modules/nodemailer"]`.
- Standard `npm test` wrapper itself failed with tsx IPC `listen EPERM` at `/tmp/tsx-1000/*.pipe`; the Node loader invocation runs the identical file glob without that optional CLI IPC server. No sandbox escalation used.
- Dependencies other than Nodemailer reused the original local checkout via symlinks. Thus this is not an independently clean `npm ci` proof. No production build, live provider, browser, deployment or publication performed.

## Separate native audit (not fixed)

At 07:40–07:41 UTC, native lock-only npm audit returned **5 high dependency entries**, not five independent root vulnerabilities: `node-forge`, `zod`, `@expo/code-signing-certificates`, `@expo/cli`, `expo`.

- Locked `node-forge 1.4.0`: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), affected `<=1.4.0`; advisory says **no patched version**. npm registry latest queried at 07:42 UTC also returned `1.4.0`.
- Nested Expo Zod is `3.25.76`; locked `@expo/cli 57.0.30` declares `zod ^3.25.76`. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) lists affected `<4.6.6`, fix `4.6.6`. Forcing Zod 4 violates the CLI's declared major range and was not attempted.
- npm suggests Expo **54.0.38**, a major downgrade from this application's **57.0.29**. This is not an accepted safe fix. No `npm audit fix --force`, override, downgrade or unverified claim of runtime exploitability.
- Native suite: **46/46 passed**; native `npm run typecheck`: passed. Native package/lock remain unchanged. Expo lint's initial wrapper hit absent `/home/agent/.expo` telemetry state; rerun with `EXPO_NO_TELEMETRY=1 npm run lint` passed. Broad direct ESLint also reports existing source/asset-script errors and is not equivalent to Expo's configured lint targets.

Remaining gate: an upstream compatible Expo/CLI dependency update and patched forge release, then native re-audit and regression validation. Publication remains blocked pending authorization; local testing does not imply release readiness.
