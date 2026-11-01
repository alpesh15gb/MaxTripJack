# TripJack UAT preview verification — 2026-11-01

The latest tested runtime is booking commit `0cde2ed44de65961dff05b432278b4e54ad9064b`, deployed as `dpl_3J9dG5FEWAdy9qrPw11Ksc8WHDSS`:

https://maxtravel-booking-preview-e8hsjmclz-alpesh-manjiyanis-projects.vercel.app/

## Verified configuration and deployment

- Both `TRIPJACK_FLIGHT_API_KEY` and `TRIPJACK_HOTEL_API_KEY` are Secrets scoped to Preview only. The owner entered the values; verification read metadata, not secret values. Equality of their values was not independently inspected.
- Both variables were initially Production-only and were moved to Preview without reading or replacing their values.
- Migration `019-cancellation-reconciliation` was applied transactionally to the existing isolated `maxtravel_booking_preview` database. There are now 19 migrations; all six recovery columns exist and existing order/cancellation counts were preserved. No VPS migration was run.
- Vercel's existing project is not Git-linked. A Git-source deployment failed; the successful deployment used reviewed committed source files and excluded local environment files, credentials and untracked files.
- The Vercel build completed successfully. Health returns HTTP 200 with `status: ready`.
- Payment configuration returns HTTP 200 with `provider: PAYGLOCAL` and `configured: false`. The existing payment confirmation hold remains in force.

## Actual supplier checks

| Check | Observed result | Interpretation |
| --- | --- | --- |
| Browser flight search, BOM → DEL, 2026-11-08, one adult, economy | Application HTTP 502; supplier HTTP 200 with numeric error `408` | Supplier access rejected; no search results, quote or booking was created by this attempt. |
| Hotel nationality lookup | Application HTTP 502; supplier HTTP 200 with numeric error `408` | Supplier access rejected. |
| Goa destination lookup | Application HTTP 200, empty destinations | Preview catalogue needs syncing. A database count confirmed zero hotel destination rows. |
| Customer failure UI | Recovery message and disabled-payment notice remain visible | Supplier credentials and raw error payloads are not exposed. |

TripJack's [published error-code reference](https://tripjack.com/page/api-doc-v2) defines numeric supplier code 408 as Access Denied. This is distinct from HTTP status 408; the upstream HTTP status observed here was 200. IP or account/product access restrictions are possibilities, not a confirmed diagnosis. The owner previously reported successful requests from the VPS, but that earlier result does not prove Vercel egress is approved.

## Code and regression checks

- Server-side credential reads trim surrounding pasted whitespace; flight and hotel credentials remain separate and missing product credentials fail closed.
- Supplier failure diagnostics contain only product, upstream HTTP status and at most eight bounded numeric supplier error codes. They omit keys, headers, supplier messages, raw bodies, booking IDs and traveller data.
- 487 unit tests passed, including malformed/error-text redaction and separate-product credential checks.
- Changed-file lint, TypeScript checking and all worker bundles passed.

## Still pending

1. Confirm the reason for Access Denied with TripJack and authorize the UAT execution environment. Do not assume a Vercel deployment's inbound address is its outbound supplier address or enable paid networking automatically.
2. Run the existing catalogue sync against the isolated preview database once supplier access is available.
3. Rerun real flight and hotel search, pricing, review and expired/sold-out scenarios. Reviews were not reached by these rejected searches.
4. Obtain the merchant-specific PayGlocal confirmations documented in `PAYGLOCAL-EMAIL-FOLLOWUP.md`; keep new payment initiation disabled meanwhile.
5. Configure isolated continuous workers and complete real supplier/payment/booking/cancellation/refund acceptance. Vercel-to-CRM trust remains unchanged; the owner requested cross-app checks stay local. Existing local signed booking-to-CRM and financial fixture checks are documented separately and are not live supplier acceptance.

No payment was initiated, no ticket/hotel purchase was submitted and no real refund was attempted during these preview checks.
