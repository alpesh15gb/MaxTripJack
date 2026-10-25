# Disposable real-HTTP MFA proof

`tests/mfa-next-http.mts` is a separate CI verify step after the real account-mail lifecycle, with a 60-second separation. It uses the already running production-build Next server, BetterAuth, PostgreSQL and local Mailpit. It does not mock auth routes or enable MFA through SQL.

Required guard: `CI=true`, loopback Next port 3000, loopback PostgreSQL port 55439/database **maxtravel_ci**, and loopback Mailpit SMTP port 11025 with TLS disabled. Other database names, hosts, query overrides or endpoints are rejected before network access. Mailpit HTTP is fixed to loopback port 18025. Do not run this against any persistent or production environment.

The synthetic identity signs up, follows its own local verification email, signs in, obtains the actual MFA enable response, computes an RFC 6238 SHA-1 TOTP from that response in memory, and verifies enrollment. Assertions cover enabled account state, session-token rotation and old-session rejection, exactly one owned active device, sign-out, password-only challenge with no session, successful backup recovery, another sign-out/challenge, and rejection of the same consumed backup code without granting a session.

Cookie updates include all Set-Cookie headers, rotations and deletions. `trustDevice` remains false. No rate-limit settings or rows are modified. Cleanup targets only the generated random synthetic user's rows, its captured verification/challenge identifiers and its exact Mailpit message IDs; an empty Mailpit deletion is never issued. Auth secrets, setup URI, passwords, backup codes, cookies and HTTP response bodies are never printed. Failure output identifies only a fixed lifecycle stage.

Contracts were inspected in the installed BetterAuth 1.7.7 two-factor, TOTP, backup-code and verify-two-factor modules. Local helper tests use **public** RFC vectors and fake cookie strings; these are not real-account credentials.

Local validation: pure helper/guard tests, repository lint/type/unit/build checks. **The real HTTP lifecycle has not been run locally**: disposable CI services are required. Its outcome must be taken from this named CI step, not inferred from browser fixtures or unit tests. Passing this step proves synthetic disposable-service behavior, not live email delivery or a real customer account.

CI invocation (existing job supplies `.env.local`):

```sh
node --env-file=.env.local --import tsx tests/mfa-next-http.mts
```
