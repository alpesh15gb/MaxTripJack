# OTA benchmark: MakeMyTrip, EaseMyTrip, Yatra (18 Nov 2026)

Observed in a desktop browser by inspecting each site's network traffic
(the REA browser-capture method). Only the flight search, calendar and results
were exercised; no booking or payment was attempted.

## 1. How prices appear "instantly"

| Site | Observation |
| --- | --- |
| MakeMyTrip | `GET flights-cb.makemytrip.com/api/fareCalendar?it=DEL-GOI-20261119&cc=E` fires the moment both airports are chosen (before the calendar opens), returning ~45 days of lowest fares in **~300–450 ms**. It is a pre-computed route cache, not a live search. Results then use `api/search-stream-dt`, a **streaming** response: the first cards paint in under 1 s, while the full stream finishes at ~2.7 s. The results page re-uses `fareCalendar` for its date strip. |
| EaseMyTrip | Calendar shows a price under every day for the whole range, colour-coded **green (cheap) / red (expensive)**. |
| Yatra | "AI Search" (Diya AI) free-text bar sits directly above the search form. |

**Pattern:** route-level lowest-fare cache, refreshed in the background; the
calendar and date strip read only that cache; exact prices are confirmed at review.

## 2. Calendar prices

* Lowest fare per day, in ₹ without decimals, small type under the date.
* Colour bands relative to the visible window (cheap/expensive).
* A one-line disclaimer, e.g. "Showing our lowest prices in ₹".
* Two months side by side on desktop, a scrolling list on mobile.

## 3. Form order and travellers

All three: **From → To → Departure → Return → Travellers & Class → (special fares) → Search.**
Children, infants and cabin are *inside* one "Travellers & Class" field that opens
a panel below it (EaseMyTrip and MMT use steppers or number chips). None of them
place passenger options above the route.

## 4. Checkout

All three let a customer book with contact details (email + mobile) and offer
sign-in as optional. *Not re-verified end to end in this session.*

## 5. AI

* MMT "Myra" smart filters: natural-language filtering on the results page.
* Yatra "Diya AI" search bar on the home page.

## What changed in MaxTravel (this branch)

* Shared listing cache now **5 minutes** for flights *and* hotels
  (`FLIGHT_SEARCH_CACHE_TTL_MS`, `HOTEL_SEARCH_CACHE_TTL_MS`, 0 disables).
* `flight_fare_calendar` table + `/api/travel/fare-calendar`: lowest one-adult
  public fare per route/day, recorded from real searches; `POST` refreshes days
  older than five minutes around the chosen date (bounded, background). The home
  page triggers it on load, so the default route is warm before the user searches.
* Home: custom date picker with fares (two months, colour bands), and a single
  **Travellers & class** field after the dates (steppers + cabin chips).
* Results: fares under each day of the 15-day date strip.
* Max AI: clear first-turn flight requests ("Mumbai to Delhi tomorrow") skip both
  model calls and run the flight tool directly.

## Not done yet / recommended next

1. **Guest checkout** (needs an auth/ownership design; see the proposal).
2. **Streaming search results** (MMT-style) to paint the first fares sooner.
3. Popular-route schedule: refresh the top routes' calendars every 5 min from a
   worker instead of only on page load.
4. Natural-language filter box on results (MMT "smart filters").
