# UAT readiness

## Update — 1 November 2026

User-supplied diagnostics from the running VPS booking container confirm TripJack flight and hotel keys are configured. A direct UAT DEL–BOM search returned HTTP 200, success and 250 results; the hotel nationality lookup returned HTTP 200, success and 207 entries. Application-layer flight search then returned a search reference and 243 results. The app found India in its nationality list, mapped 100 Goa hotel IDs, and returned a hotel search reference with 31 available properties. These checks establish those search/catalogue paths, not fare review, booking, payment or after-sales acceptance. Razorpay key ID, secret and webhook secret were absent from that container at the time of the check.

Protected Vercel previews use isolated synthetic databases. Cross-app verification remains in local loopback fixtures, as requested. The current unit suite has 446 checks; full provider acceptance below remains separate. Preview origin checks now share the same configured/deployment URL resolution for authentication, writes, guest shopping and internal CRM commands.

## Earlier coding audit — 18 October 2026

This is a source review and simulated verification record. It is not TripJack acceptance, independent security certification, a device test or production approval.

## Fixed in this audit

- Payment retries cannot silently reuse an order whose traveller or contact details differ from the edited form. Names, contact information and room assignments remain bound to the original encrypted order. Conflicts return 409; an identical retry reuses the existing gateway order.
- Website flight passenger fields use the saved reviewed passenger counts, even if search controls were edited after a search.
- Airport lookup errors no longer assign an invalid result to the suggestions list and crash the booking form. Three-letter airport codes remain usable.
- The hotel destination field cannot be edited while its selected hotel group is loading, preventing an older selection from overwriting a newer typed destination.

## Monday configuration — private environment only

- TripJack flight and Hotel v3 UAT keys, plus confirmation of the correct UAT account, wallet balance and any provider account requirements.
- PayGlocal’s missing merchant-specific travel payload attachment must be supplied and implemented before the new-checkout code hold can be removed. Valid SDK credentials alone cannot enable payments. Then complete PayGlocal onboarding, UAT MID, signing/encryption KIDs, merchant RSA private key and PayGlocal public certificate. Configure the HTTPS return at `/api/payments/payglocal/return`; independent webhook hints wake authenticated polling, which supplies payment proof. Start the reviewed payment/booking/refund workers before purchases. See [PayGlocal integration](docs/PAYGLOCAL-INTEGRATION.md).
- A working test email service for verification, password reset and booking notices.
- CRM event URL and matching signing key/key ID on both sides. Keep existing encryption, authentication and integration secrets secure; do not rotate them merely to test the app.

See INTEGRATION-GUIDE.md for exact variables, migrations, catalogue sync and worker startup. Do not use production payment keys or production reservations for this acceptance run.

## Remaining provider acceptance matrix

| Flow | Required evidence |
| --- | --- |
| Flight search/review | Domestic, international, return, multi-city and connecting journeys; price changes and session expiry |
| Initial extras | Correct passenger/segment codes, connecting baggage charged once, seat unavailable after selection, free/paid meal, fare-validation totals and fulfilment fields |
| Payment | Hosted UAT capture, declined/closed checkout, valid encrypted/signed requests, forged callbacks, amount/currency/reference mismatch, lost initiation response and delayed capture |
| Supplier booking | Wallet preflight, successful ticket/voucher, connection loss after Book, polling recovery and no duplicate submission |
| Hotels | Different guests/child ages in each room, exact DOB matching, nationality, room availability, cancellation policy changes and supplier re-review |
| After sales | Full/partial cancellation, accepted terms, confirmed refund, partial refund balance, post-ticket extras and one-time reissue |
| CRM | One booking/payment per event, retries, stale events, cancelled/refunded balances, service invoices and mixed-room itinerary retention |
| Accounts | Public ownership isolation, corporate approval/MFA, admin permissions and suspended-account denial |
| Notifications | Customer email, ticket/voucher PDF, and permission-scoped private CRM attachment access |

Record booking/order references and sanitized results. Never attach API keys, cookies, passwords, passport/PAN details or full provider payloads to a public issue.

## Known boundaries and remaining release work

- Ambiguous supplier identifiers, exit-row eligibility and complex combinations of partial reissue/cancellation/extras require staff assistance.
- Signed confirmation PDFs can be imported as private CRM attachments. Verify document permissions and current booking revision before staff download. The event receiver does not automatically send PDFs or attach them to customer email; customer delivery remains an explicit action subject to payment and audited-exception rules. See [CRM confirmation delivery](docs/crm-confirmation-delivery.md).
- Physical-device validation, independent security/load checks, backup restoration, production configuration and signed APK/IPA releases remain pending.
- The local preview still runs the preceding version. Its replacement was blocked by automatic approval review; browser verification was blocked by browser access policy. Source builds and simulated API checks do not establish visual acceptance.

## Local checks

`npm test`, `npm run test:checkout`, `npm run test:providers`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run build:workers`. Provider-flow scripts intercept outbound provider/payment requests and use synthetic identities in the local test environment. They do not prove real supplier payload compatibility.
