# Max Travel booking platform — specification

Status: planning baseline, 14 October 2026. No production implementation or deployment is authorised by this document alone.

## Agreed product scope

- India-based public and corporate customers; customer payments in INR.
- Domestic and international flights and hotels through the subscribed TripJack integration.
- Responsive website, Android application, iOS application, and booking admin panel.
- One account per corporate company; pay per booking through Razorpay. No employee approvals, corporate credit, or company wallet in the initial release.
- Configurable public pricing and corporate pricing, including individual company overrides.
- Supplier bookings funded by the existing prepaid TripJack wallet.
- Automatic booking, payment, cancellation, and refund updates into the existing MaxTravel CRM.
- Customer cancellation requests reviewed and processed by operations initially.
- Working brand: Max Travel; final brand and fee amounts remain undecided.

## Architecture and ownership

Website and mobile apps use one booking backend. The backend owns supplier operations, price calculation, verified payment status, booking state, and refunds. A dedicated booking admin panel operates those workflows.

Recommended stack, subject to compatibility validation: Next.js/TypeScript website and admin; React Native Android/iOS; Node.js/TypeScript backend; PostgreSQL booking database; durable queue/worker; private object storage. Start with a modular backend rather than independent microservices.

The CRM remains a separate application and database. It receives verified business events through an authenticated integration API, not direct database writes. Its SQLite database need not be migrated merely to integrate. Hosting capacity and database concurrency must be assessed before launch.

Supplier calls and background jobs must not depend on a browser remaining open. Provider hostnames, API versions, and timeouts are configured per environment; production is enabled only after required supplier certification.

## Customer journeys

Flights: search → choose itinerary/fare → view baggage and fare rules → traveller/contact/billing details → review live price → payment → supplier booking/ticketing → verified confirmation and documents.

Hotels: search destination/dates/occupancy → property/rooms/meal plan → view cancellation policy → guest/billing details → review live price → payment → supplier booking → verified confirmation and voucher.

Flight and hotel purchases are separate orders initially. Search/review expiry triggers a fresh review; a changed price or material policy requires renewed customer acceptance. Native apps and website share account history and pricing.

Corporate accounts are admin-approved, linked to one CRM corporate customer, and can book for multiple travellers. Saved travellers are records, not employee login accounts.

## Payments and booking integrity

Keep order, payment, supplier booking, ticket issuance, cancellation, and refund states separate. A captured payment alone never marks a booking confirmed.

Illustrative order states: DRAFT, QUOTED, PAYMENT_PENDING, PAID, BOOKING_PENDING, CONFIRMED, BOOKING_FAILED, MANUAL_REVIEW, CLOSED. Supplier-specific statuses map explicitly to internal states; partial outcomes are represented per item/passenger/room where supported.

- Prices, fees, corporate eligibility, currency, and payment amounts are computed server-side.
- Store supplier quote cost, selling price, fees, policy snapshot, acceptance time, and quote expiry.
- Create Razorpay orders on the backend; verify checkout signatures and authoritative payment status. Authenticate and deduplicate webhooks; do not assume event ordering.
- Choose capture/hold/payment sequencing after validating available TripJack and Razorpay flows. Do not assume inventory holds are always available.
- Use unique payment, refund, and booking operation references and durable workflow locks. A timeout is an unknown result: query supplier status before any repeat booking.
- A paid but failed booking creates a recoverable operations case and appropriate refund workflow. Do not refund while supplier success remains unresolved.
- Supplier balance checks, where supported, and internal in-flight funding allocations reduce wallet shortages. Alerts and a replenishment procedure are required; customer payment does not immediately refill the wallet.
- Reconcile customer payments, supplier wallet debits/credits, refunds, and gateway settlements independently.
- Store new-platform money as integer minor units with explicit currency. Avoid floating-point financial calculations.

## Cancellation and refunds

Customer selects eligible items and requests cancellation. Show saved rules and a current estimate if available. Request submission does not cancel travel. Explain urgent support options and that supplier confirmation determines final cancellation status.

Operations obtains current penalties, communicates material differences, records consent where necessary, submits the supplier action, and verifies its result. Track REQUESTED, UNDER_REVIEW, AWAITING_ACCEPTANCE, SUPPLIER_PENDING, CONFIRMED, REJECTED separately from refund status.

Refunds track NOT_INITIATED, CALCULATING, PENDING, PROCESSING, COMPLETED, FAILED. Supplier refund and customer refund are distinct. Preserve original payment references and enforce remaining refundable limits across partial refunds. Default destination is original payment method, subject to gateway capabilities.

Initial proposed policy: no extra cancellation fee; supplier penalties apply. Original booking fee refundability, high-value approval threshold, support hours, and refund communication timings require business decisions. Do not publish them as final terms yet.

## CRM integration contract

Reviewed public CRM commit: 3c58a1a5bbde670022e27f1870103d0ffc6a9144, https://github.com/alpesh15gb/MaxTravel.

Existing reusable models: Customer (INDIVIDUAL/CORPORATE), Traveller, Booking, Ticket, Payment, Invoice, Refund, FinancialEntry, Activity, AuditLog, and WhatsApp queue. Flight booking creation is staff-session based; no dedicated hotel model or TripJack/Razorpay integration was found in the reviewed source.

Proposed receiver: POST /api/integrations/booking-platform/events. Envelope: schemaVersion, eventId, eventType, aggregateId, revision, occurredAt, correlationId, payload. Persist event receipt, model changes, financial journal updates, and any notification enqueue atomically. Return the mapped CRM references and accepted revision. Duplicate events are successful no-ops; stale revisions cannot overwrite newer state. Full authoritative snapshots or explicit gap recovery are required so out-of-order delivery cannot lose intermediate financial events.

Sender uses a transactional outbox, bounded retries with backoff, dead-letter handling, admin retry, and periodic reconciliation. Customer and company mappings use stable platform IDs; do not merge solely on phone/email. Configure default CRM branch and responsible active staff owner.

CRM additions: external identity mappings; integration inbox/event records; supplier and gateway references; structured flight segments; hotel booking/room/guest records; protected document references; sync activity and reconciliation views. Extend reports, financial journal, customer history, permissions, invoices and refunds for hotels.

Do not route supplier cancellations through the existing manual CRM status endpoint. Imported verified payments need a dedicated path: existing manual receipt restrictions must not reject late valid gateway events or silently misallocate money.

Proposed notification ownership: CRM sends WhatsApp using its existing consent-aware queue; booking platform sends email and push. Define event keys/templates once, including hotel and refund messages. No notification should depend on synchronous CRM availability for booking completion.

## Security requirements and threat model

Trust boundaries: browser/mobile ↔ backend; admin ↔ backend; backend ↔ TripJack/Razorpay; worker ↔ CRM; applications ↔ database/storage. Treat all client data and external event payloads as untrusted.

Primary threats: cross-customer/company access, account takeover, price tampering, fraudulent confirmation/refunds, duplicate/replayed events, credential leakage, sensitive-data exposure, malicious uploads, and operational outages.

- Public/corporate authentication remains separate from CRM staff sessions. Verified account recovery, secure password hashing, throttled login/reset, short-lived access sessions and revocable rotating refresh sessions for apps.
- Corporate account MFA and per-device revocation. One shared login cannot reliably identify the individual operator; record this limitation. Account sharing policy and recovery contact need agreement.
- Mandatory admin MFA. Enforce permissions and record ownership server-side for every read/write/export/document action. UI visibility is not authorisation.
- Deny by default; company identity comes from the authenticated account, never a trusted client companyId. Pricing and supplier costs are restricted by role.
- Server-only secrets, separate test/production credentials, managed runtime secret injection, rotation and no secrets in repositories, mobile bundles, analytics, logs, or error responses.
- CRM requests use scoped machine credentials and HMAC over exact body bytes plus timestamp/event ID, constant-time verification, timestamp tolerance, replay tracking, key IDs and rotation. HTTPS remains mandatory. Browser origin controls are not machine authentication.
- Razorpay webhooks follow provider-specific verification. Preserve raw bytes for signature checks. Apply request size and rate limits without preventing legitimate retries.
- Private documents require account/role authorisation before short-lived link issuance. Validate file type/size, quarantine/scan uploaded files, and prevent executable serving and path traversal.
- Minimise passport/PAN collection; encrypt necessary sensitive fields with keys outside the database, mask display, and exclude them from logs. Audit sensitive exports/access. Retention/deletion schedule must include CRM, backups, and providers.
- HTTPS, secure HttpOnly cookies, CSRF protection for browser mutations, restrictive CORS, input/schema validation, output encoding, and a tested content security policy.
- Least-privilege runtime and database access; databases not publicly exposed; restrict administrative networking; dependency scanning, secret scanning, image updates and environment isolation.
- Refund permission separated from routine support. Require step-up authentication for sensitive actions; configurable second approval above the agreed threshold. Every financial action is idempotent, capped, and audited.
- Append-only audit events include actor/service, action, target, timestamp, result and correlation reference without unnecessary personal data. Restrict audit deletion and access.
- Encrypted backups, independently protected keys, restore exercises, incident runbooks, health monitoring and actionable alerts. Set recovery objectives before hosting selection.

## Access matrix

| Actor | Allowed scope |
|---|---|
| Public customer | Own travellers, quotes, bookings, payment status, documents, cancellation requests |
| Corporate account | Its company travellers/bookings and contracted selling prices only |
| Support | Assigned/authorised bookings, masked customer details, operational requests |
| Booking operations | Supplier booking/cancellation operations within assigned scope |
| Finance | Verified payments, reconciliation, permitted refunds and financial reports |
| Pricing manager | Public/company pricing configuration; audited changes |
| Super admin | Account/role/integration management with MFA and audited sensitive actions |
| CRM integration identity | Only permitted incoming event types; no general staff/admin access |

## Delivery milestones

1. API audit: verify official flight reference/version, hotel v3 contract, enabled inventory, holds, amendments, cancellation/refund capabilities, wallet support, quotas, production hosts, and certification.
2. Detailed design: screen inventory, UX, data model, provider state mapping, pricing contract, event schema, threat model and acceptance criteria.
3. Foundation: identity, company isolation, admin permissions, money ledger, secrets, audit, queue and private storage.
4. Flight flow: sandbox search through verified ticketing and failure recovery.
5. Hotel flow: sandbox search through voucher, policies, cancellation and refunds.
6. CRM: receiver, mappings, hotel extension, reporting, notifications and reconciliation.
7. Mobile apps: native payment flows, authentication, bookings, documents and notifications on both platforms.
8. Certification/pilot: supplier UAT, security assessment, restore test, operational rehearsal and controlled launch. All platforms remain in launch scope; delivery dates follow API validation and estimates.

## Release acceptance gates

- End-to-end domestic/international flights and hotels, including multi-traveller/room cases supported by the account.
- Changed price/policy and expired review cannot be bypassed.
- Repeated clicks, worker restarts, webhook replay and supplier timeouts do not duplicate bookings/payments/refunds.
- Paid failures, unknown results, wallet shortages and delayed confirmation remain visible and recoverable.
- Partial cancellation/refund correctness and auditable consent; no cancellation claim before supplier confirmation.
- Customer/company isolation tested on APIs, exports, search and document links; admin permissions tested negatively.
- Forged signatures, altered client prices, revoked sessions and unauthorised refund actions rejected.
- CRM outages, duplicates, stale/gapped revisions and late payment events reconcile correctly; hotel revenue appears in reports.
- Notification retries do not duplicate messages; consent honoured.
- Backup restore, alert routing and incident response exercised; required supplier approval completed.
- Independent security review before public launch, with material findings resolved or explicitly accepted by the business owner.

## Open decisions and evidence

Business: final brand/domain, fee amounts and tax treatment, original fee refundability, support coverage, refund approval thresholds, retention periods, recovery objectives and expected booking volume.

Integration: TripJack flight documentation/version remains unverified. Public hotel v3 documentation: https://tripjack.com/page/api-doc. Validate examples and identifiers against sandbox responses and the partner contract before implementation; do not derive flight versions from the hotel version.

Razorpay integration reference: https://razorpay.com/docs/server-integration/python/test-app/. Recheck current provider SDK and platform documentation when implementation begins.

The public repository review establishes source behaviour only; deployed configuration, database contents, live credentials, runtime capacity and production security were not assessed.
