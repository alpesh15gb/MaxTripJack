"use client";

import { useEffect, useState } from 'react';
import { StitchSymbol } from './stitch-symbol';
import BookingActivity from './booking-activity';

export type PendingSearch = {
  title: string;
  detail: string;
  phase: 'destination' | 'availability';
  departureDate?: string;
};

export default function SearchJourneyPending({ product, context, onStop }: {
  product: 'FLIGHT' | 'HOTEL';
  context: PendingSearch | null;
  onStop: () => void;
}) {
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  const flight = product === 'FLIGHT';
  const mapping = context?.phase === 'destination';
  const title = mapping ? 'Finding properties in this destination…' : flight ? 'Checking flight availability…' : 'Checking hotel availability…';
  const detail = mapping ? 'We’ll check rates for your dates once we find matching properties.' : 'Waiting for live supplier availability.';

  return (
    <section id="booking-pending" className="stitch-search-pending" aria-label="Search in progress">
      <header className="stitch-search-route">
        <span className="stitch-search-product" aria-hidden="true">
          <StitchSymbol name={flight ? 'flight_takeoff' : 'hotel'} size={24}/>
        </span>
        <div>
          <h1>{context?.title || (flight ? 'Flight search' : 'Hotel search')}</h1>
          {context?.detail && <p>{context.detail}</p>}
        </div>
        <button type="button" className="stitch-search-stop" onClick={onStop}>
          <StitchSymbol name="tune" size={17}/>Stop search &amp; edit
        </button>
      </header>
      <BookingActivity title={title} detail={detail} product={product} takingLonger={takingLonger}/>
      <div className="stitch-pending-layout" aria-hidden="true">
        <div className="stitch-pending-filters">
          <span className="stitch-pending-line"/>
          <span className="stitch-pending-line"/>
          <span className="stitch-pending-line"/>
          <span className="stitch-pending-line"/>
        </div>
        <div className="stitch-pending-results" data-product={product.toLowerCase()}>
          {[1, 2].map(row => (
            <div className="stitch-pending-result" key={row}>
              <span className="stitch-pending-thumb"/>
              <div className="stitch-pending-result-copy">
                <span className="stitch-pending-line"/>
                <span className="stitch-pending-line"/>
              </div>
              <span className="stitch-pending-action"/>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
