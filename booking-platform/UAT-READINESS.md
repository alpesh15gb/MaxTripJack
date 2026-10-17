# Before demo credentials arrive — coding audit, 18 October 2026

This is a source review and simulated verification record. It is not TripJack acceptance, independent security certification, a device test or production approval.

## Fixed in this audit

- Payment retries cannot silently reuse an order whose traveller or contact details differ from the edited form. Names, contact information and room assignments remain bound to the original encrypted order. Conflicts return 409; an identical retry reuses the existing gateway order.
- Website flight passenger fields use the saved reviewed passenger counts, even if search controls were edited after a search.
- Airport lookup errors no longer assign an invalid result to the suggestions list and crash the booking form. Three-letter airport codes remain usable.
- The hotel destination field cannot be edited while its selected hotel group is loading, preventing an older selection from overwriting a newer typed destination.

## Monday configuration — private environment only

- TripJack flight and Hotel v3 UAT keys, plus confirmation of the correct UAT account, wallet balance and any provider account requirements.
- Razorpay test key ID/secret and a separate webhook signing secret. Configure the reachable test callback at `/api/webhooks/razorpay`.
- A working test email service for verification, password reset and booking notices.
- CRM event URL and matching signing key/key ID on both sides. Keep existing encryption, authentication and integration secrets secure; do not rotate them merely to test the app.
- Meta configuration and approved utility templates are required only for the separate CRM WhatsApp tests.

See INTEGRATION-GUIDE.md for exact variables, migrations, catalogue sync and worker startup. Do not use production payment keys or production reservations for this acceptance run.

## Provider acceptance matrix — all pending real credentials

| Flow | Required evidence |
| --- | --- |
| Flight search/review | Domestic, international, return, multi-city and connecting journeys; price changes and session expiry |
| Initial extras | Correct passenger/segment codes, connecting baggage charged once, seat unavailable after selection, free/paid meal, fare-validation totals and fulfilment fields |
| Payment | Successful capture, failed/dismissed checkout, duplicate webhook, modified signature, amount mismatch and delayed capture |
| Supplier booking | Wallet preflight, successful ticket/voucher, connection loss after Book, polling recovery and no duplicate submission |
| Hotels | Different guests/child ages in each room, exact DOB matching, nationality, room availability, cancellation policy changes and supplier re-review |
| After sales | Full/partial cancellation, accepted terms, confirmed refund, partial refund balance, post-ticket extras and one-time reissue |
| CRM | One booking/payment per event, retries, stale events, cancelled/refunded balances, service invoices and mixed-room itinerary retention |
| Accounts | Public ownership isolation, corporate approval/MFA, admin permissions and suspended-account denial |
| Notifications | Customer email, ticket/voucher PDF, and separately configured WhatsApp templates/PDF delivery/STOP |

Record booking/order references and sanitized results. Never attach API keys, cookies, passwords, passport/PAN details or full provider payloads to a public issue.

## Known boundaries and remaining release work

- Ambiguous supplier identifiers, exit-row eligibility and complex combinations of partial reissue/cancellation/extras require staff assistance.
- CRM incoming WhatsApp media download remains separate. Automatic signed confirmation-PDF import and optional consent-controlled BOOKING_DOCUMENT delivery are now implemented; configure and test both directions using crm-review/TWO-WAY-BOOKING-INTEGRATION.md.
- Physical-device validation, independent security/load checks, backup restoration, production configuration and signed APK/IPA releases remain pending.
- The local preview still runs the preceding version. Its replacement was blocked by automatic approval review; browser verification was blocked by browser access policy. Source builds and simulated API checks do not establish visual acceptance.

## Local checks

`npm test`, `npm run test:checkout`, `npm run test:providers`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run build:workers`. Provider-flow scripts intercept outbound provider/payment requests and use synthetic identities in the local test environment. They do not prove real supplier payload compatibility.
