# Security implementation and dependency review

Reviewed 15 October 2026. This records code controls and dependency exposure; it is not a penetration-test certificate.

## Application controls

Verified email and server sessions; authenticator requirements for admin/company access; scoped admin permissions; password-reset session revocation; authenticator/recovery-code attempt limits; own-device session revocation. PostgreSQL account/search quotas apply across app replicas. Nginx must remain the only public app entry point.

PII is AES-256-GCM encrypted with random IVs and record-bound authenticated data. Secrets never enter mobile/public environment variables. Preserve encryption/auth/signing keys separately from backups. Customer APIs enforce both user and company scope. Protected pages/documents use private no-store responses.

Every rendered document has a fresh cryptographic script nonce. Production forbids unsafe script execution/eval, framing, objects and cross-origin form submissions; Razorpay connections/frames are allowlisted. Inline styles remain allowed for existing design styles. Framework rendering is dynamic to keep nonces unique.

Money is stored in integer minor units. Prices are server-owned quote snapshots. Gateway captures require matching amount/currency/order. Webhooks validate raw-body HMAC and durable event hashes. Supplier attempts persist before submission; unknown outcomes are checked without resubmission. Refunds preserve idempotency keys, reservations, approvals and completion monotonicity. CRM retries preserve identical content and the receiver rejects stale/colliding events.

Containers run as a non-root user with read-only root filesystems, dropped capabilities, no-new-privileges, bounded processes/memory/logs and private database ports. API readiness, worker heartbeats and exhausted queue counts support monitoring. Reporting escapes spreadsheet formula prefixes and requires report-specific permission.

## Dependency findings and mitigation

- Web production dependencies: `npm audit --omit=dev` reports no advisories at review time.
- Web development lint path: eslint-config-next → fast-glob → micromatch → braces. GHSA-vfj7-8cjw-p6xm affects nested glob parsing. Only trusted project glob patterns are processed; lint/build tools are absent from the runtime image. No compatible upstream fix was offered by npm audit; forcing its suggested Next 14 downgrade would break the installed Next 16 stack.
- Native build path: Expo Metro → micromatch → braces has the same finding. Expo CLI/code-signing-certificates → node-forge has GHSA-86w9-cpqp-85rv. These are build/tooling paths rather than the app's booking API or SecureStore session handling. Do not expose Metro/Expo CLI publicly or process untrusted glob patterns/certificates in build jobs. Use isolated build workers and trusted signing inputs. Reassess when the upstream packages release fixes.
- Native xcode → uuid advisory GHSA-w5hq-g745-h8pq was removed with a scoped uuid 11.1.1 override. TypeScript and bundle checks verify compatibility.

Remaining findings are explicitly recorded, not suppressed or described as fixed. Re-run audits before release; any new runtime high/critical advisory blocks the production CI audit gate. External security review and real checkout/device checks remain testing work.
