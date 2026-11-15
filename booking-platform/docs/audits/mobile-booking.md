# Mobile booking layout audit

16 November 2026. Live browser viewport checks on maxtravel.in covered flight search, filters, fare selection, traveller entry, cancellation rules and Review & pay at 390px, plus hotel search, property/room selection, two-guest entry, PAN validation, cancellation rules and price refresh at 320px and 390px. The signed-in browser session was reused. No payment order or supplier booking was created.

The live flight check used SpiceJet BOM–DEL on 23 November. PAN remained optional and blank; the reviewed cancellation windows remained readable. The hotel check used Anmol Continental on 22–23 November with two adults. Only the primary guest's PAN was required, its validation focused the visible input above the fixed action bar, and correcting it cleared the error. Refresh preserved both guest names and showed a neutral unchanged notice when only the active free-cancellation window's start advanced.

## Layout corrections

- At 320px, the flight result's “Choose fare” arrow extended outside its button. Compact spacing and type now keep the complete label and arrow inside a touch target at least 44px tall.
- Hotel result prices could split at the decimal for larger totals on narrow screens. At widths up to 360px, the price and action now occupy separate rows.
- Room rates could split even an ordinary ₹2,046.59 total, and “Continue with room” could break mid-word. Room prices, action buttons and the overview rate preview now stack at widths up to 520px. The room action uses the full available width.

The changes are CSS only. Existing supplier requirements, booking state, authentication and payment behavior are unchanged. No database migration, environment update or worker restart is required; rebuild the app container.

## Regression coverage

Flight tests check label/arrow bounds with ordinary and six-digit totals at 320px. Hotel tests check actual text line boxes, rather than relying only on page overflow: both ₹2,046.59 and ₹1,23,456.78 must remain on one line in results and room actions at 320px and 390px. They also check room action text, target height and page overflow. Supplier APIs and payment SDKs are intercepted in automated tests.

These are browser viewport/device-emulation checks, not tests on physical iOS or Android hardware. Native soft-keyboard behavior and a new live OTP delivery were not exercised in this audit.

Validation: production Next build, TypeScript and ESLint passed. The mobile checkout/policy suites passed 83 cases. Flight/hotel results passed 20 desktop/mobile cases after updating an older test's heading expectation to the existing “Choose your room” page title. Four additional synthetic high-total flows passed, with visual review of results, overview previews, room rates and sticky actions. Screenshots confirmed the corrected prices and complete button labels at both widths.
