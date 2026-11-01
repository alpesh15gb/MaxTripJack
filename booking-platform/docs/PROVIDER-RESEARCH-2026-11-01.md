# TripJack and PayGlocal research — 2026-11-01

Official documentation review with a targeted comparison against the current booking application. This review used public documentation only; it did not initiate provider payments, bookings or refunds.

## PayGlocal: travel examples found

The official [payload templates](https://payglocal.in/docs/api-reference/payload-templates) include one-way flights, return flights and hotel stays. Flights use `riskData.flightData`; hotels use `riskData.lodgingData`. These provide a concrete mapping reference. The flight sample contains `ticketNumber`, but does not explain payment before ticket issuance. Samples are examples, not a complete required-field schema.

This corrects the earlier assumption that the absent email attachment was our only source for travel payloads. Implementation can now be designed around the published examples, while the unresolved merchant requirements below still need confirmation.

## PayGlocal: remaining contract questions

- **Transport:** the [merchant payment-flow guide](https://payglocal.in/docs/merchant/payment-flow) specifies an encrypted JWE body, a signed JWS header and `text/plain`. This matches our existing implementation and the merchant email. However, the [GPI reference](https://payglocal.in/docs/api-reference/payments-v2/paycollect/gpi) and its [OpenAPI file](https://payglocal.in/docs/openapi-v2-paycollect-gpi.yaml) describe signed JSON. Keep the current account-specific protocol until PayGlocal confirms the applicable version.
- **Country format:** the templates use two-letter countries; the GPI schema describes three-letter billing countries. Obtain the exact convention for this MID before finalizing mapping and validation. Its generic risk schema also omits the travel structures shown in the separate templates.
- **Callback versus webhook:** the [callback example](https://payglocal.in/docs/api-reference/callback-handling) extracts a JWT from the body field `x-gl-token`. The sample decodes it without verifying its signature before updating an order. Decoding alone is not authentication. Our financial transitions must continue to rely on independently authenticated provider status and stored transaction bindings.
- **Independent webhook:** the [webhook guide](https://payglocal.in/docs/merchant/webhooks) documents JSON delivery, public HTTPS, account-level endpoint registration and HTTP 200 acknowledgement, but does not define a JWS verification envelope. The downloaded webhook public key does not by itself establish the signed bytes, token location, expected KID, claims or replay rules. Our existing durable status-check wake-up path remains appropriate until the exact merchant contract is known.

## TripJack: confirmed reference behavior

The live [API reference](https://tripjack.com/page/api-doc) has separate Hotels V3 and Flights V2 tabs. Flight paths still include FMS/OMS V1. Hotels require correlation tracking and a pricing review hash, with a fresh review immediately before booking. Booking confirmation is asynchronous. Cancellation acknowledgement is not completion; `CANCELLATION_PENDING` can require daily checks while TripJack operations processes it. The reference also specifies supplier certification and production IP approval.

The current application already uses those endpoint families, carries hotel correlation/review data, re-reviews hotels before booking and validates flight fares. These findings support the existing integration structure; they do not establish successful real-provider issuance.

## Findings in our code

| Area | Current implementation | Work identified |
| --- | --- | --- |
| Travel payment data | [PayGlocal adapter](../src/lib/providers/payglocal.ts) builds the generic payment/billing envelope; the [travel gate](../src/lib/providers/payglocal-travel-contract.ts) remains closed. | Implement flight/return/hotel mappings from stored itinerary and guest data; align website/native validation and fixtures; obtain the specific missing-field answers. Never invent a pre-issuance ticket number. |
| Long-running hotel cancellation | [Cancellation worker](../scripts/cancellation-worker.mts) selects fewer than five attempts; the [runner](../src/lib/cancellation-runner.ts) schedules ten-second checks. | Add a separate daily reconciliation schedule for pending hotel cancellations, visible staff follow-up and escalation. Preserve the original submission; never blindly resubmit cancellation. |
| Payment authenticity | Browser returns do not mark orders paid. Webhook hints durably request an authenticated status check with reference/amount/currency binding. | Add merchant-specific JWS verification after confirming the actual webhook format; retain independent financial verification and retry recovery. |
| Credentials | Supplied signing/encryption material passed offline cryptographic checks; configuration is staged privately. | Load through the reviewed UAT runtime configuration, register public callback/webhook URLs, then verify merchant acceptance. Offline key validity does not establish account activation or gateway acceptance. |

## Implementation and acceptance order

1. Complete travel mappings and regression fixtures using the public examples. Confirm required fields, ticket-number handling, country codes and applicable request transport before enabling checkout.
2. Extend hotel cancellation reconciliation and exercise multi-day pending outcomes with a controllable clock.
3. Confirm webhook signing details and implement verification fixtures for the supplied public key role, tampered messages and retries.
4. On the UAT VPS, run approved payment success/failure/abandonment, uncertain-response recovery, supplier issuance and delayed cancellation/refund scenarios. Confirm one booking, one receipt and one CRM case/event per transaction across retries.
5. Complete supplier certification and production configuration separately from UAT acceptance.

The [PayGlocal clarification draft](PAYGLOCAL-EMAIL-FOLLOWUP.md) now asks these specific questions and has not been sent. Checkout remains disabled; this research does not change runtime behavior.

## Implementation follow-up

The unblocked coding findings above have now been implemented. See [provider completion and verification](PROVIDER-COMPLETION-2026-11-01.md). The findings table records the audit baseline, not the final code status. Merchant confirmations and actual provider acceptance remain pending; payment activation is still disabled.
