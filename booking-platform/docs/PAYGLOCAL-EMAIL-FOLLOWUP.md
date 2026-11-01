# Draft reply to PayGlocal — not sent

**Subject:** MaxTravel UAT — travel fields, request transport and webhook verification

We found the official [one-way, return-flight and hotel examples](https://payglocal.in/docs/api-reference/payload-templates). Please confirm which travel/billing fields are mandatory for our MID, including their validation rules. Our customer pays before supplier issuance: may `ticketNumber` be omitted at initiation, and is a later update required? Please confirm billing-country format (two or three letters), multi-city flight handling and multiple-room guest mapping, the hotel cancellation-policy codes, and the travel representation for ancillary/reissue purchases.

We use the official Node.js SDK (`PayGlocal-Technologies/payglocal-js-client`, commit `5f6a93d61007b831e4d78555a15414e3f5c2e4c0`). Our encrypted JWE body/JWS header implementation follows your email and [payment-flow guide](https://payglocal.in/docs/merchant/payment-flow). The [PayCollect GPI reference](https://payglocal.in/docs/api-reference/payments-v2/paycollect/gpi) instead describes signed JSON. Please confirm the transport and SDK version enabled for our UAT MID.

We have downloaded UAT signing, encryption and webhook-verification material and checked the signing/encryption files offline. Please confirm the public callback and independent webhook registration procedure. For webhook JWS verification, provide a signed sample with non-sensitive data, exact header/body token location, algorithm/KID selection, signed-byte format, required claims/time units, freshness/replay rules, key rotation and delivery/retry behavior. The callback's body token example does not define the independent webhook contract.

Please confirm sale-status interpretation, refund acknowledgement versus final settlement evidence, and the acceptance scenarios for our account. Our webhook durably requests independent status verification; browser returns and incoming status claims do not themselves confirm payment.

The published one-way/return-flight and hotel mappings are implemented. New checkout remains disabled while the applicable merchant contract is confirmed. We will then run UAT acceptance. Please do not send private keys or secrets in an ordinary email reply.
