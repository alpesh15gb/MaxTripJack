# Post-deployment live verification — 16 November 2026

Tested deployed maxtravel.in through its browser UI at desktop 1440×1000, mobile 390×844 and pricing dialog 320×844. Signed-in session already existed. No payment was submitted, no booking created, no production pricing rule saved, and AUDITNOV16 remained disabled.

## Live results

- Flight search BOM–DEL, 23 November, one adult: 226 options. Local SpiceJet logos loaded, carrier filter worked, exact duplicate segment groups shared fare choices. Connections through IXB/GOI displayed elapsed durations and layovers. GOX remained unknown (fixed below).
- SpiceJet SG252: search and reviewed total INR 5,029.93. Cancellation bands were visible, DOB required, PAN optional. Synthetic traveller details reached Review & pay. Invalid AUDITINVALID promo produced a definite rejection and kept the price/pay availability unchanged.
- Mobile reload restored SG252 as a saved selection, explained private details must be re-entered, and successfully re-reviewed its current fare. No horizontal overflow on the tested checkout (375px document inside 390px viewport).
- Hyderabad hotel suggestions distinguish identically named supplier regions as Hotel collection 1/2. Selected collection returned 46 stays for 23–24 November, one guest/room. Mobile results, room selection and desktop/mobile checkout were visually checked.
- Fabhotel Ssr Fern Suites, Executive Room/Breakfast: INR 2,651.37. The previously rejected rate now reviewed successfully. Primary-guest PAN was explicitly required by this rate, blank PAN produced a field-linked error, synthetic valid-format PAN allowed review. No supplier booking was submitted.
- Hotel Lake View Airport Zone, Standard Room/Room Only: INR 2,708.78, non-refundable. Returning to stays, selecting another property and re-reviewing kept the in-page guest draft. Refreshing the live quote displayed “Total unchanged. No differences detected in the comparable details. Some terms could not be compared.” No false changed-cancellation warning was shown.
- Admin saved rules still show Flight 15% + INR 5 and Hotel 15% + INR 15 + INR 300. Hotel preview for supplier INR 10,000 showed INR 11,815; entering a 2% supplier-based fee changed the preview to INR 12,015. Closed without saving. Edit/remove actions visible. At 320px the dialog clientWidth and scrollWidth both measured 254px.
- Packages still fail to load; the improved trip-planning/contact recovery links are live. CRM catalogue deployment remains an external dependency. This audit does not claim that outage is fixed.
- Live 6001 rejection was not reproduced today, so its error recovery is covered by local browser regressions rather than claimed as newly reproduced live. Accepted promo application was not retested against production because the audit promo is disabled; apply/remove and uncertain outcomes are regression-tested with synthetic responses.

## Further fixes from this verification

1. Add a verified GOX→Asia/Kolkata timezone mapping, preserving unknown/DST ambiguity safeguards. This fixes missing duration on BOM–GOX–DEL connecting results. Provenance is recorded in airport-timezones.source.json.
2. Permit returning from traveller editing to promo recovery after an uncertain request, while keeping payment locked until a successful apply/remove or fresh reviewed quote. Keep a persistent recovery message when flight extras remount the promo component, plus an action to focus the promo input.
3. Clear stale price-refresh success feedback when deliberately returning to room/flight selection, including browser Back. Preserve errors and payment-recovery protections.

## Validation scope

616 unit tests passed. Production build/TypeScript and lint passed. 50 desktop/mobile browser cases passed for pricing/promos, refreshed terms and durations, followed by a final focused rerun after the stale-feedback fix. Provider responses in local tests are synthetic. Live testing stopped before Agree & pay; payment-provider launch, capture, supplier booking and refund execution were not repeated.

Screenshots: `.artifacts/postdeploy-live/hotel-refresh-desktop.jpg` and `hotel-refresh-mobile.jpg`. Browser regression output: `.artifacts/postdeploy-browser*.log`. Further fixes require another deployment; the live observations above refer to the already deployed 4c17ad2 behavior.
