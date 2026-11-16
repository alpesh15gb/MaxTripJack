# Max AI travel enquiry research

Reviewed: 17 November 2026.

## Method and scope

The question categories below come from public help pages and planning flows of
travel operators, an airline, a hotel platform, an insurer and a visa authority.
They are an intent coverage checklist, not a ranking of MaxTravel customers'
questions: no customer-chat analytics were available. Competitor policies,
prices, response times and guarantees are not MaxTravel's policies.

Only information needed to plan or route an enquiry belongs in chat. The
customer reviews the structured summary and enters contact details in the app
before submitting. Visa applications, insurance issuance, cruise reservations,
payments and changes to existing bookings remain separate processes.

## Sources and product decisions

| Primary source | Observed topics | Decision for Max AI |
| --- | --- | --- |
| [GOV.UK visa checker](https://www.gov.uk/check-uk-visa) and [visitor overview](https://www.gov.uk/standard-visitor) | The route to entry permission depends on nationality and purpose; visiting and transit have distinct paths. | Ask destination, passport nationality, purpose and travel timing. Ask residency, stay length or transit details when relevant. Direct current eligibility questions to the authority/team; never decide approval from a generic answer. |
| [TATA AIG travel insurance](https://www.tataaig.com/travel-insurance) | Quote factors include destination, age, duration, policy type and optional cover. Its pages distinguish benefits, exclusions, policy management and claims. | Collect destination, travel period, traveller ages and trip type for a new enquiry. Distinguish a new quote from an existing-policy claim. Do not collect health records in chat or infer cover from the product name. |
| [Thomas Cook international packages](https://www.thomascook.in/holidays/international-tour-packages) | Destination inspiration, trip themes, dates, travellers, documents and differing inclusions are prominent. | Support destination-led or interest-led planning. Clarify departure city, timing, party, budget basis and desired inclusions. Search MaxTravel's own published catalogue; offer a custom enquiry when it does not match. |
| [Royal Caribbean FAQ](https://www.royalcaribbean.com/faq) | Pre/post-cruise questions, travel documents, boarding, embarkation, cabin upgrades, beverages, cancellation and accessibility are separate categories. | Ask region or departure port, travel month/dates, nights, party and budget. Cabin/accessibility/inclusion preferences refine the enquiry. Treat sailings, cabins, port documents and extras as supplier-confirmed information. |
| [Air India FAQ](https://www.airindia.com/in/en/frequently-asked-questions.html) | Booking, check-in, baggage, disruption, payments/refunds, children, pets and medical assistance all have dedicated routes. | Preserve existing flight search and own-trip tools. Send service-specific or urgent operational questions to the operating provider/team rather than creating an unrelated sales enquiry. |
| [Booking.com FAQ](https://secure.booking.com/faq.en-gb.html) | Cancellation, payment, room types, pricing, property policies and extra facilities are distinct. Special check-in and extra-bed requests are property-dependent. | Ask per-room occupancy and child ages before a hotel search. Keep selected-rate inclusions and cancellation evidence separate from property descriptions. Never guarantee a special request merely because it is requested. |

MakeMyTrip's public support endpoint returned HTTP 503 during this review, so it
was not used as evidence. No competitor quotation or fee was copied into the
assistant's answers.

## Conversation routing

| Customer intent and examples | Essential next step | Boundary |
| --- | --- | --- |
| Inspiration: "Where can we go for a family holiday?" | Ask departure city, interests, approximate month/duration, party and budget. Offer a few planning directions or published packages. | Suggestions are planning ideas; no invented prices, weather forecasts or visa eligibility. |
| Flight: "Cheapest non-stop Mumbai to Delhi next Friday" | Resolve airports/date; ask missing passenger/cabin details; search actual inventory. | Cheapest only among loaded eligible results; preserve filters and price basis. |
| Hotel: "Two rooms with breakfast for our family" | Destination, check-in/out, guests in each room, child ages, nationality. | Room-level breakfast, cancellation, beds and fees require the selected rate. |
| Visa: "I want a Dubai visa" | Destination, passport nationality, purpose and dates/month. Add residency or intended stay length when needed. | Preparation enquiry is not an application, appointment or approval. |
| Insurance: "Insurance for a two-week Europe trip" | Destinations, travel dates, ages and leisure/business/student/frequent-travel needs. | No guaranteed eligibility, benefits or premium without the actual insurer quote/policy. |
| Package: "Bali honeymoon under 80,000" | Departure city, dates/duration, travellers; clarify total versus per-person budget and whether flights are wanted. | Catalogue prices are indicative. A custom itinerary is a request until the team confirms it. |
| Cruise: "Singapore cruise with two children" | Region/port, dates/month, nights, adults/child ages, budget. Ask cabin preference only if known. | No invented sailing, available cabin or included gratuities/excursions. |
| Mixed services: "Dubai holiday, visa and insurance" | Identify the primary plan; preserve shared details and ask which service summary to prepare first. | Do not silently create several enquiries or assign the wrong service type. |
| Baggage, seats, meals, fare changes | Use the selected fare/review or the customer's own booking and available app actions. | Search-card prose is not evidence of a fare-specific entitlement. |
| Booking, cancellation, refund or voucher status | Use the signed-in own-trip lookup, then the relevant booking screen. | A payment, request or button is not supplier confirmation or a completed refund. |
| Existing visa application or insurance claim | Clarify that this concerns an existing case; route to the team/insurer with its private process. | No application/claim-status API exists; do not invent progress or open an unrelated new sales enquiry by default. |
| Accessibility, infants, pets, dietary needs | Ask only practical assistance/preferences; direct confirmation to the airline, property, cruise line or team. | Do not ask for diagnosis or medical records in chat; do not promise acceptance. |
| Group/corporate trips or services beyond online limits | Acknowledge the request and offer the team's current contact details. | Do not squeeze large groups into inaccurate passenger/room limits or invent unsupported service tools. |
| Passport, forex, transfers or other office assistance | Use an authored guide/current company contact and clearly explain the supported next step. | Do not misclassify these as visa, insurance, package or cruise enquiries just to save a lead. |
| Imminent disruption or a traveller stranded abroad | Prioritise the operating provider's official instructions and the team's published contact/hours. | No promise of 24-hour response, emergency dispatch, rebooking or compensation. |
| General destination, weather, safety or entry questions | Provide stable general planning guidance and explain when a current authoritative check is needed. | The chat has no general live web-search tool; do not pretend to have checked today's weather, advisories or entry rules. |

## Asking without making the conversation a form

- Ask two or three related missing details at a time; reuse details already
  provided, and let the customer correct them.
- Accept flexible timing, an undecided destination or an unknown budget as
  explicitly stated preferences. Never invent an exact date to satisfy a field.
- Resolve relative dates against the current India date and repeat the resolved
  date/month; clarify ambiguous dates and budget currency or per-person basis.
- Answer a simple informational question first. Prepare an enquiry when the
  customer wants a quote, planning help or team follow-up, not for every FAQ.
- Use one service-specific summary at a time. Contact details and consent belong
  in the secure enquiry form; a chat reply such as "yes" must not itself submit.
- Say that an enquiry is saved only when the application confirms persistence.
  Distinguish saved locally, queued for CRM, delivered and delivery problems.
- On a timeout or retry, retain the same confirmed request identity to avoid
  duplicate enquiries. If the customer changes the summary, prepare a new draft.

## Acceptance scenarios

1. Each of "I want a visa", "insurance chahiye", "family holiday" and "cruise"
   receives a helpful service-specific follow-up or draft, not a refusal.
2. "Visa to Dubai, Indian passport, tourism, December" keeps nationality and
   purpose and clarifies the year/duration only when needed.
3. "Am I guaranteed a visa?" gives an accurate boundary without creating a lead.
4. "Insurance for my parents" asks ages/travel details without requesting medical
   records; "Will it cover my condition?" directs policy review to the insurer.
5. "Bali for two under 80,000 including flights" retains the budget basis and
   desired inclusion; no matching package still permits a custom enquiry.
6. "Cruise for two adults and a six-year-old next March" preserves the child age
   and resolves the year without fabricating a sailing.
7. A traveller may edit or abandon a draft with no saved lead or CRM event.
8. Confirmed submission returns a real reference; duplicate submission/retry
   returns the same saved enquiry rather than another lead.
9. A contact or validation error preserves the draft; CRM downtime does not
   falsely turn an already-saved enquiry into a failed submission.
10. Private contact data is entered outside model context and is not included in
    tool-result summaries or logs.
11. "Change my flight", "Where is my refund?" and "Claim on my insurance" are
    routed to the relevant existing-booking or team process, not new sales leads.
12. Desktop and mobile layouts support long destination names, all four service
    summaries, consent, error recovery, submitted receipts and keyboard access.

These are implementation and test targets, not claims that every live model
response or external CRM delivery has been verified. Record actual validation
and deployment limitations in the release notes.
