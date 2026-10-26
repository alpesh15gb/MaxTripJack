import { businessProfile } from "@/lib/business-profile";

export type PublicLink = { label: string; href: string };
export type ContentSection = {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  links?: readonly PublicLink[];
};
export type PublicPage = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  eyebrow: string;
  intro: string;
  sections: readonly ContentSection[];
  related: readonly PublicLink[];
  questions?: readonly { question: string; answer: string }[];
  showRoutes?: boolean;
  contact?: boolean;
  businessSchema?: boolean;
  cta?: PublicLink;
  reviewedAt: string;
};

const reviewedAt = "2026-10-20";
const support = { label: "Contact booking support", href: "/customer-support" };
const pricing = { label: "Understand the full price", href: "/pricing-transparency" };
const guide = { label: "Read the flight booking guide", href: "/flight-booking-guide" };

/** An editorial allowlist, not a city-pair generator or a supplier inventory feed. */
export const publicPages: readonly PublicPage[] = [
  {
    slug: "flights", title: "Flight Planning & Booking Assistance in India", eyebrow: "FLIGHTS, WITH A HUMAN POINT OF CONTACT",
    description: "Plan domestic and international flights with practical airport guides, transparent fare comparisons and MaxTravel's Secunderabad office support.",
    heading: "Plan your flight. Know who to call.",
    intro: "Start with the right airports, then compare the complete journey—not just a headline fare. MaxTravel combines online travel planning with a real office in Secunderabad and people you can contact.",
    sections: [
      { heading: "Choose the journey before the ticket", paragraphs: ["A useful search starts with exact airport codes, travel dates, passenger ages and the cabin you need. A city may have more than one airport. Confirm the airport before arranging a pickup or onward connection.", "Use the planning form for one-way, return or multi-city travel as supported by the search flow. The online platform is currently In Testing: its search results and checkout are not live travel bookings."], links: [{ label: "Domestic flight planning", href: "/domestic-flights" }, { label: "International flight planning", href: "/international-flights" }] },
      { heading: "Compare what you will actually use", bullets: ["Journey: airports, dates, stops, arrival day and connection arrangements.", "Ticket: cabin, baggage, change conditions, cancellation conditions and passenger details.", "Price: the reviewed total including taxes and mandatory charges, plus the optional extras you choose.", "Confirmation: a payment receipt is not the same as an issued ticket or a supplier-confirmed booking."] },
      { heading: "Planning guides, not advertised inventory", paragraphs: ["The five airport-pair guides below focus on different decisions: reaching Delhi from the correct terminal, avoiding Mumbai airport confusion, preparing an international journey, choosing the right Goa airport and planning a Bengaluru transfer.", "They do not advertise available seats, airline partnerships or current prices. Dates, carriers, durations, terminals, baggage and fare rules must be established from the selected itinerary, not inferred from a route guide."] },
    ], showRoutes: true, cta: { label: "Open the flight planning form", href: "/book?product=FLIGHT" },
    related: [guide, pricing, { label: "Visit our Secunderabad office", href: "/office" }], reviewedAt,
  },
  {
    slug: "domestic-flights", title: "Domestic Flight Planning in India", eyebrow: "WITHIN INDIA",
    description: "A practical domestic flight checklist: exact airports, onward transfers, passenger details, baggage, total price and ticket confirmation.",
    heading: "Domestic flights: compare the whole trip.",
    intro: "For a family visit, a work trip or a weekend away, the right ticket depends on more than the departure time. Match the airport and fare conditions to the journey you need to make.",
    sections: [
      { heading: "Make the airport choice explicit", paragraphs: ["Write down the departure and arrival airport codes before searching. The Mumbai and Goa guides explain why a city name alone can be insufficient; an airport change can alter your ground journey even when the destination city looks the same.", "Check the terminal on the selected ticket and again with the operating airline before travel. A route guide is not a reliable source for a specific flight's terminal or check-in cutoff."], links: [{ label: "Delhi to Mumbai: the airport-code check", href: "/flights/delhi-to-mumbai" }, { label: "Mumbai to Goa: GOI and GOX explained", href: "/flights/mumbai-to-goa" }] },
      { heading: "Build your passenger and baggage checklist", bullets: ["Enter each passenger's name as it appears on the identification required by the airline; check the airline's current identification rules.", "Use the traveller's age on the travel date. Review infant and child conditions rather than assuming every passenger uses an adult fare.", "Check both cabin and checked baggage on the selected fare. Do not transfer an allowance from another airline, route or fare family.", "For special assistance, sports equipment or other unusual requirements, contact the airline or MaxTravel before relying on the ticket to cover them."] },
      { heading: "Leave room for the arrival", paragraphs: ["A scheduled landing time is not the time you reach a railway station, meeting or hotel. Allow for leaving the aircraft, baggage collection and ground travel. For a connection, check whether it is protected on one ticket or requires a separate check-in.", "When a meeting may overrun, compare change rules as well as price. A low initial fare can be a poor fit if the permitted changes do not match your plans."] },
      { heading: "Finish with the details, not just the payment", paragraphs: ["Review the full amount, itinerary and fare conditions before proceeding. If the price or availability changes at review, reassess the new details instead of relying on a saved search card. Keep your confirmation and travel documents accessible; check My trips for the booking state."] },
    ],
    cta: { label: "Plan a domestic flight", href: "/book?product=FLIGHT" },
    related: [{ label: "Hyderabad to Delhi airport guide", href: "/flights/hyderabad-to-delhi" }, { label: "Delhi to Bengaluru transfer guide", href: "/flights/delhi-to-bengaluru" }, pricing, support], reviewedAt,
  },
  {
    slug: "international-flights", title: "International Flight Planning from India", eyebrow: "BEYOND INDIA",
    description: "Prepare international travel with passport and entry-rule checks, transit questions, airport codes, local arrival dates and fare-review guidance.",
    heading: "International flights: check the journey at every border.",
    intro: "Before comparing international fares, establish who is travelling, where they will transit and which documents the journey requires. A flight reservation does not establish permission to enter or transit a country.",
    sections: [
      { heading: "Start with official entry and transit information", paragraphs: ["Check the destination government's requirements for the traveller's nationality and passport, and check every transit point. Requirements may depend on residency, visa type, whether you leave the transit area and whether a connection is on separate tickets.", "Use current government and operating-airline guidance; do not treat a generic travel article as an eligibility decision. If anything is unclear, resolve it with the relevant authority before committing to the itinerary."], links: [{ label: "India Ministry of External Affairs: travel advisories", href: "https://www.mea.gov.in/travel-advisory.htm" }, { label: "UAE Government: entry permit and visa information", href: "https://u.ae/en/information-and-services/visa-and-emirates-id/Visa-information/do-you-need-an-entry-permit-or-a-visa-to-enter-the-uae" }] },
      { heading: "Read dates and airports, not just city names", bullets: ["Departure and arrival times are presented for the relevant locations; check time zones and any next-day arrival.", "Identify every airport by its code. A connection involving an airport change is not a same-airport transfer.", "For separate tickets, establish baggage collection, immigration, re-check-in and missed-connection implications before choosing a short connection.", "Check the operating airline as well as the flight being sold. Verify terminals and airport reporting instructions with that airline."] },
      { heading: "Make baggage and flexibility part of the comparison", paragraphs: ["International baggage may be stated by pieces or weight and can vary by fare, route and cabin. Read the selected ticket's allowance for all segments. Check any baggage-transfer arrangement rather than assuming bags will reach the final destination.", "For changes or cancellation, examine the actual fare conditions, applicable charges and the issuing channel. Do not assume a refundable ticket means an immediate refund or a penalty-free change."] },
      { heading: "Use a human checkpoint when the plan is complex", paragraphs: ["Contact MaxTravel with the intended route, dates, passenger count and the question you need resolved. For a first enquiry, do not send passport scans, payment-card details or passwords. Confirm the appropriate secure document process before sharing sensitive travel documents."], links: [{ label: "Hyderabad to Dubai: DXB planning guide", href: "/flights/hyderabad-to-dubai" }] },
    ],
    cta: { label: "Plan an international flight", href: "/book?product=FLIGHT" }, related: [guide, pricing, support], reviewedAt,
  },
  {
    slug: "cheap-flight-tickets", title: "Cheap Flight Tickets: Compare Total Cost, Not Just Fare", eyebrow: "VALUE, WITHOUT FALSE PROMISES",
    description: "Compare affordable flight options using the full trip cost, baggage, airport transfers and fare flexibility—without guaranteed-cheapest claims.",
    heading: "Looking for cheap flight tickets? Compare the complete cost.",
    intro: "Competitive pricing matters. So does getting the baggage, airports and flexibility you need. MaxTravel does not promise the cheapest fare; this checklist helps you compare like for like.",
    sections: [
      { heading: "Create one fair comparison", paragraphs: ["Keep the same airports, dates, traveller count and cabin when comparing options. If you change one of those assumptions, note it. A different airport or a longer connection may reduce a displayed fare while increasing the rest of the trip's cost."], bullets: ["Write down the reviewed fare including taxes and compulsory charges.", "Add the bags, seats or other optional services you actually need.", "Account separately for airport transfers, an extra overnight stay or other travel costs not included in the ticket.", "Check whether the change and cancellation conditions fit how certain your plans are."] },
      { heading: "Use flexibility deliberately", paragraphs: ["If your schedule allows, compare different dates using the search form. Compare departure times and connections against your real constraints, not a promise that a particular weekday is always cheaper. Availability and price must be checked for each search.", "A connection may be practical for one traveller and unsuitable for another. Check total journey time, airport changes and whether separate tickets leave you responsible for a missed onward flight."] },
      { heading: "Do not mistake an old result for an offer", paragraphs: ["A screenshot, search result or expired quote does not reserve a seat or lock the price. Review again before checkout and accept only the updated itinerary and amount you intend to buy.", "This site is currently In Testing and does not publish live bookable fares. We do not display fabricated starting prices or savings percentages to imply inventory that has not been verified."] },
      { heading: "Ask a focused question", paragraphs: ["If two options are hard to compare, tell MaxTravel which dates, airport codes, baggage needs and flexibility matter. Ask for the complete price and the applicable conditions rather than only asking for the lowest headline number."] },
    ], questions: [{ question: "Does MaxTravel guarantee the lowest fare?", answer: "No. Our focus is competitive pricing, clear fare details and a human point of contact. Prices and availability depend on the actual itinerary and supplier review." }, { question: "Are seats or checked bags always included?", answer: "No universal inclusion applies. Check the fare you select and any optional extras before comparing totals." }],
    cta: { label: "Compare a planned journey", href: "/book?product=FLIGHT" }, related: [pricing, { label: "Last-minute planning checklist", href: "/last-minute-flights" }, guide], reviewedAt,
  },
  {
    slug: "last-minute-flights", title: "Last-Minute Flights: An Urgent Travel Checklist", eyebrow: "WHEN TIME IS SHORT",
    description: "A practical last-minute flight checklist covering identity, airport cutoffs, current availability, payment status and confirmed ticket checks.",
    heading: "Last-minute flights: verify before you rush.",
    intro: "Urgency makes small mistakes expensive. Before choosing a last-minute itinerary, confirm that you can reach the correct airport, meet the airline's deadlines and travel with the required documents.",
    sections: [
      { heading: "Check whether the journey is feasible", bullets: ["Use the airport code, not just the city, and establish the departure terminal.", "Check the airline's current check-in, bag-drop and boarding requirements for the exact journey.", "Allow for the journey to the airport, security and any assistance you require. Do not work backwards from departure time alone.", "For international travel, resolve entry and transit eligibility before paying; a short-notice flight does not remove documentation requirements."] },
      { heading: "Keep one clear decision in progress", paragraphs: ["An old search can become unavailable while you are reviewing it. Check the latest itinerary and total before accepting. Avoid treating two different searches or payment attempts as the same booking.", "If a payment or booking status is unclear, inspect My trips and contact support before retrying. A duplicate attempt can create a second payment or a second reservation; uncertainty should be investigated, not hidden by starting again."] },
      { heading: "Know what confirmation you have", paragraphs: ["A debit notification or payment receipt is not proof of an issued flight ticket. Review the booking state and the available travel documents. If the supplier has not confirmed the booking, do not assume you are ready to travel.", "This online platform is currently In Testing and cannot issue a live travel booking for an urgent journey. Contact the office about your travel needs rather than relying on test results."] },
      { heading: "Use the right support channel", paragraphs: [`MaxTravel's office hours are ${businessProfile.hours.display.toLowerCase()}. Give the team your travel deadline, airport pair and the issue you need help with. For an existing booking, use a private channel and do not post booking references publicly.`, "We do not promise 24-hour support or guaranteed last-minute availability. For an immediate airport or operating-flight issue, also consult the operating airline's official contact instructions."] },
    ], cta: { label: "Contact MaxTravel", href: "/contact" }, related: [support, guide, { label: "Our office and opening hours", href: "/office" }], reviewedAt,
  },
  {
    slug: "flight-booking-guide", title: "Flight Booking Guide: Search, Review & Confirmation", eyebrow: "A CLEARER BOOKING PROCESS",
    description: "Understand flight search, fare review, passenger details, payment, supplier confirmation and post-booking support with MaxTravel.",
    heading: "From a flight search to a confirmed ticket.",
    intro: "These are different stages, not interchangeable promises. A search finds options, a review checks the selected terms, and the supplier's confirmation establishes the booking outcome.",
    sections: [
      { heading: "1. Define the search", paragraphs: ["Choose the exact airports, one-way/return/multi-city journey as supported, dates, cabin and travellers. Use ages at the time of travel. Start with the correct inputs so the comparison is meaningful.", "Planning links from our guides fill airport codes only. They do not select a flight, lock a fare, preserve a bookable itinerary or automatically submit a search."] },
      { heading: "2. Compare and review", paragraphs: ["Read the full route, stops, local dates, operating details and baggage conditions. Compare the complete amount with the same traveller and service assumptions.", "The review step may find changed prices or availability. Re-read the current terms before continuing. A result you saw earlier is not a guarantee that the same option remains available."] },
      { heading: "3. Check traveller details and optional services", paragraphs: ["Match names and other required details to the relevant travel documents. Review date of birth, contact information and passport details when required. A spelling correction after ticketing may be subject to airline restrictions.", "Choose only the optional extras you want, and check their price and status. Do not assume a seat, meal or additional bag is included simply because it appeared in an earlier screen."] },
      { heading: "4. Separate payment from supplier confirmation", paragraphs: ["Payment capture and supplier confirmation are separate events. Follow the booking status in My trips and wait for the appropriate confirmation and travel documents. A failed, pending or review-required state is not a confirmed trip.", "If the outcome is uncertain, check the existing booking and speak to support before paying again. Keep receipts and relevant status messages for a private support conversation."] },
      { heading: "5. Recheck before travelling", paragraphs: ["Consult the operating airline for current flight status, terminal and check-in instructions. Keep the issued documents available. If you need a change or cancellation, establish the applicable fare conditions and any quoted charges before authorising the request.", "A requested change, cancellation or refund is not automatically completed. Check the resulting status and obtain confirmation of what was actually processed."] },
    ], questions: [{ question: "Can I book a real flight through this test website?", answer: "No. The current online booking platform is labelled In Testing. Test results, payments and confirmations must not be used as live travel bookings." }, { question: "Where should I start if I already paid but cannot see a confirmed booking?", answer: "Check My trips and the existing transaction status, then contact MaxTravel privately. Do not assume payment alone confirms travel, and avoid starting a duplicate payment while the first outcome is unresolved." }],
    cta: { label: "Open the test planning form", href: "/book?product=FLIGHT" }, related: [pricing, support, { label: "Browse airport-pair guides", href: "/flights" }], reviewedAt,
  },
  {
    slug: "about", title: "About MaxTravel in Secunderabad", eyebrow: "REAL PEOPLE. A REAL OFFICE.",
    description: "Meet MaxTravel, a Secunderabad travel agency with flight and hotel planning, transparent booking guidance and an office you can contact.",
    heading: "Online travel planning, with a real office behind it.",
    intro: "MaxTravel is a travel agency in Secunderabad. Our approach brings competitive travel pricing, clear booking information and personal assistance together—so you know both what you are reviewing and who to contact.",
    sections: [
      { heading: "A practical alternative to an anonymous checkout", paragraphs: ["Travel decisions often need a conversation: which airport suits the trip, what the baggage rules mean, or what to do when a booking status is unclear. Our office gives travellers a direct point of contact alongside the online planning flow.", "We aim to help you compare suitable options, not persuade you with guaranteed-cheapest claims. The full price, inclusions and supplier conditions matter more than an unsupported promotional promise."] },
      { heading: "What the website does today", paragraphs: ["The online platform provides flight and hotel search and booking workflows with the status In Testing. It is not currently a live travel-booking service. Public guides explain planning choices without presenting test prices as genuine offers.", "For travel assistance, contact MaxTravel directly. Availability, charges and the scope of any requested service should be confirmed with the team before you rely on it."] },
      { heading: "What you should be able to verify", bullets: ["Our office address and contact channels are published together on the Contact and Office pages.", "Our opening hours are every day, 9:00 am–9:00 pm in India time; we do not claim round-the-clock support.", "Our route guides show their editorial review date and official reference links.", "We do not display invented reviews, ratings, accreditation badges or claims of airline partnership."] },
    ], contact: true, businessSchema: true, related: [{ label: "Explore our services", href: "/services" }, { label: "Visit our office", href: "/office" }, pricing], reviewedAt,
  },
  {
    slug: "contact", title: "Contact Our Secunderabad Office", eyebrow: "LET'S MAKE THE DETAILS CLEAR",
    description: "Contact MaxTravel on +91 7095-018-018, WhatsApp or max@maxtravel.us. Secunderabad office open every day, 9 am–9 pm India time.",
    heading: "Talk to MaxTravel.",
    intro: "For a new travel enquiry or a question about an existing booking, use the contact details below. Our team is available during the published office hours; we do not promise an immediate response or 24-hour support.",
    sections: [
      { heading: "For a new travel enquiry", paragraphs: ["Share your departure and arrival cities or airport codes, intended dates, traveller count and the kind of assistance you need. Mention any flexibility or essential baggage requirements so the comparison can focus on the right options.", "An enquiry is not a booking confirmation. Confirm the actual itinerary, amount, terms and next step with the team before authorising a purchase."] },
      { heading: "For an existing booking", paragraphs: ["Start with My trips to check the current status. Contact us privately with the issue and the booking reference only if needed to locate your booking. Describe whether the concern is confirmation, a change, cancellation or a payment outcome.", "Do not send passwords, one-time codes, full card numbers or CVV details. Do not post passport images or booking references on public social media. Ask for an appropriate secure document process if sensitive information is required."], links: [{ label: "Check My trips", href: "/my-trips" }, support] },
      { heading: "Planning a visit", paragraphs: ["The office is at G-10, Golden Hawk, beside SBI in Ramgopalpet, Secunderabad. Use the full address in the office card, and contact us if you need help locating the entrance.", "The directions link opens the public Maps listing whose address and phone match this office. Call before your visit if you need specific assistance."], links: [{ label: "Office address and visit information", href: "/office" }] },
    ], contact: true, businessSchema: true, related: [support, { label: "How pricing is reviewed", href: "/pricing-transparency" }, { label: "About MaxTravel", href: "/about" }], reviewedAt,
  },
  {
    slug: "office", title: "Secunderabad Office: Address & Opening Hours", eyebrow: "A PLACE YOU CAN FIND US",
    description: "Visit MaxTravel at G-10, Golden Hawk, Ramgopalpet, Secunderabad 500003. Open every day, 9 am–9 pm India time. Contact us for visit assistance.",
    heading: "Our Secunderabad office.",
    intro: "Speak with a real travel agency, not only a search screen. MaxTravel's office is in Ramgopalpet, Secunderabad, with daily opening hours and direct phone, WhatsApp and email contact.",
    sections: [
      { heading: "Finding the office", paragraphs: [businessProfile.address.display, "Look for G-10 in Golden Hawk, beside SBI. The map link below opens the matching public Max Travel listing. If you need help locating the entrance, call before travelling to the office."] },
      { heading: "Opening hours and your visit", paragraphs: ["Our office hours are every day, 9:00 am–9:00 pm India time. Call before your visit if you need specific assistance or want to confirm what information to bring."] },
      { heading: "Prepare for a useful conversation", bullets: ["For a new trip, bring the intended route, dates, traveller count and your priorities for price, timing or flexibility.", "For a booking issue, have the relevant confirmation and a clear description of what you want checked.", "Ask which documents are needed before sharing sensitive information; do not send passwords or payment authentication codes.", "For changes or cancellation, ask for the applicable supplier conditions and charges before authorising action."] },
      { heading: "Assistance, with clear limits", paragraphs: ["Contact the office about flight or hotel planning and booking questions. Other travel requests can be discussed with the team, but a request is not a promise that the service is offered or immediately bookable.", "An office visit does not override airline entry requirements, fare restrictions or supplier confirmation. Our online platform remains In Testing; test results are not valid travel arrangements."] },
    ], contact: true, businessSchema: true, related: [{ label: "Contact the team", href: "/contact" }, { label: "Available services and enquiries", href: "/services" }, support], reviewedAt,
  },
  {
    slug: "services", title: "Flight & Hotel Planning Assistance", eyebrow: "START WITH WHAT YOU NEED",
    description: "Explore MaxTravel's flight and hotel planning workflows, human booking assistance and support enquiries from its Secunderabad office.",
    heading: "Flight and hotel planning, with someone to ask.",
    intro: "Use the online planning tools to understand the process, or contact our Secunderabad team about your travel needs. The online booking workflows are currently In Testing and do not create live travel bookings.",
    sections: [
      { heading: "Flight planning", paragraphs: ["Begin with exact airports, dates, cabin and traveller details. The flight flow supports the journey options shown in the form. Our public guides help you identify important airport, transfer and fare-rule questions before choosing an itinerary.", "The guide pages do not supply live inventory, guarantee availability or imply an airline partnership. Actual services and prices require an authorised, current itinerary review."], links: [{ label: "Browse flight planning guides", href: "/flights" }, guide] },
      { heading: "Hotel planning", paragraphs: ["The hotel flow uses a selected destination, stay dates, room occupancy and traveller nationality. Check the actual property's room, meal, cancellation and payment conditions when reviewing an option; a destination photo does not represent a specific room or hotel.", "The present hotel search and checkout are also test workflows. Contact MaxTravel for assistance rather than relying on a test result as a confirmed stay."], links: [{ label: "Open the hotel test planning form", href: "/book?product=HOTEL" }] },
      { heading: "Questions after a booking", paragraphs: ["For confirmation, change, cancellation or refund questions, begin with the booking status and then contact us privately. The outcome depends on the actual booking, supplier rules and the request—not on a general promise of free changes or automatic refunds.", "Ask for the relevant terms and any quoted charges before authorising a modification. Keep the confirmation of a completed action separate from the initial request."], links: [support] },
      { heading: "Other travel needs", paragraphs: ["For a trip involving requirements not shown in the online flow, ask the team what assistance may be available. This page does not advertise immediately bookable cruises, tours, visas or other services that have not been confirmed."] },
    ], cta: { label: "Discuss your travel needs", href: "/contact" }, related: [pricing, { label: "Visit the Secunderabad office", href: "/office" }], reviewedAt,
  },
  {
    slug: "customer-support", title: "Booking, Changes & Refund Support", eyebrow: "WHEN YOU NEED A HUMAN CHECKPOINT",
    description: "Find MaxTravel support contacts and practical steps for unclear booking status, change requests, cancellations and refund enquiries.",
    heading: "Get help with the next step—not another guess.",
    intro: "Start with the current booking state, then explain the outcome you need. MaxTravel can be contacted by phone, WhatsApp or email during daily office hours, 9:00 am–9:00 pm India time.",
    sections: [
      { heading: "Payment made, confirmation unclear", paragraphs: ["Check My trips for the existing booking and inspect the available status and documents. A payment notification alone does not mean the supplier has confirmed the trip.", "Contact us privately if the result is pending, failed or unclear. Keep the payment receipt for the support conversation and avoid paying again until the earlier attempt has been investigated."], links: [{ label: "Open My trips", href: "/my-trips" }] },
      { heading: "Changing or cancelling a trip", paragraphs: ["Tell us which booking and what you would like changed. Ask for the applicable supplier conditions, availability and total charges before authorising the request. An enquiry does not itself change or cancel the ticket.", "The initial fare and any selected extras can have different conditions. A request, a quoted change and a completed change are distinct stages; keep the final confirmation of what was processed."] },
      { heading: "Asking about a refund", paragraphs: ["Identify the booking and the cancellation or failed-booking event you want checked. The refundable amount and process depend on the relevant supplier rules and payment outcome.", "A refund request is not proof that money has returned to your payment method. Ask for the current status and any available completion reference. We do not publish a blanket refund deadline or promise that every fare is refundable."] },
      { heading: "Raising an unresolved issue", paragraphs: ["Email max@maxtravel.us with a short timeline, what has already been checked and the resolution you are requesting. Share booking identifiers only in the private conversation and avoid unnecessary personal documents.", "For an imminent flight, also follow the operating airline's official airport and flight-status guidance. MaxTravel does not advertise 24-hour emergency support or override airline operational decisions."] },
    ], contact: true, related: [{ label: "Contact details", href: "/contact" }, guide, pricing], reviewedAt,
  },
  {
    slug: "pricing-transparency", title: "Pricing Transparency: Fares, Fees & Confirmation", eyebrow: "KNOW WHAT THE NUMBER MEANS",
    description: "Understand fare totals, mandatory charges, optional extras, price changes, quote validity and why payment is not supplier confirmation.",
    heading: "A clearer price. A clearer decision.",
    intro: "Compare the amount you would actually pay for the itinerary and services you need. A headline fare, a reviewed total and a confirmed booking describe different stages.",
    sections: [
      { heading: "What belongs in your comparison", bullets: ["The selected itinerary or room, dates, travellers and cabin or occupancy assumptions.", "The fare or room price together with taxes and mandatory charges shown in the reviewed total.", "Any applicable service charge and the optional services you actively choose.", "What is included, what is excluded, the currency and the relevant change or cancellation conditions."] },
      { heading: "What is not automatically included", paragraphs: ["Seats, meals, checked bags or other extras may depend on the selected fare. A hotel result may have specific meal, occupancy or payment terms. Check the actual option instead of assuming that everything shown elsewhere on the site is included.", "Ground transfers, document costs and other expenses outside the selected booking should be considered separately when budgeting. If a charge or inclusion is unclear, resolve it before payment."] },
      { heading: "Why a price can change", paragraphs: ["Search results and reviews represent availability at a point in time; they do not create an unlimited price guarantee. The supplier may return a different price or no availability when the choice is reviewed.", "Check any quote-validity message and the latest reviewed total. If the itinerary, rules or amount changes, reassess before continuing. Do not rely on an old screenshot as an active offer."] },
      { heading: "Payment and booking are different outcomes", paragraphs: ["The payment process and supplier fulfilment happen separately. A captured payment does not establish that a flight is ticketed or a hotel is confirmed. Follow the booking status and keep the actual confirmation documents.", "For an uncertain outcome, check the existing booking and contact support before making another attempt. For changes, cancellation or refunds, ask for the terms and status of the specific request rather than assuming a general guarantee."] },
      { heading: "No fabricated fares", paragraphs: ["The platform is currently In Testing. Public pages do not advertise test prices, invented starting fares, guaranteed savings or a promise to be cheapest.", "Live fares will be available only when online booking is enabled. A planning guide does not reserve a seat or confirm a price."] },
    ], cta: { label: "Ask a pricing question", href: "/contact" }, related: [{ label: "Compare affordable flight options", href: "/cheap-flight-tickets" }, guide, support], reviewedAt,
  },
];

export function getPublicPage(slug: string): PublicPage | undefined {
  return publicPages.find(page => page.slug === slug);
}
