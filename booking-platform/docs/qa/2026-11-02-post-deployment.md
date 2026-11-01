# Booking and CRM verification — 2 November 2026

The available checks passed. This is not payment-provider certification or confirmation that the VPS command integration and inactive workers have been enabled.

## Deployed application checks

The checks ran against `https://maxtravel.in` and `https://crm.maxtravel.in` after the two-app VPS update.

| Check | Result |
| --- | --- |
| Both application health endpoints | Passed |
| TripJack domestic one-way, return, international, family and multi-city flight searches | Passed; each returned priced results |
| Goa destination mapping, hotel availability and room pricing/policies | Passed |
| Same-airport and past-date validation | Rejected correctly |
| Cross-origin search and another guest's hotel-search access | Rejected correctly |
| Anonymous flight/hotel review | Requires sign-in |
| Twelve public booking pages, including support and policies | Rendered successfully |
| Sixteen anonymous booking/CRM data and mutation requests | Denied with HTTP 401 |
| Unsigned integration requests | Rejected; this does not prove a valid signed request can complete |
| PayGlocal availability | Disabled as required |

The real browser exercised flight search, non-stop filtering, fare comparison, sign-in handoff, Goa destination selection, hotel search, property details, gallery navigation and Escape dismissal. Supplier photographs, room totals and policies rendered without captured browser errors. No paid transaction, supplier booking, refund or customer message was created on the VPS.

## Isolated verification

| Check | Result |
| --- | --- |
| Current booking unit suite | 487 passed |
| Booking desktop/mobile browser baseline | 610 passed |
| Held PayGlocal browser cases | 4 passed; 6 hosted-checkout cases remain skipped pending provider confirmation |
| CRM complete UI journeys | All 11 groups passed: authentication, first setup, operations, sales, records, customer data, administration, money, incoming media, case workflow and reporting |
| CRM main workspace audit | 86 desktop/phone screens and 7 transaction journeys passed |
| CRM assignment/review workflow | 48 desktop/tablet/phone captures; separate staff submission and administrator approval passed |
| CRM visa journey | Passed |
| CRM accessibility gate | Zero findings outside the empty accepted budget |
| Current booking production build and workers | Built successfully |
| Signed booking → CRM transaction workflow | Passed for flight and hotel |

The cross-app test used disposable PostgreSQL, SQLite and SMTP services with simulated supplier responses and a synthetic legacy-gateway capture. It exercised actual local HTTP routes, workers, signed events, databases and customer/admin/staff browsers. Both products produced permanent CRM case IDs and exactly one receipt and invoice. Event replay produced no duplicates; a forged signature was rejected. Administrators assigned work, staff started and submitted it, a separate administrator approved it, and staff finance access remained denied. This was not a PayGlocal transaction or a live TripJack issuance.

Reporting checks included statements and closing balances, supplier settlements, scoped filters, work/cash drill-downs, Excel and PDF output, dirty/applied filter isolation, delayed responses, explicit retries and read-only export denial.

## Issue found and corrected

On the deployed hotel form, loading Goa suggestions and then shortening the query to `G` left Goa choices visible. The destination component now clears previous choices, messages and mapping controls immediately when the customer edits the query. An abandoned lookup cannot apply its parsed response after cancellation. Empty results give a spelling/nearby-city suggestion instead of operational instructions.

A fresh production build, focused lint and 48 relevant desktop/mobile browser checks passed after the correction, including six new destination-recovery cases. The 610-test result above is the pre-fix baseline; it is not presented as a second full-suite run after this small correction.

Temporary dependency-link and missing-worker-build problems in the new test workspace were resolved before the successful cross-app run. They were fixture setup failures, not deployed application failures. All PostgreSQL and SMTP containers created by this verification were removed; unrelated containers and production databases were untouched.

## Still required on the VPS

1. Roll out the hotel autocomplete fix. A Git push alone does not update the VPS containers.
2. Configure the reverse CRM command URL, a distinct command-signing key and individual staff identity mappings. Use existing verified, MFA-protected booking administrators with appropriate permissions; do not map all staff to one owner.
3. Review queues and deliberately activate the required booking workers. The successful updater resumed previously active services and intentionally left previously inactive workers stopped.
4. Run authenticated acceptance checks on the deployed apps with designated test accounts. Existing production staff credentials and MFA were not available to this verification.
5. Obtain the remaining PayGlocal travel-payload and verification confirmations, then run genuine UAT payment, issuance, failure, cancellation and refund scenarios before enabling checkout.

Detailed local evidence is retained in the ignored `.artifacts/vps-uat-20261102` directory. No private runtime configuration, credentials or customer records are included in this document.
