# Verified release — 2 November 2026

Application pins: booking `ae2661754678023929c12bfdc49cd18f83bd1468`; CRM `0a072a6ba5bdc73523ae936cc2b1292c9d694cd4`. Later updater-only commits pin these application revisions and do not change their runtime code. The independently built CRM fixture was compared with all 382 tracked application/schema/build files before its final build. Booking runtime source is unchanged from its tested build; its later commit adds worker tests, CI and operator documentation.

| Verification | Result |
| --- | --- |
| Booking desktop/mobile browser suite | 616 passed |
| Booking unit suite | 487 passed, none skipped |
| PayGlocal held-checkout browser suite | 4 passed; 6 merchant-dependent checks intentionally skipped while checkout is held |
| Actual PostgreSQL PayGlocal contract/runtime suite | Passed, including capture/replay, mismatched bindings, SQL rollback, concurrency, refunds, settlement and idle polling without credentials |
| Seven actual compiled idle worker processes | All heartbeats healthy; no errors, provider HTTP, orders or merchant payment credentials |
| Two-app real local HTTP/database/worker/UI journey | Flight and hotel confirmation each produced one permanent CRM case and one paid receipt/invoice; replay did not duplicate them |
| CRM-to-booking signed commands | STATUS/RESYNC passed; distinct keys, missing-MFA denial, replay and immediate grant revocation verified |
| CRM regression and complete browser journeys | Passed onboarding, fresh setup, authentication/security, customers, sales, operations, records, administration, documents, money, incoming media, visa, case work and reporting |
| Final CRM responsive screen audit | 86 desktop/phone captures and 7 daily-work journeys passed |
| Final case-work browser audit | 4 groups passed; 48 captures, including tablet |
| Final reporting browser audit | Passed filters, metadata, permissions, export/detail and responsive recovery checks |
| Final accessibility audit | Zero findings; zero accepted findings in the budget |
| Import backend contracts | Passed encrypted staging/passports, preview without business writes, duplicates, shared contacts, explicit links, staff eligibility, source replay, expiry, undo protection, database rollback/retry and closed historical cases |
| Import desktop/phone journeys | Passed CSV upload/mapping, status review, double-click protection, lost acknowledgement/reload, old-reference search, provenance CSV, staff submission/separate approval, same-case visa application, access denial and unused undo |
| XLSX security | Valid templates parse; formulas and forged expansion-size ZIPs are rejected before ExcelJS parsing; actual inflation is bounded |
| VPS updater and integration activation contracts | 38 passed |
| Production builds, changed-file type/lint checks | Passed |

All integration data was synthetic and databases disposable. Supplier and gateway responses in the two-app journey were simulated. The separate PayGlocal runtime fixture uses synthetic cryptographic keys and a fake provider transport; it exercises real SQL and SDK payload/signature processing without external provider requests. No real charges, supplier issuance, refunds or customer messages were sent.

The new Import Centre is owner-only and creates operational clients/travellers/cases with assigned review work. It does not import opening balances or manufacture financial, supplier or verified-document history. Source records can be continued through normal case actions while retaining the permanent case ID. Closed historical cases preserve unknown closure dates and must be reopened before new work.

Actual VPS cutover/worker activation remains an operator action using the pinned updater and activation tool. Activation refuses outstanding queues or uncertain commands and requires eligible existing same-email MFA identities, current booking grants and SMTP configuration. No users, MFA flags or grants are fabricated. Keep recovery directories and private logs on the VPS. PayGlocal remains held pending merchant confirmation and real provider financial acceptance testing.
