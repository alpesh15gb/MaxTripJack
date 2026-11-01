# Booking operations experience

Review and verification: 1 November 2026.

The customer flight/hotel journey remains a booking experience. Staff operations now use focused, permission-aware registers: Booking journeys, Corporate accounts, Pricing rules, Cancellation requests, Payments, Refunds, CRM & delivery and Activity history. Finance reporting remains restricted to finance permission.

The design follows the connected client/trip workflow documented by TravelJoy, Tern and Travefy, with Zoho's permission-scoped reporting as a governance benchmark. The detailed source links and case-workflow decisions are recorded in the CRM repository's docs/EXPERIENCE-REVIEW.md. These are documentation benchmarks, not a ranked competitor trial.

Each register has durable desk/search/progress/page navigation, readable service/status/money/India-time fields, exact matching counts and a record dialog. Technical references stay in additional details. Actions start from the selected record. Pricing uses an approved-company picker; new refund requests use a captured-payment picker. Read-only staff never receive privileged desks or action buttons. APIs independently recheck permissions and MFA.

Interrupted action responses preserve the original request and reference for retry, including a staff-specific browser-tab recovery record. A browser-storage failure does not block the request. Financial eligibility, supplier state, customer acceptance and separate high-value refund approval remain server checks. A recorded review does not claim supplier cancellation or returned money.

Register CSV exports retain the applied search and progress filters, add an explicit inclusive India creation-date range, and reject more than 5,000 matching rows rather than truncate. Existing financial reports retain their separate activity/cohort definitions and finance-only supplier costs.

Worker and prepaid-wallet checks display business fields rather than a raw JSON block. Missing data remains unavailable; it is not converted into a zero balance or a healthy worker.

Verification: 435 unit tests and 606 production-UI browser checks passed across desktop and phone, including customer search/review/checkout, account/MFA/recovery, after-sales, reports, public pages and the new staff registers. API/SDK fixtures prevent real supplier purchases and payment effects. Provider UAT, live email delivery and physical native-device acceptance require separate evidence. Vercel previews use isolated synthetic databases; no production customer database is copied.

Live review: a protected Vercel Preview passed 30 real browser captures using synthetic admin, operations staff and viewer accounts. Each account registered and verified through local Mailpit, then enrolled with actual authenticator verification before its grant. Real PostgreSQL reads, an admin write and exact replay, foreign-origin denial, anonymous catalogue access and finance permission denials were checked. This does not verify cloud SMTP or supplier/payment effects. Account, My trips, signed-out trip access and the booking form use the compact support footer.
