# Max Travel journeys

The user confirmed permission to reproduce the Destina Holidays reference design, including the homepage hero and four feature illustrations. Max Travel uses the reference page structure and interaction patterns with its own logo, colours, copy, business details, and booking services. [Destina Holidays homepage](https://www.destinaholidays.com/)

## Public browser evidence

The team captured the public site in Chrome on 27 November 2026. The captures are stored in `.artifacts/destina-reference/` at the workspace root. The desktop captures show the wide viewport. The mobile captures show the same public URLs at narrow widths, with stacked search fields, a service menu, and full-width account and currency panels. Destina opened on Stays on the first visit and restored earlier search state on a later visit.

| Reference surface | Public URL and capture files |
| --- | --- |
| Homepage and search tabs | [Home](https://www.destinaholidays.com/), [Stays](https://www.destinaholidays.com/#hotels), [Flights](https://www.destinaholidays.com/#flights), [Flight + Hotel](https://www.destinaholidays.com/#packages), [Activities](https://www.destinaholidays.com/#tours). `home-full-desktop.jpg`, `home-full-mobile.jpg`, `home-stays-desktop.jpg`, `home-stays-mobile.jpg`, `home-stays-destinations-desktop.jpg`, `home-flights-desktop.jpg`, `home-flights-mobile.jpg`, `home-package-desktop.jpg`, `home-activities-desktop.jpg`. |
| Navigation and footer | [Home](https://www.destinaholidays.com/). `nav-more-desktop.jpg`, `nav-help-desktop.jpg`, `nav-currency-desktop.jpg`, `nav-service-mobile.jpg`, `nav-flights-mobile.jpg`, `nav-currency-mobile.jpg`, `nav-signin-mobile.jpg`, `account-signin-desktop.jpg`, `footer-desktop.jpg`. |
| Flight results and review | The itinerary drawer leads to `/flight-checkout/{selection}/review`, then `/flight-checkout/{selection}/book`. These paths use a session-specific selection. Captures include `flight-fare-drawer-desktop.jpg`, `flight-fare-drawer-mobile.png`, `flight-review-desktop.png`, `flight-review-mobile.png`, `flight-travellers-desktop.png` and `flight-travellers-page-mobile.png`. [Delhi to Mumbai, 11 January 2027](https://www.destinaholidays.com/compare-flights?from=DEL&to=BOM&depart=2027-01-11&adult=1&child=0&infant=0&cabin=economy&flexible=false) |
| Hotel results and room rates | [Mumbai, 11–14 January 2027](https://www.destinaholidays.com/search-hotels?location=BOM&zone=0&checkin=2027-01-11&checkout=2027-01-14&rooms=1&adult=1&child=0&age=0,0,0,0,0,0), [Fariyas Hotel room options](https://www.destinaholidays.com/search-hotels/hotel-info/1c0ac234-af3f-540d-5cb9-4a520af0de99?location=BOM&zone=0&checkin=2027-01-11&checkout=2027-01-14&rooms=1&adult=1&child=0&age=0,0,0,0,0,0). `hotel-rooms-desktop.jpg`. |
| Support, FAQ and request | [Support](https://www.destinaholidays.com/support), [FAQ](https://www.destinaholidays.com/faq), [Support request](https://www.destinaholidays.com/support/support-request), [Find my trip](https://www.destinaholidays.com/flight-status). `support-desktop.jpg`, `support-lower-desktop.jpg`, `faq-desktop.jpg`, `support-request-desktop.jpg`, `trip-lookup-desktop.jpg`. |
| Discovery and service pages | [Destinations](https://www.destinaholidays.com/destinations), [About](https://www.destinaholidays.com/about-us), [Visa requirements](https://www.destinaholidays.com/visa-requirements), [Travel insurance](https://www.destinaholidays.com/travel-insurance). `destinations-desktop.jpg`, `about-desktop.jpg`, `visa-desktop.jpg`, `insurance-desktop.jpg`. |

On the observed flight search, the direct-only filter reduced the list from 30 to 26 flights. The signed-out browser opened fare rules, the reviewed price, and the blank traveller form. In the hotel property view, changing the meal option updated the displayed stay total by the shown surcharge. The walk ended at the room offers and the blank flight traveller form, before submitting personal details, a reservation, or payment.

## Max Travel routes

| Journey | Entry and steps |
| --- | --- |
| Home and discovery | `/` opens Stays on a first visit and remembers the last selected flight or hotel tab. The four planner tabs have shareable fragments and keep separate drafts when visitors switch tabs or use browser history. `/destinations` offers a searchable Max Travel list with flight and stay search links and activity enquiries. `/flights` and `/flights/routes` lead to route discovery. `/hotels` leads to the local property directory. |
| Flights | `/book?product=FLIGHT` → trip type, airports, dates and travellers → filter and sort results → inspect fare and itinerary → review current total and terms → enter traveller details → continue to configured test checkout and booking status. |
| Hotels | `/hotels` for the property directory or `/book?product=HOTEL` for date-based availability → compare stays → open property and room options → review a supplier rate → enter guest details → continue to configured test checkout and booking status. |
| Holiday and activity planning | The home Flight + Hotel and Tours & Activities tabs prepare enquiry details for `/contact?topic=package` and `/contact?topic=activity`. `/packages` and `/packages/[slug]` expose local itineraries and an enquiry path. |
| Account and trip management | `/account` provides sign-in and account settings. `/travellers` manages saved travellers. `/my-trips` lists the customer's bookings and available after-sales actions. `/my-trips/[id]` shows the current booking status and available documents. |
| Help and travel guides | `/customer-support` provides trip lookup and contact options. `/customer-support/faq` provides searchable answers, shareable answer links, and a compact phone topic picker. `/customer-support/request` prepares a previewable email with editable form fields and a copyable draft. `/about`, `/visa-guide`, and `/travel-insurance-guide` provide local business and travel information. |

Max Travel displays India and INR in its header and footer. Its checkout remains in testing and uses the configured Max Travel payment and supplier services. The reference's Book & Hold illustration links to `/pricing-transparency` and explains reviewing fares before payment. Paid fare holding and live package or activity reservations are outside the online checkout scope. Trip lookup accepts a Max Travel booking reference or airline PNR where the current session permits it. Help, FAQ, and support request links stay on Max Travel routes. Sign-in and payment use Max Travel's own configuration.

## Shopping controls and review

- Flight results include controls to change trip type, edit or swap airports, and change travel dates. When the dates permit it, travellers can run the search a day earlier or later. Preferred airlines can be applied or cleared by name or code. The results offer stops, airlines and price filters, with departure times and connection airports where the itinerary supports them.
- The flight sort strip shows four aligned tiles on desktop and two columns on phones so each label and chosen sort remain readable. Cheapest shows the estimated total, Shortest shows the duration and Earliest departure shows **Leave first**. **More sorts** opens the same-page menu for those three choices and **Earliest arrival**, with unavailable comparisons disabled.
- The flight itinerary drawer shows segment times, connections and fare choices. **Select & continue** checks the selected fare and opens review. Review shows the current total, price breakdown, baggage, fare terms and required travel details. When checkout is configured, the progress indicator follows **Review trip**, **Travellers & payment** or **Guests & payment**, and **Confirmation**.
- Hotel results show meal-plan and free-cancellation filters when supplied rates support them. Both filters must match the same rate, and the result previews the lowest matching offer. The property view groups rates by room combination and lets travellers select an exact rate to compare the stay total, meals, cancellation, and price difference from the lowest rate in that group before asking the supplier to review it. Mixed meal plans show that scope through review. The property header keeps the dates and guest count visible on phones.
- The public `/account` overview opens a sign-in drawer. Account verification and any return to a booking selection use Max Travel's own sign-in and checkout flow.

## Signed-in trips and after-sales

The user chose original Max Travel designs for the signed-in account, booking confirmation and cancellation screens. They use the public site's panel, heading and action styles with Max Travel branding. The public reference walk covered the sign-in entry and blank traveller form. The private screens follow Max Travel's own booking states and after-sales rules.

- **Account and My trips.** The account masthead and quick actions place trips, travellers and price alerts ahead of the security settings. A traveller can dismiss a pending sign-in without an automatic redirect from that dismissed attempt. My trips accepts owned Max Travel references and airline PNRs and groups the customer's bookings by status.
- **Booking confirmation.** The booking page distinguishes a booking record from an issued ticket or hotel voucher. Pending payment, supplier confirmation and refunds appear as separate updates. The detail page links to the applicable after-sales actions.
- **Cancellation and refund.** Eligible customers can request terms from **Changes, cancellation & refund updates**. Where supported for flights, the request can cover selected passengers and flights. The consent action requires the current terms and amounts. On an uncertain response the form keeps the same request for recovery. The detail page distinguishes pending, confirmed and rejected supplier cancellation from refund progress.

## Reference differences

- Flight results offer airline and airline alliance preferences, nearby-date comparison, and remaining-seat badges when TripJack returns a count on the displayed fare. A badge expires 60 seconds after the supplier search starts and is omitted from restored searches and checkout. Alliance filters use published airline membership and classify an itinerary only when its listed carriers share the same alliance.
- Email price alerts support one adult on a one-way search for a specific route, date and cabin. Travellers verify their email before saving a watch and can stop it in their account. Production monitoring uses a separate partner-approved TripJack search credential. See [Flight price alerts](FLIGHT-PRICE-ALERTS.md) for activation.
- The existing verified price-alert dialog is also available from eligible flight review summaries on desktop and phones. The travellers step can show baggage from the reviewed quote.
- The flight results reference shows alerts in the sidebar and within the list, plus destination offers after the sixth flight. Max Travel’s destination panel links to its hotel search and activity enquiry for the arrival city. Its phone layout keeps filters available inline and wraps search controls and sort labels so they remain readable.
- The flight review opens in the current tab. On phones, the contact step validates the booking email before traveller entry. Payer identity is collected by supported billing flows when required.
- Hotel results use contracted property content and available supplier rates. Room-specific photography, third-party guest ratings and saved favorites remain outside this implementation. The property flow checks a selected TripJack rate before checkout.
- Package, activity and insurance requests use Max Travel’s enquiry flow. Support requests open an email draft. Online hold, package or activity checkout, instant insurance quotes, and support ticket tracking require additional integrations.

## Desktop and mobile screen audit

On 28 November 2026 the public desktop and narrow-screen reference walk revisited flight results through the blank booking form, hotel results and property rates, and the support, FAQ and destinations entry points. Max Travel’s customer-facing route and state coverage includes the homepage and navigation, destination and itinerary discovery, filters and fare or room selection, review, traveller entry, payment handoff and recovery, sign-in, saved travellers, trip lookup, booking records, cancellation and refunds, support, and the published travel guides. Browser checks use Max Travel’s synthetic supplier, payment and account fixtures.

The release route sweep loaded 46 customer-facing routes at both 1440px and 390px. All 92 checks passed. The sweep checked HTTP status, the main heading and horizontal overflow. Separate journey checks exercised the controls and booking states, including selected mobile cases at 320px. The release route and browser logs are in `.artifacts/destina-parity/` at the workspace root.

Destina’s private bookings, ticketing and payment completion were outside the public observation. Account and after-sales use Max Travel’s travel headers, surfaces and controls, with actions based on the actual booking state. The audit did not exercise production inventory, checkout, email delivery or external support ticket submission.

## Homepage image provenance

The homepage serves local files from `public/travel/`. The hero URL was verified in the rendered background style and the other sources in the rendered image elements. The public reference displayed no credit for the hero.

| Reference image | Local file | Source |
| --- | --- | --- |
| Mountain and lake hero | `public/travel/destina-hero.jpg` | [Reference hero](https://destinaholidays-static.nyc3.digitaloceanspaces.com/home/hero-nature.jpg) |
| Book & Hold | `public/travel/destina-perk-hold.jpg` | [Reference booking illustration](https://www.destinaholidays.com/assets/img/home/perk-hold.jpg?v=1793652163) |
| Flight + Hotel | `public/travel/destina-perk-package.jpg` | [Reference package illustration](https://www.destinaholidays.com/assets/img/home/perk-package.jpg?v=1793652163) |
| Flexible experiences | `public/travel/destina-perk-tours.jpg` | [Reference tours illustration](https://www.destinaholidays.com/assets/img/home/perk-tours.jpg?v=1793652163) |
| Real travel experts | `public/travel/destina-perk-experts.jpg` | [Reference experts illustration](https://www.destinaholidays.com/assets/img/home/perk-experts.jpg?v=1793652163) |
| Customer support | `public/travel/destina-travel-support.png` | [Reference support illustration](https://www.destinaholidays.com/assets/img/home/travel-support.png?v=1793652163) |

## Earlier REA observations

REA received a verification screen when opening the reference homepage and help page. Homepage evidence ID `ev_7c6a9668b0873ac4be323076193918630d21fbfba2dec8b9ae9813c94481ed1a`. The public Chrome captures above supplied the layout and interaction evidence. In an earlier Max Travel preview, REA observed the navigation and trip-planner landmarks and verified that selecting **City breaks** narrowed the destination grid to Dubai and Paris. Filter evidence ID `ev_a2aacf8e746f5e163eeb5436b3699544e1b79a9cdf73b017af11b3f2a3ddae2d`.

REA verified that a fresh local preview opened with Stays and that switching between Flights and Stays changed the search fields. The evidence bundle is `.artifacts/destina-layout/rea-evidence.json` at the workspace root. Evidence ID `ev_f40566546a65c6f5a0e37518b39d785520d2953f743a4dfdd5bbbf3cac757240`.

## Prior local verification

An earlier build passed TypeScript, ESLint for changed files and 939 unit tests. All 205 enabled public-route browser checks passed across the main run and two hotel rechecks. The booking and after-sales matrices covered 98 and 124 cases respectively across their runs. That build also passed 10 desktop and mobile WebKit checks. These results cover the earlier implementation with synthetic provider and payment data.

## Current local verification

The production build and TypeScript passed. The public-route, search and shopping matrix passed 294 applicable Chromium cases, including four reruns after updating the fare drawer assertions to follow the visible pinned action. Two project-specific cases were skipped. The current browser tests verify outbound and return fare selection, editing a flight route, and browser Back and Forward after searching an adjacent date.

Separate desktop and mobile matrices passed 72 hotel and room tests, 48 checkout and booking-status tests, and 30 account, trip lookup and after-sales tests. Six focused private-screen checks covered the final visual refinements. The checkout smoke passed 10 WebKit cases, and the current unit suite passed 939 checks. Browser and unit tests used synthetic provider and payment data. The current revamp did not run a supplier payment capture, ticket or voucher issuance, or cancellation against TripJack UAT.

The sort strip follow-up passed 31 Chromium shopping regressions, with one viewport-specific skip. Focused checks on the final build passed in Chromium and WebKit at desktop, 374px and 320px widths. They cover card alignment, outside-click and Escape dismissal, keyboard selection, and accurate arrival sorting.

The full flight results follow-up compared the public Destina desktop and mobile results on 27 November 2026. It updated the search band, filter panels, result count, fare cards, and destination planning panel. The integrated flight matrix passed 52 Chromium and nine WebKit cases. The release build passed 11 Chromium and three WebKit rechecks, plus the focused header runs. The sort tests measure every label at 320, 360, 374, 390, and 430px. All test inventory was synthetic. Final page and sort captures are in `.artifacts/destina-parity/flight-results-verified/`.

Current captures are in `.artifacts/destina-parity/` at the workspace root. `sort-strip/` contains the final desktop and 374px sort controls and menu. `verified-browser/` contains desktop and mobile flight comparison views from the broader run. `checkout-screens/` contains the fare drawer, review, traveller entry and confirmation. `other-screens/` contains hotel results, property detail, account, My Trips and cancellation before consent.
