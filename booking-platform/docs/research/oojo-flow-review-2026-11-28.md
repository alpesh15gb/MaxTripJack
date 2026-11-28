# oojo.com (Dreampass) flow review: 28 November 2026

Walked in a desktop browser: home search → results → flight details → first
checkout step (DEL ⇄ DXB round trip, 1 adult, economy). Stopped before the
step that accepts their terms and asks for personal details. Ideas only; no
design, text or images are reused.

## What they do well, and what MaxTravel should adopt

| # | Oojo behaviour | MaxTravel today | Recommendation |
| --- | --- | --- | --- |
| 1 | **Search auto-advances:** picking From focuses To; picking To opens the departure calendar; picking departure moves to return. The form is filled without hunting for the next field. | Each field must be clicked. | Auto-advance From → To → Departure → Return (keyboard and mouse), never skipping a field the user has not chosen. |
| 2 | **Results summary line:** "479 of 546 flights shown. The lowest price is $390.91". | "Showing 1–N of N flights". | Add the lowest visible price, e.g. "24 of 31 flights · lowest ₹5,480". |
| 3 | **"Best" sort** (price balanced with duration) is the default, beside Cheapest, Fastest and a flexible option, each tab showing price and duration. | Cheapest / Shortest / Earliest + More sorts. | Add a "Best" tab (price weighted against total duration and stops) and make it the default; keep Cheapest one tap away. |
| 4 | **Baggage filter:** a stepper for the number of checked bags needed. | Baggage shown on cards only. | Add "Checked bag included" (and count) to filters; TripJack fares already carry baggage. |
| 5 | **Time and duration ranges per leg:** departure/arrival windows for outbound and return, max trip duration, max connection time, price range. | Departure-time tiles and price range. | Add arrival-time and max-connection-time filters, per leg for round trips. |
| 6 | **Layover callouts:** "15h 20m stopover in Goa" on the card. | Stops count and airport. | Flag long layovers (over 6h), overnight connections and airport changes on the card. |
| 7 | **Cheaper-date nudge on a result:** "Save $22 by selecting this alternative date". | Fare calendar strip only. | Use verified calendar fares to show "₹X cheaper on {day}" above results when a nearby day is meaningfully cheaper, linking to that day. |
| 8 | **Labelled checkout steps:** Flight details → Ticket, baggage & seats → Customize → Review & pay. | Review trip → Travellers & payment → Confirmation. | Keep ours (fewer steps), but name the extras step clearly when extras exist. |
| 9 | **Reservation timer banner:** "19:57 minutes left to reserve". | "Price reviewed · 14:58 remaining" in the form. | Promote our existing review timer to a slim banner under the progress bar. |

## Patterns to avoid

- **"Private discounted fare — call now" pop-up** after Select. It interrupts the flow and pushes a phone sale; it also shares contact data with partners.
- **Forced membership choice** before continuing (two buttons, both of which accept terms).
- **Crossed-out "was" prices and "Exclusive offer" badges** on most results. Only show a reduced price when a real promo applies.
- **Repeated buy-now-pay-later lines** on every card.

## Already on par or better in MaxTravel

- Fare calendar with prices (Oojo's calendar shows none).
- Shareable search URLs (both).
- Itinerary detail panel and per-passenger price summary with refund rules (both).
- Guest checkout without a forced account or membership.
