/**
 * Editorial route guides, not inventory. Facts reviewed against official sources
 * on 2026-10-20; no provider, database, credential or booking imports belong here.
 * Do not add fares, frequencies or terminal promises without dated evidence and
 * authorization to display that inventory. Airport codes are not city aliases.
 */
export type ContentSection = {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  links?: readonly { label: string; href: string }[];
};

export type FlightGuide = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  origin: { code: string; name: string; city: string };
  destination: { code: string; name: string; city: string };
  sections: readonly ContentSection[];
  questions: readonly { question: string; answer: string }[];
  sources: readonly { label: string; href: string }[];
  reviewedAt: string;
  relatedSlugs: readonly string[];
};

const reviewedAt = '2026-10-20';
const airports = {
  HYD: { code: 'HYD', name: 'Rajiv Gandhi International Airport', city: 'Hyderabad' },
  DEL: { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'Delhi' },
  BOM: { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai' },
  DXB: { code: 'DXB', name: 'Dubai International', city: 'Dubai' },
  GOI: { code: 'GOI', name: 'Dabolim Airport (Goa International Airport)', city: 'Goa (Dabolim)' },
  BLR: { code: 'BLR', name: 'Kempegowda International Airport Bengaluru', city: 'Bengaluru' },
} as const;

const sources = {
  indiaTime: { label: 'CSIR–National Physical Laboratory: Indian Standard Time', href: 'https://www.nplindia.res.in/clockcode/html/' },
  hyderabadTransport: { label: 'Hyderabad Airport: transport options', href: 'https://www.hyderabad.aero/travellers/to-and-from-airport' },
  delhiMetro: { label: 'Delhi Airport: Metro and terminal access', href: 'https://www.newdelhiairport.in/to-and-from-airport/metro/' },
  delhiTransfers: { label: 'Delhi Airport: inter-terminal transfers', href: 'https://www.newdelhiairport.in/inter-terminal-commute/' },
  mumbaiTransport: { label: 'Mumbai CSMIA: airport transport', href: 'https://csmia-mumbai.adaniairports.com/en/airport-facilities/transport' },
  naviMumbai: { label: 'Navi Mumbai Airport: official NMI code announcement', href: 'https://navimumbai.adaniairports.com/en/newsroom' },
  fareRules: { label: 'Air India: fare benefits and ticket-rule precedence', href: 'https://www.airindia.com/in/en/book/smart-fares.html' },
  baggage: { label: 'Air India: baggage and restricted-item guidance', href: 'https://www.airindia.com/in/en/travel-information/baggage-guidelines.html' },
  refunds: { label: 'Air India: payment, refund and cancellation guidance', href: 'https://www.airindia.com/in/en/frequently-asked-questions/payment-refund-cancellations.html' },
  uaeTime: { label: 'UAE Government: country facts and time zone', href: 'https://u.ae/en/about-the-uae/fact-sheet' },
  uaeEntry: { label: 'UAE Government: check entry and visa requirements', href: 'https://u.ae/en/information-and-services/visa-and-emirates-id/Visa-information/do-you-need-an-entry-permit-or-a-visa-to-enter-the-uae' },
  dubaiMetro: { label: 'Dubai Airports: Metro access at DXB', href: 'https://dubaiairports.ae/transport/metro' },
  dubaiTransfers: { label: 'Dubai Airports: flight and airport transfers', href: 'https://dubaiairports.ae/information/transfers' },
  emiratesBaggage: { label: 'Emirates: baggage depends on the route, fare and class', href: 'https://www.emirates.com/english/before-you-fly/baggage/checked-baggage/' },
  dabolim: { label: 'Airports Authority of India: Dabolim Airport', href: 'https://www.aai.aero/en/airports/flights/goa' },
  manohar: { label: 'Manohar International Airport: GOX official site', href: 'https://www.miagoaairport.com/' },
  goaBuses: { label: 'Manohar Airport: bus routes and current timings', href: 'https://www.miagoaairport.com/bus-routes' },
  goaTaxis: { label: 'Manohar Airport: taxi services', href: 'https://www.miagoaairport.com/taxi-service' },
  bengaluru: { label: 'Bengaluru Airport: official terminal and flight information', href: 'https://www.bengaluruairport.com/' },
  bengaluruTransport: { label: 'Air India: Bengaluru airport and city transport guide', href: 'https://www.airindia.com/content/air-india/in/en/travel-information/airport-information/bengaluru.html' },
} as const;

export const flightGuides: readonly FlightGuide[] = [
  {
    slug: 'hyderabad-to-delhi',
    title: 'Hyderabad to Delhi Flights: Airports & Travel Guide',
    description: 'Plan Hyderabad to Delhi travel with HYD and DEL airport details, Delhi terminal and Metro guidance, and a practical fare-comparison checklist.',
    heading: 'Hyderabad to Delhi flights: plan your arrival in the capital',
    intro: 'Plan the journey from Hyderabad to Delhi around your arrival terminal and onward destination—not just a departure time. This guide helps you check airport access, connections and the fare details that matter before selecting an itinerary.',
    origin: airports.HYD,
    destination: airports.DEL,
    sections: [
      {
        heading: 'HYD to DEL: airport and time-zone essentials',
        paragraphs: [
          'This route is Rajiv Gandhi International Airport in Hyderabad (HYD) to Indira Gandhi International Airport in Delhi (DEL). Both cities use Indian Standard Time, UTC+05:30, so there is no time-zone change.',
          'Use your selected dates to establish available airlines, stops, scheduled journey time and terminals. A route guide is not a live flight listing, and a published airline route page does not guarantee a seat on the date you need.',
        ],
      },
      {
        heading: 'Choose Delhi transport after checking your terminal',
        paragraphs: [
          'Delhi Airport identifies the Airport Express/Orange Line for Terminal 3 and the Magenta Line for Terminal 1. Its guidance describes Terminal 2 access via Terminal 3. Check the terminal on your flight details before choosing a Metro station, and check current service hours for your arrival date.',
          'Write down your actual onward destination: a Delhi address, railway station or another terminal. For a train connection, leave room for disembarking, any checked bags and the ground journey. The scheduled landing time is not the time you will be ready to board a train.',
          'If you are connecting to another flight, check both terminals and whether baggage is checked through. Use the airport’s inter-terminal guidance rather than assuming the next departure is a short walk away.',
        ],
        links: [sources.delhiMetro, sources.delhiTransfers],
      },
      {
        heading: 'Getting to Hyderabad Airport',
        paragraphs: [
          'Hyderabad Airport lists Pushpak airport buses, prepaid taxis, app-based cabs and car rentals. Choose an option from your real starting address, then check the current timetable and pickup instructions before leaving.',
          'Build in time for the airline’s reporting and bag-drop requirements separately from the road journey. Old bus screenshots and generic airport-transfer estimates are not a substitute for checking your date and starting point.',
        ],
        links: [sources.hyderabadTransport],
      },
      {
        heading: 'Compare the ticket you will actually use',
        paragraphs: [
          'Compare totals for the same passengers and dates, including taxes, compulsory service charges and any bags or seats you need. Baggage and flexibility vary by selected airline and fare; the issued ticket and its fare rules determine what is included.',
          'If a meeting or family visit may change your plans, compare change fees, any fare difference and cancellation conditions alongside the initial price. Do not assume a fare is refundable because it costs more.',
        ],
        bullets: ['Confirm HYD and DEL, including both travel dates.', 'Review stops, total journey time and the final Delhi arrival terminal.', 'Check baggage, fare rules and your onward travel plan before payment.'],
      },
    ],
    questions: [
      { question: 'Which Metro line should I use after arriving in Delhi?', answer: 'Check your arrival terminal first. Delhi Airport identifies Airport Express for T3 and the Magenta Line for T1, with T2 access via T3. Check the operator’s current hours for your arrival.' },
      { question: 'Can I plan a train connection using a typical flight duration?', answer: 'Use the selected itinerary’s scheduled arrival instead, then separately allow for baggage and the ground transfer. A static guide cannot guarantee that a connection will work.' },
    ],
    sources: [
      { label: 'Air India: HYD and DEL route and airport identities', href: 'https://www.airindia.com/en-in/book-flights/hyderabad-to-delhi-flights' },
      sources.indiaTime, sources.delhiMetro, sources.delhiTransfers, sources.hyderabadTransport, sources.fareRules,
    ],
    reviewedAt,
    relatedSlugs: ['delhi-to-mumbai', 'delhi-to-bengaluru'],
  },
  {
    slug: 'delhi-to-mumbai',
    title: 'Delhi to Mumbai Flights: BOM Airport Guide',
    description: 'Plan Delhi to Mumbai travel with DEL and BOM airport details, a clear Navi Mumbai airport distinction, and onward-transfer and fare checks.',
    heading: 'Delhi to Mumbai flights: choose the right airport and transfer',
    intro: 'A Mumbai-area destination label is not enough to plan your arrival. Start with the exact airport code and your final address, then compare the flight, baggage and ground transfer as one journey.',
    origin: airports.DEL,
    destination: airports.BOM,
    sections: [
      {
        heading: 'BOM is not Navi Mumbai Airport',
        paragraphs: [
          'This guide is for Indira Gandhi International Airport, Delhi (DEL) to Chhatrapati Shivaji Maharaj International Airport, Mumbai (BOM). Navi Mumbai International Airport uses the separate code NMI. Do not substitute one airport for the other when arranging a pickup or comparing itineraries.',
          'Delhi and Mumbai both use Indian Standard Time, UTC+05:30. There is no time-zone difference, but an overnight itinerary can still arrive on the next calendar day.',
        ],
        links: [sources.naviMumbai],
      },
      {
        heading: 'Work backwards from your Mumbai address',
        paragraphs: [
          'Save the full hotel, meeting or family address before choosing an arrival time. CSMIA lists taxis, app-based cabs, buses, suburban rail connections and Metro options. Its guide identifies Vile Parle and Andheri as nearby suburban railway stations.',
          'A nearby station does not guarantee a direct journey to your destination. Check terminal access, changes, luggage practicality and the final leg. For a business appointment, account for leaving the aircraft, collecting bags and the journey to the actual address.',
          'If someone is collecting you, send the airport code and final terminal from your itinerary—not only “Mumbai airport.” Recheck the pickup location against current airport signs or guidance after landing.',
        ],
        links: [sources.mumbaiTransport],
      },
      {
        heading: 'Plan your Delhi departure separately',
        paragraphs: [
          'Confirm the departure terminal before selecting ground transport. Delhi’s Airport Express serves T3; the Magenta Line serves T1. Check current Metro hours and the airline’s reporting requirement as separate parts of your plan.',
          'For a connection at either end, review whether the itinerary changes terminal or airport, whether bags are checked through and whether the journey is on one ticket or separate bookings. Do not apply a generic minimum connection time to every combination.',
        ],
        links: [sources.delhiMetro],
      },
      {
        heading: 'Check flexibility as well as price',
        paragraphs: [
          'For an uncertain meeting or return date, compare the exact ticket’s change fees, fare differences, cancellation terms and no-show conditions. A higher cabin or a higher price does not by itself establish that the fare is fully refundable.',
          'Compare the same passenger count, dates and baggage needs. Review the complete amount, including taxes and compulsory charges, and check baggage entitlement across all flights in the selected journey.',
        ],
        bullets: ['Confirm DEL → BOM, not NMI.', 'Review dates, stops, duration, baggage and arrival terminal.', 'Check the transfer to your final address and the chosen fare’s change conditions.'],
      },
    ],
    questions: [
      { question: 'Does BOM mean Navi Mumbai?', answer: 'No. BOM identifies Chhatrapati Shivaji Maharaj International Airport. Navi Mumbai International Airport has the distinct code NMI.' },
      { question: 'Should I choose only by the lowest displayed airfare?', answer: 'Compare the full itinerary and ground-transfer arrangements too. A different airport can change the time and practical cost of reaching your destination; no saving is guaranteed.' },
    ],
    sources: [
      { label: 'Air India: DEL and BOM route and airport identities', href: 'https://www.airindia.com/en-in/book-flights/delhi-to-mumbai-flights' },
      sources.naviMumbai, sources.indiaTime, sources.mumbaiTransport, sources.delhiMetro, sources.fareRules, sources.refunds,
    ],
    reviewedAt,
    relatedSlugs: ['mumbai-to-goa', 'delhi-to-bengaluru'],
  },
  {
    slug: 'hyderabad-to-dubai',
    title: 'Hyderabad to Dubai Flights: HYD–DXB Travel Guide',
    description: 'Plan HYD to DXB travel with airport details, the Dubai time difference, official entry-check links and practical arrival and connection guidance.',
    heading: 'Hyderabad to Dubai flights: documents, local times and arrival plans',
    intro: 'Plan this international journey around documents, local arrival dates and the airport on your ticket. Use official entry guidance and current flight details rather than treating a route guide as an eligibility or availability guarantee.',
    origin: airports.HYD,
    destination: airports.DXB,
    sections: [
      {
        heading: 'Read both airport codes and local times',
        paragraphs: [
          'This guide covers Rajiv Gandhi International Airport, Hyderabad (HYD) to Dubai International (DXB). Check the operating airline, selected travel date, stops and current flight status before heading to the airport.',
          'Hyderabad uses UTC+05:30 and the UAE is GMT/UTC+04:00. Dubai is therefore 1 hour 30 minutes behind Hyderabad. Read departure and arrival in each airport’s local time, including any next-day marker. Simply subtracting the clock times does not give the flight duration.',
        ],
      },
      {
        heading: 'Check entry and transit documents before paying',
        paragraphs: [
          'Consult the UAE government’s official guidance for your nationality, passport and travel purpose. Visa-free entry, visa on arrival and an advance visa are different arrangements. Review the official passport-validity guidance and confirm uncertainties with the relevant authority or airline before committing to a non-refundable itinerary.',
          'This page does not determine your eligibility or guarantee admission. For an onward connection, review the complete journey: destination requirements, ticket arrangement, baggage handling and any need to enter the UAE.',
          'Separate tickets can change baggage and transfer requirements. Check the airport’s connecting-passenger guidance and the airlines’ instructions rather than assuming that bags will automatically reach the final destination.',
        ],
        links: [sources.uaeEntry, sources.dubaiTransfers],
      },
      {
        heading: 'DXB and DWC are different airports',
        paragraphs: [
          'Dubai International (DXB) is not Dubai World Central–Al Maktoum International (DWC). Dubai Airports describes an airport change as involving landside travel, with passport-control and baggage implications. Do not treat a DXB/DWC transfer as an ordinary airside connection.',
          'At DXB, the Red Line Metro connects Terminals 1 and 3. Check current RTA hours against your local arrival time and allow for arrival formalities before assuming you can catch a train.',
          'For a hotel arrival after midnight, confirm the check-in date and late-arrival arrangement directly with the property. Share DXB and the selected flight’s terminal when arranging a pickup.',
        ],
        links: [sources.dubaiMetro, sources.dubaiTransfers],
      },
      {
        heading: 'Review the entire itinerary’s baggage and fare rules',
        paragraphs: [
          'Check cabin and checked baggage against the chosen fare and full itinerary. Allowances can depend on the route, fare and cabin: a generic “Dubai baggage allowance” is not a reliable basis for packing.',
          'Compare the complete price and ticket conditions before continuing. Check modification charges, any fare difference and refund restrictions; do not assume every international fare has the same flexibility.',
        ],
        bullets: ['Confirm HYD → DXB and the local arrival date.', 'Check operating carrier, stops, total journey time and entry/transit documents.', 'Review baggage, terminal, airport transfer and hotel arrangements.'],
      },
    ],
    questions: [
      { question: 'What is the time difference between Hyderabad and Dubai?', answer: 'Dubai is 1 hour 30 minutes behind Hyderabad, based on India’s UTC+05:30 and the UAE’s GMT/UTC+04:00. Read the local date and time shown for each airport.' },
      { question: 'Is a Dubai connection always within DXB?', answer: 'No. Check each airport code. DXB and DWC are separate airports; an airport change requires additional planning and may have entry and baggage implications.' },
      { question: 'Does this guide confirm that I can enter the UAE?', answer: 'No. Use the linked UAE government guidance for your passport and travel purpose, and confirm your circumstances with the relevant authority or airline.' },
    ],
    sources: [
      { label: 'Emirates: HYD and DXB route and airport identities', href: 'https://www.emirates.com/english/destinations/hyd/dxb/flights-from-hyderabad-to-dubai/' },
      sources.indiaTime, sources.uaeTime, sources.uaeEntry, sources.dubaiMetro, sources.dubaiTransfers, sources.emiratesBaggage,
    ],
    reviewedAt,
    relatedSlugs: ['hyderabad-to-delhi', 'delhi-to-mumbai'],
  },
  {
    slug: 'mumbai-to-goa',
    title: 'Mumbai to Goa Flights: GOI or GOX?',
    description: 'Compare Goa airport choices before planning Mumbai travel: Dabolim GOI, Manohar GOX, hotel-transfer checks and route-specific booking guidance.',
    heading: 'Mumbai to Goa flights: choose GOI or GOX before booking',
    intro: 'Goa has two distinct airports. Choose the airport using your accommodation address and transfer plan, then keep its code visible through search and itinerary review. The main planning link on this page uses Dabolim (GOI); an explicit GOX alternative appears below.',
    origin: airports.BOM,
    destination: airports.GOI,
    sections: [
      {
        heading: 'Two Goa airports, two explicit choices',
        paragraphs: [
          'Dabolim Airport, also called Goa International Airport, uses GOI. Manohar International Airport at Mopa uses GOX. They are not alternative names for the same airport, and a fare to one must not be silently relabelled as a fare to the other.',
          'This guide begins at Chhatrapati Shivaji Maharaj International Airport, Mumbai (BOM), not Navi Mumbai’s NMI. Both Mumbai and Goa use Indian Standard Time, UTC+05:30, with no time-zone change.',
          'The links below only prefill airport choices. They do not establish availability, a nonstop service or a fare for any date. Choose your dates and review the actual itinerary separately.',
        ],
        links: [
          { label: 'Plan BOM → Dabolim (GOI)', href: '/book?product=FLIGHT&from=BOM&to=GOI' },
          { label: 'Plan BOM → Manohar (GOX)', href: '/book?product=FLIGHT&from=BOM&to=GOX' },
        ],
      },
      {
        heading: 'Choose using your stay, not just “Goa”',
        paragraphs: [
          'Compare the ground route from each airport to your accommodation’s full address. Account for the arrival hour, bags, hotel check-in, transfer options and the return pickup. Do not assume one airport is best for every hotel described as North Goa or South Goa.',
          'GOX publishes bus connections involving Mapusa, Panaji, Margao and Calangute, plus separate taxi information. Check the current timetable and route for your date: a listed destination does not promise a bus immediately after landing or a direct ride to the hotel.',
          'For GOI, use Dabolim information rather than GOX pickup instructions. Send the airport code to your driver or hotel before agreeing a transfer. For a group, share both arrival and departure codes because the return itinerary may use a different airport.',
        ],
        links: [sources.dabolim, sources.goaBuses, sources.goaTaxis],
      },
      {
        heading: 'Compare the complete holiday journey',
        paragraphs: [
          'Keep the passenger count, dates and baggage needs the same when comparing results. Consider the transfer arrangements you need rather than deciding between airports from airfare alone. No lower total trip cost is guaranteed.',
          'If a late landing affects the hotel night you need, confirm that directly with the property. Do not assume that arriving after midnight includes early check-in or that every transfer service will be available at that time.',
          'For sports equipment, instruments or other unusual baggage, review acceptance, size and fee rules with the airline before selecting a fare. Standard baggage should not be assumed to cover every oversized item. Changes and cancellations depend on the chosen ticket.',
        ],
        bullets: ['Choose GOI or GOX explicitly and confirm BOM as the origin.', 'Check the airport on each direction, not just the outbound flight.', 'Review dates, bags, hotel address, pickup arrangements and fare conditions.'],
      },
    ],
    questions: [
      { question: 'Are GOI and GOX the same airport?', answer: 'No. GOI is Dabolim Airport; GOX is Manohar International Airport at Mopa. Check the code when searching, reviewing the itinerary and arranging transfers.' },
      { question: 'Which Goa airport does this page’s main planning link select?', answer: 'The main link prefills BOM → GOI, for Dabolim. The separately labelled GOX link prefills Manohar Airport. Neither link promises inventory or automatically submits a search.' },
      { question: 'Can I use the same pickup instructions for both airports?', answer: 'No. Confirm the airport code and current pickup instructions with the airport or transfer provider. Share the final itinerary before arranging collection.' },
    ],
    sources: [
      { label: 'Air India: BOM–GOI airport identities', href: 'https://www.airindia.com/en-in/book-flights/mumbai-to-goa-flights' },
      sources.dabolim, sources.manohar, sources.naviMumbai, sources.indiaTime, sources.goaBuses, sources.goaTaxis, sources.baggage,
    ],
    reviewedAt,
    relatedSlugs: ['delhi-to-mumbai', 'delhi-to-bengaluru'],
  },
  {
    slug: 'delhi-to-bengaluru',
    title: 'Delhi to Bengaluru Flights: DEL–BLR Travel Guide',
    description: 'Plan Delhi to Bengaluru travel with DEL and BLR airport details, city-transfer guidance, terminal checks and practical baggage and fare comparisons.',
    heading: 'Delhi to Bengaluru flights: plan the airport-to-city journey',
    intro: 'Work backwards from your final Bengaluru address before choosing an arrival time. This route guide focuses on airport identity, terminal checks and the onward journey, so a scheduled landing is not confused with reaching your destination.',
    origin: airports.DEL,
    destination: airports.BLR,
    sections: [
      {
        heading: 'Delhi to Bengaluru: check DEL and BLR',
        paragraphs: [
          'This guide connects Indira Gandhi International Airport, Delhi (DEL) with Kempegowda International Airport Bengaluru (BLR). Bangalore and Bengaluru appear in travel information for the same destination; confirm BLR in your selected itinerary.',
          'Both cities use Indian Standard Time, UTC+05:30. There is no time-zone adjustment, but a late-night departure may still arrive the next day. Check the date as well as the clock time, and use the selected itinerary for stops and scheduled duration.',
        ],
      },
      {
        heading: 'Plan the Bengaluru ground journey first',
        paragraphs: [
          'The official airline airport guide lists Vayu Vajra airport buses, intercity buses, airport taxis, app-based cabs and car rentals. Bengaluru Airport distinguishes Terminal 1 and Terminal 2. Confirm your flight’s terminal and its current pickup arrangements instead of assuming one location serves every arrival.',
          'Save your hotel, office, campus or home’s exact address, not only the city name. Check a current ground route before selecting a flight. For a same-day meeting, budget separately for leaving the aircraft, collecting bags, finding transport and reaching the address.',
          'If taking Vayu Vajra, check the current stop nearest your destination and plan the final leg from that stop. If taking a cab, follow the selected terminal’s current pickup instructions. This guide does not promise a fixed road-transfer time.',
        ],
        links: [sources.bengaluru, sources.bengaluruTransport],
      },
      {
        heading: 'Allow for the departure and return journey',
        paragraphs: [
          'At Delhi, establish the departure terminal before choosing Metro access. Airport Express serves T3 and the Magenta Line serves T1. Check the service timetable separately from the airline’s reporting and bag-drop requirements.',
          'For the return, plan the journey from your actual address and allow for current conditions. An easy outbound transfer does not guarantee the same timing on the return.',
          'If connecting, check every terminal, baggage handling and whether flights are on one ticket or separate bookings. Do not treat a generic layover figure as a guarantee for the selected combination.',
        ],
        links: [sources.delhiMetro],
      },
      {
        heading: 'Match the fare to your plans',
        paragraphs: [
          'For a business trip with uncertain dates, compare modification rules and any fare difference as well as the initial price. For family travel, check each passenger’s selected baggage entitlement instead of multiplying a generic allowance.',
          'Compare the total for the same dates, passengers and baggage needs, including taxes and compulsory charges. Read cancellation and no-show conditions before continuing; the selected ticket’s fare rules determine what is included.',
        ],
        bullets: ['Confirm DEL → BLR and both travel dates.', 'Review stops, total duration, terminals, bags and flexibility.', 'Check transport to the full Bengaluru address and the return pickup plan.'],
      },
    ],
    questions: [
      { question: 'Is Bangalore airport different from Bengaluru airport?', answer: 'In this guide, both names refer to Kempegowda International Airport Bengaluru, code BLR. Use the airport code to confirm your itinerary.' },
      { question: 'How long should I allow to reach my Bengaluru address?', answer: 'Check a current ground route for your exact address and arrival time, then allow separately for disembarking, baggage and finding transport. This guide cannot guarantee a fixed city-transfer time.' },
    ],
    sources: [
      { label: 'Air India: DEL and BLR route and airport identities', href: 'https://www.airindia.com/en-in/book-flights/delhi-to-bangalore-flights' },
      sources.indiaTime, sources.bengaluru, sources.bengaluruTransport, sources.delhiMetro, sources.fareRules, sources.refunds,
    ],
    reviewedAt,
    relatedSlugs: ['delhi-to-mumbai', 'hyderabad-to-delhi'],
  },
];

export function getFlightGuide(slug: string): FlightGuide | undefined {
  return flightGuides.find(guide => guide.slug === slug);
}

/** Planning prefill only: no dates, auto-search, inventory or booking action. */
export function flightGuideSearchHref(guide: FlightGuide): string {
  const params = new URLSearchParams({
    product: 'FLIGHT',
    from: guide.origin.code,
    to: guide.destination.code,
  });
  return `/book?${params.toString()}`;
}
