# MaxTripJack — booking-experience research and implementation brief

**Research date:** 20 October 2026. **Scope:** public, read-only research; no login, payment, booking, hold, cancellation, or amendment was submitted. This is product/API research, not proof that the repository implements a particular behavior.

## Direction in one sentence

Make booking feel effortless by keeping the trip and final price understandable at every step, while treating supplier confirmation—not a successful button click or payment—as the truth.

## 1. What the leading products actually show

| Product / evidence | Observed or documented pattern | Application to MaxTripJack |
| --- | --- | --- |
| **Google Flights — live desktop search and results inspected** | Editable search stays above results; compact, aligned flight rows; Best/Cheapest tabs; filter chips; visible baggage counts; separate flight-detail expansion. The viewed page labels round-trip prices and tax/fee scope. | Use predictable columns and progressive disclosure. Keep route/date/party editable without restarting. Separate cheap from convenient; explain any “Best” ranking. |
| **MakeMyTrip — official page text inspected; live browser connection reset** | Flight details expose segment timing and fare breakup. Fare-family comparison includes cabin/check-in baggage, cancellation, date change, seats and meals. The page also exposes an unavailable-fare-rules state rather than supplying fictitious terms. | Offer a clear fare comparison before checkout. “Not provided” is not “free” or “refundable.” Provide retry/help when rules cannot be loaded. Do not claim its present pixel design was inspected. |
| **Booking.com — live desktop guest editor and Mumbai results inspected** | Search criteria persist on results. Adding a child displays an age field and disables Done until supplied. Cards combine image, room/bed details, breakfast, cancellation/payment terms, review context and stay price; map and policy filters are nearby. | Model real occupancy, not a decorative guest count. Make the selected room/rate package explicit. Keep full-stay/all-room total primary, nightly equivalent secondary. |
| **Skyscanner — official product page inspected** | Nearby-airport/direct-flight controls, flexible-date discovery, and price alerts are part of its public search proposition. | Good phase-two inspiration for flexible search, only when supported by real inventory/pricing; do not fabricate a fare calendar or alert promise. |

Sources: [Google Flights](https://www.google.com/travel/flights), [Google’s flight-search guide](https://support.google.com/travel/answer/2475306?hl=en-EN), [MakeMyTrip Delhi–Chennai page](https://www.makemytrip.com/flights/new_delhi-chennai-cheap-airtickets.html), [Booking.com](https://www.booking.com/), [Skyscanner](https://www.skyscanner.net/flights).

**Important distinctions:** Google Flights and Skyscanner are search/comparison references, not evidence of MaxTripJack’s checkout contract. Sample prices were transient research observations, not offers or benchmark data. “Leading” here identifies relevant familiar products, not a verified market-share ranking.

## 2. TripJack facts that constrain the design

The [official API reference](https://tripjack.com/page/api-doc) has **Hotels v3** and **Flights v2** tabs; search indexing initially exposed only Hotels.

- **Flights:** Review supplies `bookingId`, session conditions and conditional traveller requirements. Fare alerts require disclosure. Fare Validate is recommended around payment delays; its FAQ prohibits retrying it after errors. `CLASS_SOLD_OUT` can change class, baggage, price and rules and remove seats. Book must use authoritative reviewed fare. Booking Details distinguishes pending, held and successful orders. Amendments require successful bookings, then separate status resolution.
- **Hotels:** Dynamic Detail owns bookable rates; static metadata is not live availability. Review immediately precedes Book. Preserve room allocations and required child ages. Book acknowledgement is not confirmation: query Booking Details, with documented five-second polling for up to 180 seconds. Cancellation acknowledgement likewise needs final-state verification.
- **Integration caution:** Hotel overview uses `searchId`/`reviewId`, while detailed examples use other identifiers; endpoint examples also differ. Verify the repository’s approved version and contract fixtures with TripJack before changing adapters. Never mix versions or expose keys. Production requires provider approval after UAT.

Read the named tabs and sections directly when implementing; this summary is not a replacement for the partner contract.

### Implementation clarification from the official linked samples

The documentation links a public sample folder. Its [Special Return.zip](https://drive.google.com/file/d/1nzqqP9w9g2Hx4yBk3MFiu6D6hxtKCemu/view?usp=drivesdk) was downloaded and parsed read-only. In `WITH MSRI/1A_1C_1I_Search_Response.txt`, `sri` is a scalar string and `msri` is an array of strings. This is stronger shape evidence than the reference table’s combined String row. Match whole identifier values; JavaScript string substring matching is unsafe. The `Without MSRI` example has empty arrays and absent `sri`, so that mode requires deliberate handling rather than assuming every special-return fare carries a pairing identifier. No request from the sample collection was executed.

**Uncertainty handling recommendation:** the public retry FAQ does not define crash/lost-response replay semantics. An uncertain dispatched validation must not be treated as safely retryable merely because the application restarted. Persist/reconcile the attempt, and seek provider clarification where the status cannot be established.

## 3. Proposed end-to-end flow — engineering/design recommendations

These are recommendations for MaxTripJack, not claims about competitors’ internal implementation.

### Flights

1. **Search:** one canonical route/date/party/class state. Home search should lead directly to results, not force the same form twice. Airport suggestions distinguish city from airport; reject equal origin/destination and invalid date order inline.
2. **Compare:** show airline, local departure/arrival dates, duration, stops, baggage, refund/change summary and clearly scoped total. Expose overnight arrival, airport change and separate-ticket risk when data supports them. Select every required leg before continuing.
3. **Choose fare:** comparison of inclusions and restrictions; mark the selected fare, not a default premium upsell. Treat unknown supplier data explicitly. Keep rules reachable without losing selection.
4. **Travellers and extras:** required fields follow the selected itinerary’s contract. Validate on blur and on continue; take focus to the first error. Optional extras begin unselected and remain associated with the right traveller and segment. Preserve form edits when stepping back.
5. **Review and pay:** persistent itinerary and itemized total; clear final action and terms. Any materially changed fare or benefit needs a visible before/after summary and deliberate acceptance. Removed seats must not remain in the visual summary or total.
6. **Confirm:** show separate payment and supplier-booking progress. Only confirmed fulfilment receives the success treatment and ticket/voucher actions. A hold is not a ticket; show its deadline and next action distinctly.

### Hotels

1. **Search:** destination, check-in/out, nationality where required, and a real per-room occupancy editor. Require one age per child and preserve the submitted room arrangement.
2. **Compare properties:** image, location, meaningful amenities and price scope; prioritize breakfast/refund filters over an overwhelming filter wall. Do not invent ratings, reviews, distances, amenities or scarcity.
3. **Choose a room package:** show each room slot, occupancy, bed/room type, meal plan, cancellation penalties and payment timing. Never combine mutually incompatible room options into a synthetic rate.
4. **Guest details and final review:** show what changes if dates/party change; invalidate old rate selections while retaining safe guest input. Keep property policies and payable-at-property amounts visible.
5. **Booking and receipt:** pending remains pending. A final voucher includes the actual selected rooms, guests, dates, payment summary and cancellation terms. Unsupported changes route to assistance rather than a misleading self-service button.

## 4. Reliability rules that should be fixed before decorative polish

**Priority 0 — money, identity, and fulfilment**

- Keep payment attempt, supplier booking and fulfilment states separate; do not collapse them into a single Boolean.
- Persist an attempt identifier before any side-effecting call. A server restart, mobile interruption or timeout should reconnect to that attempt, not create a replacement payment or reservation.
- Guard repeated taps in both UI and server. Inspect authoritative status before deciding whether an uncertain attempt may be retried. Do not use a global automatic retry wrapper for booking/payment/amendment APIs.
- Distinguish terminal failure from unknown outcome. Offer “Check booking status” and a reference/help path rather than “Pay again” when the outcome is uncertain.
- Enforce authorization server-side for trips and payment references. Partition caches by signed-in identity; cancel requests and remove private trip/traveller state on logout or account switch.
- Keep credentials and sensitive traveller/payment values out of client bundles, URLs, analytics and ordinary logs. Log sanitized correlation/attempt references instead.

**Priority 1 — query consistency and honest information**

- Use request generation IDs or cancellation so older responses cannot overwrite newer searches. Key caches by the complete criteria, including occupancy and dates.
- Preserve search/filter/scroll state across detail → back; do not reuse a stale selected fare merely because its visual card remains.
- Use currency-safe server arithmetic; do not trust browser totals. Show base fare/rate, taxes, fees, extras and discounts with an unambiguous payable total.
- Display real session expiry from server metadata. Expiry should explain what needs refreshing without erasing the traveller’s work.
- Cancellation/reissue: choose the exact traveller/segment scope, fetch current charges, show fee/refund summary, obtain explicit confirmation, then track the amendment separately from refund settlement.

## 5. Visual and interaction brief

- **Shared brand, task-specific density:** reuse MaxTravel CRM’s approved brand tokens and typography, but make ticket search a focused customer experience rather than a dense admin table. The existing CRM design must be inspected before claiming visual consistency.
- **Palette:** warm-neutral or cool-white canvas, dark ink for content, one primary brand accent. Green means a verified benefit or completed state, amber means attention/pending, red means an actionable error—not decoration.
- **Hierarchy:** route/property and times first, total and CTA next, rules/benefits third. Align totals and tabular times so scanning feels easy. Avoid multiple equally loud actions.
- **Layout:** compact editable search strip; results in a stable card grid/list; desktop filters in a sidebar and mobile filters in a dismissible sheet. A mobile sticky total/CTA must not cover form errors or legal text.
- **Checkout:** a short labelled stepper, persistent summary, generous input spacing, and a clear Back action. Keep promotional banners out of payment and traveller steps.
- **Motion:** short transitions for expanding details and selecting fares; honest skeletons for loading. Respect reduced motion. No fake progress, countdown pressure or invented scarcity.
- **Accessibility:** real labels, visible keyboard focus, announced loading/error states, focus return after modal dismissal, and adequately sized touch controls. Icons supplement—not replace—baggage, refund and status text.
- **Copy:** calm and specific. Examples of intent: “Price updated—review changes,” “Checking confirmation—do not pay again,” and “No options match these filters—clear filters.” Localize consistently rather than mixing languages at random.

## 6. Acceptance tests for the revamp

| Scenario | Required result |
| --- | --- |
| Search from home; edit a date on results; back/forward | No duplicate form journey; one consistent query and correct results. |
| Search A responds after newer search B | A cannot replace B, including on mobile. |
| Two rooms with different adults/children | Exact allocation and child ages reach the adapter and return to review unchanged. |
| Missing child age or conditional identity field | Inline explanation and no invalid continuation; values survive correction. |
| Price/benefit change or fare/session expiry | No silent acceptance; refreshed summary and explicit next action. |
| Double-tap payment/book, lost response, restart while STARTED | At most one intended charge/reservation; resume/status reconciliation. |
| Payment succeeds but supplier remains pending | No ticketed badge, no second-payment prompt; truthful pending/reference state. |
| Leave checkout and return; background app then resume | Existing attempt and safe draft recover; no automatic resubmission. |
| Account A logs out; account B signs in | No A trip, traveller, ticket or payment data survives in B’s UI/cache. |
| Partial traveller/segment amendment | Scope and charges are clear; acknowledgement is not shown as completed refund. |
| Keyboard and narrow/mobile screen | Search, filters, fare selection, forms and summary remain usable; no occluded CTA/errors. |
| Empty/error states | Meaningful recovery, no invented availability, badges, prices or policies. |

## 7. Evidence and limits

- Public Google Flights search/results and Booking.com occupancy/results were inspected live in the cloud browser. The Booking.com research search used Mumbai, 3–5 November 2026, two adults, one room; no reservation was created.
- MakeMyTrip’s official result content was accessible through web retrieval. Direct browser navigation returned `upstream connect error ... remote reset`; therefore no live layout or checkout-verification claim is made.
- Skyscanner evidence is its official public page, not a completed live comparison journey.
- TripJack’s live reference tabs and relevant booking/review/FAQ/amendment sections were read. No authenticated API request was made and no sandbox contract was executed.
- [Google’s baggage-price explanation](https://support.google.com/travel/answer/9074247?hl=en-CA) reinforces comparing actual included baggage rather than base prices alone.
- [Booking.com’s partner-booking FAQ](https://www.booking.com/tpi_faq.html) explicitly describes confirmation waiting; it is a particular partner-booking help page, not a universal promise for every Booking.com reservation.

**Recommended implementation order:** state/payment safety → complete query/occupancy plumbing → search/results and fare/room comparison → checkout/status UX → responsive/accessibility polish → fixture-backed regression testing → provider-approved UAT. Do not deploy merely because the interface looks finished.
