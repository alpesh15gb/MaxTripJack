# Max Travel Booking

Flight/hotel booking website, admin operations and Android/iOS source with TripJack, Razorpay and signed CRM integration.

- `booking-platform`: Next.js website/API, PostgreSQL and durable workers.
- `mobile-app`: Expo Android/iOS source using the authenticated backend.
- Custom CRM source is maintained separately in [MaxTravel](https://github.com/alpesh15gb/MaxTravel).

## Local setup and builds

Use Node.js 24 and Docker with its engine running. From `booking-platform`:

```sh
npm ci
node scripts/init-local.mjs
 docker compose --env-file .env.local -f compose.dev.yaml up -d --wait
npm run db:migrate
npm run db:auth
npm run dev -- --hostname 127.0.0.1
```

Run `npm run worker:bookings`, `npm run worker:notifications` and `npm run worker:crm` in separate terminals from the same directory. Production compilation uses `npm run build` and `npm run build:workers`.

Follow the [integration and VPS guide](booking-platform/INTEGRATION-GUIDE.md) for deployment and admin setup. Preserve private environment files and encryption keys.

For mobile, run `npm ci` inside `mobile-app`, set `EXPO_PUBLIC_API_URL` to the reachable HTTPS backend origin and follow the [native build guide](mobile-app/README.md). Native Razorpay requires a development/release native build.

## CRM integration

Signed booking snapshots, confirmation PDF import and controlled CRM operations are implemented on both sides. Configure both applications using the [two-way integration guide](https://github.com/alpesh15gb/MaxTravel/blob/main/TWO-WAY-BOOKING-INTEGRATION.md). Corresponding CRM changes are committed through `003a859`. Each app keeps its own database and deployment. References to local `crm-review` documentation in historical guides refer to this separate CRM repository.

## Release status

See [delivery status](booking-platform/DELIVERY-STATUS.md), [UAT readiness](booking-platform/UAT-READINESS.md) and [security controls](booking-platform/SECURITY.md). Real TripJack/Razorpay UAT, deployed CRM acceptance, physical-device validation, production configuration and signing remain pending.

Root GitHub Actions workflows validate both projects separately using their individual dependency lockfiles. Credentials, databases, dependencies and generated builds are excluded from Git.

## CRM security and workflow release

The separate CRM repository includes staff MFA/revocable sessions, sensitive-field encryption, sales proposals, incoming Meta documents, customer import, configurable accountant-approved invoice tax profiles, full credit notes for unpaid standalone invoices, and an auditable supplier settlement ledger. TripJack prepaid wallet bookings cannot be double-counted as CRM payables. Read the [CRM rollout and remaining scope](https://github.com/alpesh15gb/MaxTravel/blob/main/docs/crm-completion-2026-10-18.md) before deployment. Its migrations, private encryption key, backfill, scanner and invoice configuration belong to the CRM deployment. Booking runtime code is unchanged by this CRM release; provider and deployment acceptance remain pending.
