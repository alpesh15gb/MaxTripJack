'use client';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {supportQuestions} from '@/lib/support-faq';
import {displayMoney} from '@/lib/display-money';
import {StitchSymbol} from './stitch-symbol';

const cityNames: Record<string, string> = {HYD: 'Hyderabad', DEL: 'New Delhi', BOM: 'Mumbai', GOI: 'Goa', DXB: 'Dubai', BLR: 'Bengaluru', MAA: 'Chennai'};
const dayLabel = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});
type Deal = {from: string; to: string; date: string; minor: number};

/** Holiday Flight Deals: only fares our own searches verified recently. Hidden when there are none. */
export function HomeFlightDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/travel/fare-deals', {signal: controller.signal})
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data && Array.isArray(data.deals)) setDeals(data.deals.slice(0, 9)); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!deals.length) return null;
  return <section className="destina-home-deals stitch-home-wrap" aria-labelledby="home-deals-heading">
    <div className="stitch-section-title"><div><h2 id="home-deals-heading">Holiday Flight Deals</h2><p>The lowest fares our searches found recently for popular routes</p></div><Link href="/flights/routes">All flight deals <StitchSymbol name="arrow_forward" size={15}/></Link></div>
    <ul className="destina-deal-grid">{deals.map(deal => {
      const search = new URLSearchParams({product: 'FLIGHT', from: deal.from, to: deal.to, date: deal.date, adults: '1', autoSearch: '1'});
      return <li key={deal.from + deal.to}><Link href={`/book?${search}`}>
        <span className="destina-deal-route"><strong>{cityNames[deal.from] ?? deal.from}</strong><StitchSymbol name="arrow_forward" size={14}/><strong>{cityNames[deal.to] ?? deal.to}</strong></span>
        <span className="destina-deal-meta">One way · {dayLabel.format(new Date(`${deal.date}T00:00:00Z`))} · Economy</span>
        <span className="destina-deal-price"><small>from</small> {displayMoney(deal.minor)}</span>
      </Link></li>;
    })}</ul>
    <p className="destina-deal-note">Fares are for one adult, seen in recent Max Travel searches. Prices change often; the final price is confirmed at review.</p>
  </section>;
}

const reasons = [
  {icon: 'receipt_long', title: 'Clear prices', detail: 'See the total, baggage and fare rules before you pay. Nothing is added at checkout without being shown.'},
  {icon: 'flight_takeoff', title: 'Flights and stays together', detail: 'Compare flights and hotels in one place, or ask our desk to plan both into one itinerary.'},
  {icon: 'calendar_month', title: '15-day fare calendar', detail: 'Spot cheaper departure days at a glance and switch dates without starting over.'},
  {icon: 'support_agent', title: 'Real travel experts', detail: 'Our Secunderabad travel desk helps before, during and after your trip.'},
];

/** Why Book with Max Travel: four plain statements, no invented statistics. */
export function HomeWhyBook() {
  return <section className="destina-home-why stitch-home-wrap" aria-labelledby="home-why-heading">
    <h2 id="home-why-heading">Why Book with Max Travel</h2>
    <ul>{reasons.map(reason => <li key={reason.title}>
      <i aria-hidden="true"><StitchSymbol name={reason.icon} size={24}/></i>
      <strong>{reason.title}</strong>
      <p>{reason.detail}</p>
    </li>)}</ul>
  </section>;
}

const homeQuestionIds = ['fare-total', 'change-dates', 'cancel-booking', 'allowance', 'ticket-confirmation'];

/** Frequently Asked Questions: a short set drawn from the help centre's answers. */
export function HomeFaq() {
  const questions = homeQuestionIds.map(id => supportQuestions.find(question => question.id === id)).filter(question => question !== undefined);
  return <section className="destina-home-faq stitch-home-wrap" aria-labelledby="home-faq-heading">
    <div>
      <h2 id="home-faq-heading">Frequently Asked Questions</h2>
      <p>Quick answers about booking flights, hotels and holidays with Max Travel.</p>
      <Link className="destina-faq-link" href="/customer-support/faq">Visit our Help Center</Link>
    </div>
    <div className="destina-faq-list">{questions.map((question, index) => <details key={question.id} open={index === 0 || undefined}>
      <summary>{question.title}<StitchSymbol name="expand_more" size={20}/></summary>
      <p>{question.answer}</p>
      <Link href={question.action.href}>{question.action.label}</Link>
    </details>)}</div>
  </section>;
}

/** Closing three-column summary of what Max Travel offers. */
export function HomeAboutText() {
  return <section className="destina-home-about stitch-home-wrap" aria-labelledby="home-about-heading">
    <h2 id="home-about-heading">Book Flights, Hotels and Holidays with Max Travel</h2>
    <div>
      <article><h3>Flights, compared in one search</h3><p>Search domestic and international flights, filter by stops, airlines and departure time, and compare fares across a 15-day calendar. Review baggage and fare rules before you pay.</p></article>
      <article><h3>Hotels for every kind of stay</h3><p>Compare room options, meal plans and cancellation terms for your dates. The final room price and its conditions are confirmed with the property before payment.</p></article>
      <article><h3>Holidays planned with our desk</h3><p>Browse published itineraries or tell our Secunderabad team where and when you want to go. We plan flights, stays and activities around your group and budget.</p></article>
    </div>
  </section>;
}
