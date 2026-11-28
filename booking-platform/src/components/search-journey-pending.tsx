"use client";

import { useEffect, useState } from 'react';
import { StitchSymbol } from './stitch-symbol';

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
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 6000);
    const ticker = window.setInterval(() => setStep(value => value + 1), 2200);
    return () => { window.clearTimeout(timer); window.clearInterval(ticker); };
  }, []);

  const flight = product === 'FLIGHT';
  const mapping = context?.phase === 'destination';
  const title = mapping ? 'Finding properties in this destination…' : flight ? 'Checking flight availability…' : 'Checking hotel availability…';
  const detail = takingLonger
    ? mapping ? 'This destination is taking longer to match. You can wait or edit your search.'
      : 'Availability is taking longer to check. You can wait or edit your search.'
    : mapping ? 'We’ll check rates for your dates once we find matching properties.'
      : flight ? 'Checking seats and fares for your trip.' : 'Checking room rates for your dates and guests.';

  const hints = flight
    ? ['Contacting airlines for your route…', 'Comparing fares and baggage…', 'Checking seat availability…', 'Sorting the best options…']
    : ['Finding properties for your dates…', 'Comparing room rates…', 'Checking meal plans and cancellation terms…', 'Sorting the best options…'];
  const hint = hints[step % hints.length];

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
      <div className="stitch-search-live">
        <div className="stitch-search-scene" data-product={flight ? 'flight' : 'hotel'} aria-hidden="true">
          {flight ? <>
            <span className="stitch-scene-cloud stitch-scene-cloud-near"/>
            <span className="stitch-scene-cloud stitch-scene-cloud-far"/>
            <span className="stitch-scene-path"/>
            <span className="stitch-scene-origin"/>
            <span className="stitch-scene-arrival"/>
            <span className="stitch-scene-plane"><StitchSymbol name="flight_takeoff" size={30}/></span>
          </> : <>
            <span className="stitch-scene-moon"/>
            <span className="stitch-scene-horizon"/>
            <span className="stitch-scene-hotel">
              {Array.from({length: 6}, (_, index) => <i key={index}/>)}
              <span/>
            </span>
          </>}
        </div>
        <div className="stitch-search-copy" role="status" aria-label="Search and booking activity">
          <strong>{title}</strong>
          <p>{detail}</p>
          <div className="stitch-search-progress" aria-hidden="true"><span/></div>
          {!takingLonger && <p className="stitch-search-hint" aria-hidden="true">{hint}</p>}
        </div>
      </div>
      <div className="stitch-pending-layout" aria-hidden="true">
        <div className="stitch-pending-filters">
          {[0, 1, 2].map(group => <div className="stitch-pending-filter-group" key={group}>
            <span className="stitch-pending-line"/>
            <span className="stitch-pending-line"/>
            <span className="stitch-pending-line"/>
          </div>)}
        </div>
        <div className="stitch-pending-results" data-product={product.toLowerCase()}>
          {flight && <div className="stitch-pending-sorts">{[0, 1, 2, 3].map(tile => <span key={tile}/>)}</div>}
          {[1, 2, 3, 4, 5].map(row => (
            <div className="stitch-pending-result" key={row}>
              <span className="stitch-pending-thumb"/>
              <div className="stitch-pending-result-copy">
                <span className="stitch-pending-line"/>
                {flight ? <span className="stitch-pending-route"><i/><b/><i/></span> : <span className="stitch-pending-line"/>}
                <span className="stitch-pending-line"/>
              </div>
              <div className="stitch-pending-price">
                <span className="stitch-pending-line"/>
                <span className="stitch-pending-action"/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
