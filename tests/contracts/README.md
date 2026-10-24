# Cross-app contracts

These tests intentionally import both applications. Run from the repository root:

```sh
npm ci --prefix booking-platform
booking-platform/node_modules/.bin/tsx --test tests/contracts/*.test.ts
```

The `cross-app-contracts` job runs these checks on every push and pull request,
including native-only changes (no path filters). It is required alongside the
independent native workflow; it is not duplicated inside the native bundle job.
Both public review and service-disclosure web/native parity run here. Native
service-disclosure assertions remain in the independent native CI lane and share
the exact same valid/unsafe fixture matrix with the cross-app parity test.
Booking unit count decreases by one; that assertion is retained here. Native
unit count stays unchanged; its cross-app equality loop is retained here as a
second contract test.
Application-local tests must not import a sibling application: production builds
use only `booking-platform/` as their Docker context. The
`isolated-production-image` job builds the complete production Dockerfile with
that exact context, including Next.js TypeScript validation and worker bundles.
No TypeScript exclusions or build-error suppression are used.
