# Coding delivery status — 18 October 2026

The public/corporate flight and hotel application is implemented locally across the website/backend, Android/iOS source, admin operations and custom CRM integration. Actual provider acceptance remains unverified without TripJack and Razorpay test credentials. This is not provider certification or security certification.

## Implemented

- Domestic/international one-way, return and multi-city flights (2–6 legs), cabin classes, adults/children/infants, group-aware fare selection, fare rules, expiring server quotes and document requirements.
- Airport/destination/nationality directories, Hotel v3 availability, room review and up to four rooms with separate adults, child ages and guest assignments. Checkout validates child dates of birth against each room’s searched ages.
- Razorpay test checkout, server pricing, captured-payment verification, signed/deduplicated webhooks, wallet preflight and supplier workers.
- Confirmation details/PDFs, booking history, saved travellers, account verification, corporate/admin MFA and permission controls.
- Full or selected-flight/passenger cancellation requests, operations charges/offers, customer acceptance, one-time supplier submission and amendment polling. A partial cancellation leaves remaining travel active. Confirmed refund offers accumulate; refunds cannot exceed accepted terms or the original captured balance.
- Initial flight checkout supports reviewed meals/baggage and eligible non-exit-row seats through the website and mobile app. Server pricing, atomic quote locking, pre-payment fare validation, one-time supplier submission and SSR fulfilment checks apply. Unverified extras leave successful supplier bookings in manual review.
- Post-ticket seat, meal and baggage purchases, including connecting-trip baggage propagation and zero-cost additions. Each purchase has its own linked record, payment (when payable), supplier job, receipt and CRM invoice. Infants are excluded; booked seats, duplicate seats and invalid supplier selections are rejected.
- One-time rescheduling: original passenger/PNR lookup, replacement search, review, separate additional payment, auto-reissue and new ticket confirmation. One trip at a time, no cabin downgrade. Original and replacement records remain traceable.
- Durable recovery: supplier purchases are never submitted again after an uncertain outcome. Extras with lost amendment IDs remain in manual review; authorised staff can link the complete set of recovered IDs, which must match the original supplier booking. Fulfilment checks both the charged amount and returned segment/passenger SSR codes.
- Admin records, account pricing, refunds/second review, reports, audit, queues, worker health and recovery controls.
- Signed CRM snapshots, stable delivery retries, payment-method and supplier identifier mapping, partial-refund balances, linked service invoices and ticket void/reissue statuses where route mapping is unambiguous. Signed CRM-to-booking commands now expose scoped staff status/cancellation/refund/reconciliation controls while retaining existing approvals. Stable generated booking PDFs are imported privately into CRM and can be sent by the consent-controlled BOOKING_DOCUMENT Meta automation. See ../crm-review/TWO-WAY-BOOKING-INTEGRATION.md.
- Email notifications, encrypted PII, ownership isolation, bounded requests, database rate limits, script nonces, restricted database-role provisioning and hardened deployment/backup/release configuration.

## Verification

26 unit/security tests pass. Simulated flight/hotel booking, extras/reissue, partial cancellation, refund, authentication/ownership and CRM receiver flows pass. Web/mobile/CRM TypeScript, web lint/build, worker bundles and Android/iOS JavaScript exports pass. Production HTTP nonce/security checks pass; the production browser form supports selecting multi-city mode and adding flights.

No actual supplier reservations, Razorpay charges/refunds, external customer messages or production deployments were made. The CRM integration was subsequently pushed to alpesh15gb/MaxTravel main as 42e1c8e; the canonical CRM checkout is D:\Travel CRM\travel-os. Subsequent Meta Cloud API and PDF delivery changes are pushed through 2cadfd9. Mobile exports are JavaScript bundles, not signed APK/IPA releases. See SECURITY.md for previously assessed upstream development-tool advisories.

## Acceptance and release work deferred

- Supply real TripJack UAT and Razorpay test configuration; validate actual payload variants, availability, wallet behaviour, prices, amendments, reissues, webhooks and timeout cases.
- Physical-device, independent security/load and backup/restore acceptance.
- After acceptance: production service/domain/VPS/SMTP/CRM configuration, signing, deployment and store submission.

## Product boundaries

Initial extras are optional and limited to supplier-offered selections. Exit-row eligibility requires staff assistance. There are no insurance, package, cruise or car-rental products. Requests with ambiguous passenger names/IDs or incomplete supplier fields require operations assistance. Extras after a partial cancellation/reissue, ancillary refund disputes, and cancellation of unchanged travel after partial reissue require staff reconciliation; the replacement ticket can be cancelled from its own booking. Supplier or airline restrictions always apply.

Setup: INTEGRATION-GUIDE.md. Advanced flight contracts: FLIGHT-SERVICES.md. Mobile: ../mobile-app/README.md. CRM: ../crm-review/BOOKING-INTEGRATION.md. Local website: http://127.0.0.1:3000 ; admin: /operations. No default/shared admin login exists.

## Pre-UAT audit

See UAT-READINESS.md for the 18 October source audit, fixed payment-retry/traveller-binding and lookup reliability issues, and the pending provider acceptance matrix. The local preview remains on the prior version because replacement was blocked; visual acceptance is not claimed.
