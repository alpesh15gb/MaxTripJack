import type { PublicPage, PublicLink } from "@/lib/public-pages";

/**
 * Planning guides for the travel questions people search alongside flights. They explain how an official process
 * works and link to the authority that decides it. They state no fees, timelines or eligibility outcomes, and they
 * do not claim MaxTravel offers, files or guarantees any of these services; scope is confirmed with the office.
 */
const reviewedAt = "2026-11-04";
const contact: PublicLink = { label: "Ask the MaxTravel office", href: "/contact" };
const international: PublicLink = { label: "International flight planning", href: "/international-flights" };
const insurance: PublicLink = { label: "Travel insurance: what to check", href: "/travel-insurance-guide" };
const passport: PublicLink = { label: "Passport renewal and new passport steps", href: "/passport-renewal-guide" };
const visa: PublicLink = { label: "Visa planning for Indian travellers", href: "/visa-guide" };
const mea: PublicLink = { label: "India Ministry of External Affairs: travel advisories", href: "https://www.mea.gov.in/travel-advisory.htm" };
const vfs: PublicLink = { label: "VFS Global: visa application centres", href: "https://www.vfsglobal.com/" };
const scope = "MaxTravel's office can tell you what help it can offer for this; this page does not promise the service, a fee or an outcome.";

export const travelHelpPages: readonly PublicPage[] = [
  {
    slug: "passport-renewal-guide", title: "Passport Renewal & New Passport in Hyderabad: Steps", eyebrow: "BEFORE YOU BOOK",
    description: "How a fresh or re-issue passport application works on the official Passport Seva portal, and what to settle before booking international flights.",
    heading: "Passport renewal or a new passport: the steps, in order.",
    intro: "Passport applications run on the government's Passport Seva portal. This page explains the sequence so you can plan flights around it. The portal, not this page, decides requirements and dates.",
    sections: [
      { heading: "Fresh passport or re-issue?", paragraphs: ["A fresh application is for someone who has no passport. A re-issue is for an existing passport, for example when the validity is nearing expiry, pages are exhausted or personal details have changed. The official portal lists the services available and the reasons for each.", "A passport that expired more than three years ago triggers fresh police verification according to the portal, so a long-expired passport can take longer to replace than a recent one."], links: [{ label: "Passport Seva: fresh or re-issue process", href: "https://www.passportindia.gov.in/psp/Apply" }, { label: "Passport Seva: apply for re-issue", href: "https://www.passportindia.gov.in/psp/ApplyReissue" }] },
      { heading: "The online sequence", bullets: ["Register on the portal and log in with your login ID.", "Choose the service and the Regional Passport Office for your current residence; it shows the nearest Passport Seva Kendra when you schedule.", "Fill and submit the application form. For a re-issue the portal can fill details from your existing passport after OTP verification.", "Pay online and book an appointment. The portal makes online payment mandatory for booking an appointment.", "Visit the assigned Passport Seva Kendra with your original documents. Walk-ins are generally not accepted, with limited exceptions."] },
      { heading: "Plan flights around it", paragraphs: ["Do not buy a non-refundable international ticket on the assumption that a passport will arrive in time. Passport timing is set by the authority, and neither an appointment nor an application is a travel document.", "Check the validity your destination requires, and the number of blank pages, before you choose dates. Entry rules differ by country and are set by each government."], links: [mea, international] },
      { heading: "Keep your documents safe", paragraphs: ["Use only the official portal and its listed payment options. Do not share passwords, one-time codes or card details with anyone who offers to speed up an application. If you want help from an agent, ask what exactly they will do and which fees go to the government.", scope] },
    ],
    questions: [{ question: "Where do I apply for a passport in Hyderabad or Secunderabad?", answer: "Apply through the Passport Seva portal and select the Regional Passport Office for your current residence. The portal then shows the Passport Seva Kendra for your appointment." }, { question: "Does MaxTravel issue passports?", answer: "No. Passports are issued by the Government of India through Passport Seva. This page is a planning guide, and the office can tell you what assistance it offers." }],
    cta: contact, related: [visa, insurance, international], reviewedAt,
  },
  {
    slug: "visa-guide", title: "Visa Guide for Indian Travellers: Plan Before You Fly", eyebrow: "ENTRY RULES FIRST",
    description: "How to check visa and entry requirements for your destination and transit points as an Indian passport holder, with official government sources.",
    heading: "Visa planning: confirm entry rules before you pay for flights.",
    intro: "Whether you need a visa depends on your passport, destination, purpose, length of stay and any transit. The destination government decides, so start with its official guidance.",
    sections: [
      { heading: "Start at the destination's official source", paragraphs: ["Use the immigration or foreign ministry site of each country you will enter or transit. Search results, forums and agent blogs can be out of date.", "Requirements can differ for tourism, business, study and transit, and the same country can offer an e-visa, a visa on arrival, a sticker visa or visa-free entry depending on your passport."], links: [{ label: "UAE Government: entry permit and visa information", href: "https://u.ae/en/information-and-services/visa-and-emirates-id/Visa-information/do-you-need-an-entry-permit-or-a-visa-to-enter-the-uae" }, { label: "UK Government: Standard Visitor visa", href: "https://www.gov.uk/standard-visitor-visa" }, { label: "US Department of State: visas", href: "https://travel.state.gov/content/travel/en/us-visas.html" }, mea] },
      { heading: "Applications often go through a visa centre", paragraphs: ["Many countries accept applications through an authorised visa application centre rather than at the embassy. Confirm on the embassy's own site which centre is authorised and what its charges are, so you do not pay an unofficial site.", "Visa applications commonly ask for a passport with sufficient validity, photographs, proof of funds and travel plans. The authority's checklist for your category is the one that counts."], links: [vfs] },
      { heading: "How flights fit in", bullets: ["Check whether the visa authority wants a flight reservation or a ticket, and do not assume either. A booking is not a visa.", "Prefer refundable or changeable fares until the visa decision, and read the conditions before you pay.", "Check transit countries separately. A connection can need its own visa or transit permission.", "Ask the airline what documents it checks at the airport; it can refuse boarding without valid entry documents."], links: [international, { label: "Understand the full price", href: "/pricing-transparency" }] },
      { heading: "Be careful with promises", paragraphs: ["No agent can guarantee a visa. Approval, timing and fees are decided by the authority, and a refusal can affect later applications. Be wary of anyone who guarantees approval or asks for payment to a personal account.", scope] },
    ],
    questions: [{ question: "Can MaxTravel guarantee my visa?", answer: "No one can. Visa decisions belong to the destination government. Ask the office what assistance it can offer; it cannot promise approval." }, { question: "Do I need a visa for a connecting flight?", answer: "It depends on the transit country, your passport and whether you leave the transit area or change airport. Check the transit country's official guidance." }],
    cta: contact, related: [passport, insurance, international], reviewedAt,
  },
  {
    slug: "travel-insurance-guide", title: "Travel Insurance for International Trips: What to Check", eyebrow: "BEFORE YOU TRAVEL ABROAD",
    description: "What to compare in a travel insurance policy for a trip abroad, how visa-linked cover works, and how to complain to the regulator if a claim is disputed.",
    heading: "Travel insurance: read the policy, not just the price.",
    intro: "A travel policy is a contract with an insurer. Cover, exclusions and claim steps differ between policies, so compare the wording for your trip and your health.",
    sections: [
      { heading: "What to compare", bullets: ["Medical cover and emergency evacuation, and the amount and currency of each limit.", "Trip cancellation, interruption and delay, and the reasons the policy accepts.", "Baggage loss and delay, and the cap per item.", "Pre-existing conditions, age limits, adventure activities and any exclusions.", "Who to call during an emergency, and how claims are filed and documented."] },
      { heading: "When a visa requires it", paragraphs: ["Some destinations ask for travel medical insurance as part of a visa application. Schengen visa rules, for example, commonly set a minimum medical cover amount for the whole stay. Confirm the exact requirement on the consulate's or visa centre's official page, because it depends on the country and visa type.", "Check that the policy dates match your visa dates and that its territory covers every country you will visit."], links: [visa, vfs] },
      { heading: "If a claim goes wrong", paragraphs: ["Take it first to the insurer's grievance process. If the answer is unsatisfactory or late, the insurance regulator's Bima Bharosa system lets the policyholder register and track a complaint, and the Insurance Ombudsman is a further option. Only the insured or claimant can file.", "Bima Bharosa does not ask complainants for payment."], links: [{ label: "Bima Bharosa: complaints help", href: "https://bimabharosa.irdai.gov.in/Home/FAQ" }, { label: "IRDAI policyholder site: how to make a complaint", href: "https://policyholder.gov.in/how-to-make-a-complaint" }] },
      { heading: "Buy at the right time", paragraphs: ["Read the policy wording before payment, and check the cooling-off or free-look terms for the policy you pick. Insurance products are sold by licensed insurers and their authorised distributors.", scope] },
    ],
    questions: [{ question: "Is travel insurance mandatory for every foreign trip?", answer: "Not everywhere. Some visas require it, and many travellers choose it anyway. Check your destination's official requirements." }, { question: "Does MaxTravel sell travel insurance?", answer: "This page does not say it does. Ask the office whether it can help you with a policy, and read any policy wording before paying." }],
    cta: contact, related: [visa, passport, international], reviewedAt,
  },
  {
    slug: "cruise-holidays-guide", title: "Cruise Holidays from India: A Planning Checklist", eyebrow: "SEA, PORTS AND PAPERWORK",
    description: "What to check before booking a cruise from India: ports, documents, cabin and fare inclusions, embarkation timing and travel insurance.",
    heading: "Cruise holidays: what to check before you book a cabin.",
    intro: "A cruise combines a ship, several ports and often a flight at each end. This checklist covers what to confirm so the pieces fit together.",
    sections: [
      { heading: "Choose the route and the port", paragraphs: ["Confirm the embarkation and disembarkation ports, the ports of call and the dates. Cruises that start in another country mean a flight there, and sometimes a flight home from a different city.", "Compare itineraries by what you actually need: number of nights, time ashore at each port, and how easy the embarkation port is to reach."] },
      { heading: "Documents and entry rules", paragraphs: ["Passport validity and visa rules can apply for the countries you will visit, including ports where you only step ashore. Check each country's official rules for your passport and the cruise line's own document requirements.", "Do not wait until the last minute: a missing document can mean being refused boarding, and the cruise line's terms say what happens to the fare."], links: [passport, visa, mea, { label: "Cruise Lines International Association", href: "https://cruising.org/" }] },
      { heading: "Read what the fare includes", bullets: ["Cabin category and its location, and whether a specific cabin is guaranteed.", "Meals, drinks, entertainment and gratuities: which are included and which are extra.", "Shore excursions, port charges, taxes and any onboard spending requirements.", "Cancellation and change terms, and the payment schedule."] },
      { heading: "Flights and insurance", paragraphs: ["Do not book non-flexible flights until the cruise is confirmed, and leave enough time before embarkation. Ships leave on schedule, and a late flight can mean missing the departure.", "Check that your travel insurance covers cruises and the countries you will visit, as some policies treat sea travel differently."], links: [insurance, international] },
      { heading: "Ask before you rely on it", paragraphs: [scope] },
    ],
    questions: [{ question: "Can I book a cruise on MaxTravel's website?", answer: "No. The online booking platform covers flights and hotels and is in testing. Ask the office whether it can assist with a cruise." }, { question: "Do I need a visa for a cruise?", answer: "It depends on the ports, your passport and each country's rules. Check the official guidance for every country on the itinerary." }],
    cta: contact, related: [visa, insurance, passport], reviewedAt,
  },
  {
    slug: "holiday-packages-guide", title: "Holiday & Tour Packages: How to Compare Before You Book", eyebrow: "PACKAGES, UNPACKED",
    description: "How to compare holiday and tour packages from India: what is included, hidden extras, flights, hotels, visas, cancellation terms and consumer rights.",
    heading: "Holiday and tour packages: compare what is actually included.",
    intro: "Two packages with the same headline price can include very different things. Compare them line by line before you commit.",
    sections: [
      { heading: "Ask for the full inclusion list", bullets: ["Flights or trains: airline, class, baggage, and whether airport transfers are included.", "Hotels: named properties or a category, room type, meals and the number of nights.", "Sightseeing and guides: what is included, and what is optional and charged separately.", "Taxes, service charges and any fee not in the headline price.", "Visa, insurance and tips: usually separate, so ask whether they are included."] },
      { heading: "Check the terms that cost money later", paragraphs: ["Read the cancellation and change terms, the payment schedule and what happens if the operator changes the itinerary or a hotel. Get these in writing before paying.", "Ask for the operator's name, the booking confirmation and a contact number for use during the trip."] },
      { heading: "Do the paperwork early", paragraphs: ["International packages need valid passports and often visas, which the traveller usually has to arrange within the authority's own timelines. Do not treat a package booking as a visa or as proof of entry permission.", "For Indian destinations, the Ministry of Tourism publishes official destination information."], links: [passport, visa, insurance, { label: "Incredible India: official destination information", href: "https://www.incredibleindia.gov.in/" }] },
      { heading: "If something goes wrong", paragraphs: ["Keep every receipt and message. If you cannot settle a dispute with the seller, India's National Consumer Helpline accepts consumer grievances and can guide you to the right forum.", scope], links: [{ label: "National Consumer Helpline", href: "https://consumerhelpline.gov.in/" }] },
    ],
    questions: [{ question: "Does MaxTravel publish holiday package prices?", answer: "No. This site does not publish package prices or availability. Contact the office to discuss your trip." }, { question: "What should a package quote always show?", answer: "The full inclusions, the total price with taxes and charges, the payment schedule and the cancellation and change terms." }],
    cta: contact, related: [international, passport, visa], reviewedAt,
  },
];
