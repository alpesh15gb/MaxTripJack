# Draft reply to PayGlocal — not sent

**Subject:** MaxTravel integration — missing travel payload attachment and UAT confirmation

Thank you for the integration instructions. We received the email, but no travel payload document was attached. Please resend the exact payload templates for flight and hotel transactions, identifying mandatory billing and travel risk fields. Please confirm the expected country-code format, postal/address requirements, and how to populate travel fields before the supplier issues a PNR/ticket: our flow collects payment before issuance.

We are using your official Node.js SDK (`PayGlocal-Technologies/payglocal-js-client`, commit `5f6a93d61007b831e4d78555a15414e3f5c2e4c0`). Initiation follows your specified UAT PayCollect endpoint, text/plain body, SDK JWS header and SDK JWE payload. Please confirm this is the SDK version expected for our UAT account and share the actual dashboard/key-management links; the forwarded email displayed link labels only. We will configure the UAT MID, KIDs and key/certificate material privately through the dashboard process.

Please also confirm the merchant's callback and independent webhook configuration procedure, webhook signature-verification details if supplied, delivery/retry behavior, and the authenticated status/refund response contract and final refund settlement evidence. Our webhook durably queues status verification; it never trusts incoming financial claims. Browser returns also do not confirm payment.

We have kept new checkout disabled until the travel payload is implemented and the correct UAT credentials are configured. We will then run the merchant acceptance cases. Please do not send private keys or credentials in an ordinary email reply.
