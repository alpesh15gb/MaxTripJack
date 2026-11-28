export const supportTopics = [
  { id: 'baggage', icon: 'bag', title: 'Baggage', description: 'Check the allowance included in your chosen fare.' },
  { id: 'refunds', icon: 'refresh', title: 'Cancellations & refunds', description: 'Request a cancellation or check the progress of a refund.' },
  { id: 'bookings', icon: 'plane', title: 'Changes & schedules', description: 'Ask about changing travel dates or an airline schedule change.' },
  { id: 'documents', icon: 'passport', title: 'E-tickets & documents', description: 'Find the documents available for your booking.' },
  { id: 'seats', icon: 'plane', title: 'Seats & check-in', description: 'Review seat selection and prepare to fly.' },
  { id: 'payments', icon: 'receipt', title: 'Payments', description: 'Check a payment and understand which charges are included.' },
  { id: 'insurance', icon: 'shield', title: 'Travel insurance', description: 'Discuss cover and eligibility with the travel desk.' },
  { id: 'children', icon: 'user', title: 'Children & minors', description: 'Check child ages, fares and accommodation needs.' },
  { id: 'holidays', icon: 'globe', title: 'Packages & activities', description: 'Browse itineraries or discuss a package or activity.' },
  { id: 'contact', icon: 'phone', title: 'Contact & account help', description: 'Reach our travel desk or get help signing in.' },
  { id: 'policies', icon: 'receipt', title: 'Terms & policies', description: 'Find the supplier rules and Max Travel policies that apply.' },
] as const;

export type SupportTopic = (typeof supportTopics)[number]['id'];
export type SupportQuestion = {
  id: string;
  topic: SupportTopic;
  title: string;
  answer: string;
  action: { label: string; href: string };
};

export const supportQuestions: SupportQuestion[] = [
  { id: 'cancel-booking', topic: 'refunds', title: 'How can I cancel my booking?', answer: 'Open your booking in My trips and choose Changes, cancellation & refund updates. The available action depends on the supplier and fare rules. Any quoted charges and the supplier’s confirmation determine whether the cancellation is complete.', action: {label:'Manage a booking', href:'/my-trips'} },
  { id: 'change-dates', topic: 'bookings', title: 'Can I change my travel dates?', answer: 'Use the change options on your booking or ask the travel desk to check. Availability, price difference and change fees depend on your booking. Review the quote and wait for supplier confirmation before relying on the new itinerary.', action: {label:'Open My trips', href:'/my-trips'} },
  { id: 'allowance', topic: 'baggage', title: 'What is my baggage allowance?', answer: 'Check the allowance on the fare you selected and on your confirmation. The cabin, operating airline and route may affect which bags are included. For an existing booking, check the itinerary and the operating airline’s rules before departure.', action: {label:'Read the flight booking guide', href:'/flight-booking-guide'} },
  { id: 'ticket-confirmation', topic: 'documents', title: 'Where can I find my e-ticket or confirmation?', answer: 'Open My trips and check the available documents on your booking. Payment alone does not confirm a trip. If your booking is still pending, check the status before paying again.', action: {label:'Check booking status', href:'/my-trips'} },
  { id: 'seat-selection', topic: 'seats', title: 'How can I reserve a seat?', answer: 'Look for seat selection on your fare or in the operating airline’s Manage Booking or check-in flow. Seat availability, eligibility and fees depend on the airline and fare.', action: {label:'See what a fare includes', href:'/pricing-transparency'} },
  { id: 'flight-coming-up', topic: 'seats', title: 'My flight is coming up soon. What should I do?', answer: 'Check your confirmation documents and the operating airline’s official flight-status and airport guidance. Contact MaxTravel during the published office hours. We do not provide 24-hour emergency support or override airline operational decisions.', action: {label:'Read the check-in guide', href:'/flight-booking-guide#section-4'} },
  { id: 'payment-no-booking', topic: 'payments', title: 'Money deducted, but no confirmed booking?', answer: 'Check the existing booking and payment status in My trips. Keep your receipt and contact us if the result is pending or unclear. Wait for the team to check the existing attempt before paying again.', action: {label:'Check the existing booking', href:'/my-trips'} },
  { id: 'refund-status', topic: 'refunds', title: 'How can I check a refund or follow up?', answer: 'Open the booking to review any cancellation or refund updates. Refund eligibility, amount and timing depend on the booking and payment outcome. If it is unresolved, send the booking reference, a short timeline and what you need checked.', action: {label:'Prepare a support request', href:'/customer-support/request'} },
  { id: 'account-help', topic: 'contact', title: 'How do I get back into my account?', answer: 'Use the account page to reset your password or resend a verification email. Sign in using the email on your booking to see trips from other devices.', action: {label:'Open account help', href:'/account?returnTo=%2Fmy-trips'} },
  { id: 'testing', topic: 'contact', title: 'Can I make a live booking through this website?', answer: 'The online platform is currently In Testing. Test results and online checkout do not create live travel bookings or payments. Contact MaxTravel about your travel needs. The team confirms the available arrangements separately.', action: {label:'Explore available travel assistance', href:'/services'} },
  { id: 'schedule-change', topic: 'bookings', title: 'What should I do if the airline changes my flight?', answer: 'Check your latest confirmation and the operating airline’s notice. Contact the travel desk with the booking reference to check the options and any applicable terms before accepting a change.', action: {label:'Check your booking', href:'/my-trips'} },
  { id: 'fare-total', topic: 'payments', title: 'Where do I see the full booking price?', answer: 'The reviewed price shows the amount for your selected travellers and itinerary along with the available price details. Check any separate seat, baggage or service charges before continuing.', action: {label:'Read our pricing guide', href:'/pricing-transparency'} },
  { id: 'insurance-options', topic: 'insurance', title: 'How can I enquire about travel insurance?', answer: 'Tell our team your destination, dates and traveller ages. Ask for insurer terms, eligibility, cover limits and exclusions before purchasing. The policy document determines cover and claims.', action: {label:'Explore insurance assistance', href:'/travel-insurance-guide'} },
  { id: 'child-fares', topic: 'children', title: 'How should I search when travelling with children?', answer: 'Include every traveller and the ages the search asks for. Airline rules for infants, children and unaccompanied minors vary. Hotel room eligibility and rates can also depend on children’s ages.', action: {label:'Open the search form', href:'/book'} },
  { id: 'package-dates', topic: 'holidays', title: 'Can I enquire about a package or activity for my dates?', answer: 'Browse published itineraries or tell the team your destination, dates and group size. The travel desk confirms the available options, price and terms for those arrangements.', action: {label:'Browse holiday packages', href:'/packages'} },
  { id: 'supplier-terms', topic: 'policies', title: 'Where can I check change, cancellation and payment terms?', answer: 'Read the conditions for the selected fare or room and the applicable Max Travel policies. Contact the team if a term is unclear before authorising a change or making a payment.', action: {label:'Read cancellations and payment policy', href:'/cancellations-payment-policy'} },
];

export const popularSupportQuestions = supportQuestions.slice(0, 12);

export function findSupportQuestions(query: string, topic?: SupportTopic) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return supportQuestions.filter(question => {
    const text = `${question.title} ${question.answer}`.toLowerCase();
    return (!topic || question.topic === topic) && words.every(word => text.includes(word));
  });
}
