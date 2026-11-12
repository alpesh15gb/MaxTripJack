# Flight and hotel results research

Reviewed 12 November 2026 for the MaxTravel results redesign.

## Method and sources

Inspected live desktop result layouts on Google Flights (Hyderabad–New Delhi sample return journey) and MakeMyTrip (Goa hotels). Read the official public listings and product documentation below. Samples were used to inspect presentation, not to validate prices or book travel. Mobile recommendations are design inferences from those patterns and official workflows; MaxTravel's implementation is verified separately at 390px.

| Source | Observed pattern | Application |
| --- | --- | --- |
| [Google Flights ranking](https://support.google.com/travel/answer/7664728) and live results | Compact timing/airline rows; clear journey price basis; Best and Cheapest have different ranking meanings. | Keep itinerary facts prominent, disclose price scope, and use explicit sort modes backed by existing data. |
| [Google baggage filters](https://support.google.com/travel/answer/9074247?hl=en-CA) | Bag allowances and fees come from partners and can change the effective price. | Keep baggage beside each fare and preserve unknown allowances. |
| [Skyscanner ranking](https://www.skyscanner.net/media/how-skyscanner-works) | Best considers several journey factors; Cheapest and Fastest offer different orderings. | Promote price and duration choices without inventing a recommendation score. |
| [Skyscanner price inclusions](https://help.skyscanner.net/hc/en-us/articles/201208841-What-do-you-include-in-the-prices-shown-on-Skyscanner) | Optional services may alter the final payable amount. | Label estimates and retain the final price review step. |
| [MakeMyTrip flight listing](https://www.makemytrip.com/flights/pune-nagpur-cheap-airtickets.html) | Itinerary summary leads to fare families with baggage and flexibility comparisons. | Use a compact collapsed card and an aligned expanded fare comparison. |
| [Expedia sorting](https://www.expedia.com/lp/b/sort-order-info) | Flight ranking accounts for price, duration, legs, layovers and airports. | Preserve connection and airport facts, including known arrival-day changes. |
| [MakeMyTrip Goa hotels](https://www.makemytrip.com/hotels/goa-hotels.html) | Desktop filter rail, substantial photos, locality, categories, ratings and price area; photo-count affordance. | Separate property identity from the stay price/action, show real photos and available category data. |
| [Booking.com Goa listings](https://www.booking.com/city/in/goa.html) | Guest scores and property categories are distinct; price has an explicit occupancy/night scope. | Label stars as property category and put selected stay scope beside the estimate. |
| [Expedia hotel listings](https://www.expedia.com/List-Hotels-Cheap-Hotels.0-0-d553248635975849605-tCheapHotels.Travel-Guide-Filter-Hotels) | Nightly and total amounts have tax/fee and date context. | Lead with the full selected-stay estimate and preserve unknown extra charges. |
| [MakeMyTrip room options](https://www.makemytrip.com/hotels/effotel_by_sayaji_panaji_goa-details-goa.html) | Room types group offer-specific meals, occupancy and cancellation terms. | Present rate facts consistently before selecting a room. |
| [Agoda price/policy reference](https://developer.pps.agoda.com/docs/api-reference) | Per-book, per-night and per-room-per-night amounts are different; cancellation belongs to the offer. | Keep the price unit explicit and cancellation tied to the selected rate. Agoda's consumer layout was not visually verified. |

## Design decisions

- Keep the exploration-led homepage, then transition to a focused comparison workspace after search.
- Reduce repeated headings and decorative space above results, especially on phones.
- Keep desktop filters beside results; expose an accessible filter disclosure on smaller screens.
- Make sorting visible, preserve active filters, and keep the selected result and scroll position when returning from review.
- Give return-flight results the full comparison width. Show the selected journey once, with its change and review controls, instead of repeating it in a second sidebar.
- Use supplier photos only for hotel cards. Do not substitute destination photography for a property's actual appearance.
- Distinguish property star category from guest reviews. Current data has no verified review score/count or coordinates, so review badges and a results map are not added.
- Keep unknown price, baggage, duration, category and policy states truthful. Never infer free cancellation from missing policy data.
- Maintain fare IDs, room option IDs, authentication, review and checkout contracts.

## Verification targets

- Desktop 1440 × 1000 and mobile 390 × 844.
- First result begins within the initial viewport; no horizontal page overflow.
- Price and duration sorting, filters, empty states, fare comparisons, room selection and returning to results retain their behavior.
- Arrival-day changes, ambiguous time zones, multi-leg travel and missing supplier fields remain explicit.
- Browser checks use synthetic provider responses; no live bookings or payment transactions are part of design verification.

## Completed verification

- Production build and TypeScript compilation passed.
- All 500 web unit tests passed.
- All 206 selected desktop/mobile journey checks passed. After the final return-flight layout and focus adjustments, all 20 focused flight checks passed again.
- All 7,126 SEO HTTP/HTML assertions passed across 33 public pages, seven private routes, indexing gates, canonical configuration, schemas and CSP.
- Changed web scripts passed ESLint. Desktop and mobile screenshots were inspected, including missing prices, fare comparisons, stay scope and the trips workspace.

These checks validate the local implementation with synthetic inventory. They do not establish live supplier availability, real payment outcomes, search rankings or production Core Web Vitals.
