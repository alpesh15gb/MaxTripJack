import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import AirlineLogo from './airline-logo';
import { durationLabel, flightStops, groupLabel, journeyMinutes, refundLabel, type Flight, type FlightFare } from '@/lib/booking-presentation';
import { displayMoney } from '@/lib/display-money';
import { comparableFareEstimate, haveComparableCurrency, orderFareOffers } from '@/lib/fare-display';
import { airportDecisionLabel, baggageDecisionLabel, fareDecisionDetails, fareDecisionLabel, lowestComparableFare } from '@/lib/flight-decision';
import { connectionLabel, segmentDurationLabel } from '@/lib/flight-duration';
import { arrivalDayLabel } from '@/lib/flight-results';
import { travelDateLabel, travelDateTimeLabel, travelTimeLabel } from '@/lib/travel-date';

export const money = displayMoney;

type BookingFlightCardProps = {
  flight: Flight;
  group: string;
  selectedFareId?: string;
  checkingFareId?: string;
  busy: boolean;
  readOnly?: boolean;
  selectionMode?: 'review' | 'leg';
  onSelect: (fare: FlightFare, trigger: HTMLButtonElement) => void;
  isCompatible?: (fare: FlightFare) => boolean;
};

const anyFare = () => true;

export default function BookingFlightCard({
  flight, group, selectedFareId, checkingFareId, busy, onSelect, isCompatible = anyFare,
  readOnly = false, selectionMode = 'review',
}: BookingFlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const termsId = `${id}-terms`;
  const priceId = `${id}-price`;
  const headingId = `${id}-heading`;
  const farePanel = useRef<HTMLDetailsElement>(null);
  const fareTrigger = useRef<HTMLElement>(null);
  const fareHeading = useRef<HTMLHeadingElement>(null);
  const focusOpenedFares = useRef(false);
  const checkingStatus = useRef<HTMLParagraphElement>(null);
  const selected = flight.totalPriceList.some(fare => fare.id === selectedFareId);

  useLayoutEffect(() => {
    if (!busy || !checkingFareId) return;
    const status = checkingStatus.current;
    if (!status) return;
    const bounds = status.getBoundingClientRect();
    // Keep progress and the disabled action in view without moving keyboard focus.
    if (bounds.top < 16 || bounds.bottom > window.innerHeight - 120) {
      status.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, [busy, checkingFareId]);

  useEffect(() => {
    if (busy || readOnly || !expanded || !focusOpenedFares.current) return;
    const frame = requestAnimationFrame(() => {
      focusOpenedFares.current = false;
      fareHeading.current?.focus({ preventScroll: true });
      fareHeading.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, readOnly, busy]);

  function closeFares() {
    if (farePanel.current) farePanel.current.open = false;
    fareTrigger.current?.focus();
  }

  const offers = orderFareOffers(flight.totalPriceList, 'INR');
  const eligible = offers.filter(isCompatible);
  const noCompatibleFare = offers.length > 0 && eligible.length === 0;
  const disclosureLocked = busy && !readOnly;
  const prices = eligible.map(fare => comparableFareEstimate(fare, 'INR')).filter(price => price !== null);
  const estimate = prices.length ? Math.min(...prices) : null;
  const headlineAdult = !readOnly && group !== 'COMBO' && estimate !== null
    ? eligible.find(fare => comparableFareEstimate(fare, 'INR') === estimate)?.fD.ADULT
    : undefined;
  const cabinBaggage = baggageDecisionLabel(headlineAdult?.bI?.cB);
  const checkedBaggage = baggageDecisionLabel(headlineAdult?.bI?.iB);
  const headlineFacts = [
    cabinBaggage !== 'Not supplied' && !cabinBaggage.endsWith('(unit not supplied)') ? `Cabin ${cabinBaggage}` : null,
    checkedBaggage !== 'Not supplied' && !checkedBaggage.endsWith('(unit not supplied)') ? `Checked ${checkedBaggage}` : null,
    headlineAdult?.rT === 0 || headlineAdult?.rT === 1 || headlineAdult?.rT === 2 ? refundLabel(headlineAdult.rT) : null,
  ].filter((fact): fact is string => fact !== null);
  const comparableCurrency = haveComparableCurrency(offers, 'INR');
  const showFares = expanded || selected;
  const baseline = !readOnly && showFares && eligible.length > 1 ? lowestComparableFare(offers, isCompatible) : undefined;
  const baselinePrice = baseline ? comparableFareEstimate(baseline, 'INR') : null;
  const showBaseline = baselinePrice !== null && prices.length > 1;
  const first = flight.sI[0], last = flight.sI.at(-1);
  const dayChange = first && last ? arrivalDayLabel(first.dt, last.at) : null;
  const combo = group === 'COMBO';
  const groupName = groupLabel(group);
  const stops = flightStops(flight, group);
  const minutes = journeyMinutes(flight, group);
  const airlines = new Set(flight.sI.map(segment => segment.fD.aI.name).filter(Boolean));
  const airlineName = first?.fD.aI.name || 'Airline';
  const connections = combo ? [] : flight.sI.slice(0, -1).map((segment, index) => {
    return connectionLabel(segment, flight.sI[index + 1], group);
  }).filter(label => label.startsWith('Transfer between') || !label.includes('not supplied'));
  const actionLabel = selectionMode === 'leg' ? `Choose this ${groupName.toLowerCase()} fare` : 'Check fare & continue';
  const visibleAction = expanded ? 'Hide fares' : 'View fares';

  return <article className={`white-card booking-record live-flight-card${readOnly ? ' is-readonly' : ''}${expanded && !readOnly ? ' is-choosing-fare' : ''}${selected ? ' is-selected' : ''}${noCompatibleFare ? ' has-no-compatible-fare' : ''}`}>
    <div className="flight-result-top">
      <div className="airline-identity">
        <AirlineLogo code={first?.fD.aI.code} name={first?.fD.aI.name} />
        <div>
          <strong>{airlineName}{airlines.size > 1 && <span className="flight-multiple-airlines"> + {airlines.size - 1} airline{airlines.size === 2 ? '' : 's'}</span>}</strong>
          <small>{flight.sI.map(segment => [segment.fD.aI.code, segment.fD.fN].filter(Boolean).join(' ')).filter(Boolean).join(' · ') || groupName}</small>
        </div>
      </div>
    </div>
    {combo ? <div className="combo-itinerary">
      <strong>Complete itinerary</strong>
      {flight.sI.map((segment, index) => <div key={`${segment.fD.fN}-${index}`}>
        <span>{segment.da.code} → {segment.aa.code}</span>
        <small>{airportDecisionLabel(segment.da)} → {airportDecisionLabel(segment.aa)}</small>
        <span>{travelDateTimeLabel(segment.dt)} — {travelDateTimeLabel(segment.at)}</span>
        <small>{segment.fD.aI.name} · {segment.fD.fN} · Segment duration: {segmentDurationLabel(segment.duration)}</small>
      </div>)}
      <p className="muted">All times are local. Each journey may have its own baggage and fare conditions.</p>
    </div> : <>
      <div className="flight-route-line">
        <div>
          <strong>{travelTimeLabel(first?.dt)}</strong>
          <span>{first?.da.code}</span>
          {first?.da.city && <span className="flight-airport-city">{first.da.city}</span>}
          <small>{travelDateLabel(first?.dt)}</small>
        </div>
        <div className="flight-route-track">
          <small className="flight-total-duration">{minutes === null ? durationLabel(null) : `Total journey ${durationLabel(minutes)}`}</small>
          <span aria-hidden="true" />
          <small>{stops === null ? 'Stop details unavailable' : stops === 0 ? 'Non-stop' : `${stops} stop${stops === 1 ? '' : 's'} · ${flight.sI.slice(0, -1).map(segment => segment.aa.code).join(', ')}`}</small>
          {connections.map((label, index) => <small className="flight-connection-note" key={index}>{label}</small>)}
        </div>
        <div>
          <strong>{travelTimeLabel(last?.at)}</strong>
          <span>{last?.aa.code}</span>
          {last?.aa.city && <span className="flight-airport-city">{last.aa.city}</span>}
          <small>{travelDateLabel(last?.at)}</small>
          {dayChange && <span className="flight-day-change">{dayChange}</span>}
        </div>
      </div>
      <div className="flight-result-details">
        <details className="flight-segment-details">
          <summary>Flight details</summary>
          {flight.sI.map((segment, index) => <div className="flight-segment" key={index}>
            <strong>{segment.fD.aI.name} · {[segment.fD.aI.code, segment.fD.fN].filter(Boolean).join(' ')}</strong>
            <p>{airportDecisionLabel(segment.da)} → {airportDecisionLabel(segment.aa)}</p>
            <p>{travelDateTimeLabel(segment.dt)} → {travelDateTimeLabel(segment.at)}</p>
            <p>Segment duration: {segmentDurationLabel(segment.duration)}</p>
            {index < flight.sI.length - 1 && <p className="muted">{connectionLabel(segment, flight.sI[index + 1], group)}</p>}
          </div>)}
          <p className="muted">All times are local to each airport.</p>
        </details>
        {headlineFacts.length > 0 && <div className="flight-headline-facts">
          <span>Adult fare shown</span>
          <ul aria-label="Known details for the displayed adult fare">{headlineFacts.map(fact => <li key={fact}>{fact}</li>)}</ul>
        </div>}
      </div>
    </>}
    <details
      ref={farePanel}
      className="fare-comparison"
      open={selected || undefined}
      onToggle={event => {
        if (!event.currentTarget.open) focusOpenedFares.current = false;
        setExpanded(event.currentTarget.open);
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !expanded || busy || readOnly) return;
        event.stopPropagation();
        closeFares();
      }}
    >
      <summary
        ref={fareTrigger}
        aria-disabled={disclosureLocked || undefined}
        aria-label={readOnly ? undefined : `${visibleAction} for ${airlineName}, ${travelTimeLabel(first?.dt)}`}
        aria-describedby={readOnly ? undefined : priceId}
        onClick={event => {
          if (disclosureLocked) {
            event.preventDefault();
            return;
          }
          focusOpenedFares.current = !farePanel.current?.open && !readOnly;
        }}
      >
        <span>{readOnly ? 'Selected fare' : <>
          <span className="choose-fare-label">{visibleAction} <span aria-hidden="true">{expanded ? '↑' : '→'}</span></span>
          <small>{offers.length} fare option{offers.length === 1 ? '' : 's'}</small>
        </>}</span>
        <strong id={priceId}>{noCompatibleFare ? 'No compatible fare' : estimate === null ? 'Price at review' : <>
          {!readOnly && <span className="flight-price-from">From </span>}<span className="flight-price-amount">{money(estimate)}</span>
        </>}
          {noCompatibleFare ? <small>These fares do not match your outbound selection.</small> : <>
            <small>{estimate === null ? 'Total for all travellers' : 'Estimated total · all travellers'}</small>
            <small>{combo ? 'Complete itinerary' : `${groupName} journey`}</small>
          </>}
        </strong>
      </summary>
      {showFares && <div className="fare-comparison-options" role={readOnly ? undefined : 'region'} aria-labelledby={readOnly ? undefined : headingId}>
        {!readOnly && <>
          <div className="fare-choice-heading">
            <div>
              <h3 ref={fareHeading} id={headingId} tabIndex={-1}>{offers.length > 1 ? 'Compare fares' : 'Your fare option'}</h3>
              <p>{combo ? 'Complete itinerary' : `${groupName} · ${first?.da.code} → ${last?.aa.code}`}</p>
              {!combo && <p className="fare-itinerary-dates">{travelDateTimeLabel(first?.dt)} → {travelDateTimeLabel(last?.at)}{dayChange ? ` · ${dayChange}` : ''}</p>}
              {combo && <small>Inspect every flight in the complete itinerary above.</small>}
            </div>
            <button type="button" className="secondary" disabled={busy} onClick={closeFares}>Back to flights</button>
          </div>
          <p id={termsId} className="fare-details-unavailable fare-shared-terms">Check the final price, cancellation and change fees, seat inclusions and eligibility at review.</p>
        </>}
        {offers.length === 0 && <p className="muted">No fare options were supplied for this flight.</p>}
        <div className={readOnly ? undefined : 'fare-decision-grid'}>{offers.map((fare, index) => {
          const compatible = isCompatible(fare);
          const price = comparableFareEstimate(fare, 'INR');
          const difference = compatible && price !== null && baselinePrice !== null ? price - baselinePrice : 0;
          const isSelected = selectedFareId === fare.id;
          const checking = busy && checkingFareId === fare.id;
          const fareHeadingId = `${id}-offer-${index}`;
          const fareName = fareDecisionLabel(fare, offers);
          const rows = fareDecisionDetails(fare, compatible && price !== null ? baseline : undefined);
          const passengerBaggage = Object.entries(fare.fD).filter(([kind]) => kind !== 'ADULT').map(([kind, detail]) =>
            <p className="fare-passenger-baggage muted" key={kind}>{kind.toLowerCase()}: cabin baggage {baggageDecisionLabel(detail.bI?.cB).replace(/^Not supplied$/, 'not supplied')} · checked baggage {baggageDecisionLabel(detail.bI?.iB).replace(/^Not supplied$/, 'not supplied')}</p>
          );
          const eligibility = !compatible ? 'Does not match your selected outbound fare.' :
            fare.fareIdentifier === 'SPECIAL_RETURN' ? 'Requires a matching special-return fare.' : null;

          if (readOnly) return <div className={`live-fare fare-option${isSelected ? ' is-selected' : ''}`} key={fare.id}>
            <div>
              <h3>{fareName}</h3>
              <p className="fare-details-unavailable">Check the reviewed fare conditions for the latest fees and eligibility.</p>
              <ul className="fare-features">
                <li>Cabin baggage: {baggageDecisionLabel(fare.fD.ADULT?.bI?.cB)}</li>
                <li>Checked baggage: {baggageDecisionLabel(fare.fD.ADULT?.bI?.iB)}</li>
                <li>{refundLabel(fare.fD.ADULT?.rT)}</li>
              </ul>
              {passengerBaggage}
              {fare.fD.ADULT?.cc && <p className="muted">Cabin: {fare.fD.ADULT.cc.replaceAll('_', ' ')}</p>}
              {eligibility && <p className="muted">{eligibility}</p>}
            </div>
            <div className="fare-option-action">
              <strong>{price !== null ? money(price) : 'Price at review'}</strong>
              <small>{price !== null ? 'All travellers · estimated total' : 'Total for all travellers'}</small>
            </div>
          </div>;

          return <div
            className={`live-fare fare-option fare-option-compact${isSelected ? ' is-selected' : ''}`}
            key={fare.id}
            role="group"
            aria-labelledby={fareHeadingId}
            aria-describedby={termsId}
          >
            <div className="fare-option-heading">
              <h4 id={fareHeadingId}>{fareName}</h4>
              <strong>{price === null ? 'Price at review' : money(price)}</strong>
            </div>
            {showBaseline && (fare.id === baseline?.id || difference > 0) && <p className="fare-price-comparison">
              {difference > 0 ? `+${money(difference)} vs lowest shown fare` : 'Lowest shown estimate'}
            </p>}
            <dl className="fare-decision-dimensions">
              {rows.map(({ label, value, differs }) => <div key={label} className={differs ? 'fare-difference' : undefined}>
                <dt>{label}</dt>
                <dd>{value}{differs && <small>Differs from lowest shown fare</small>}</dd>
              </div>)}
            </dl>
            {(passengerBaggage.length > 0 || eligibility) && <div className="fare-option-notes">
              {passengerBaggage}
              {eligibility && <p className={compatible ? 'muted' : 'fare-ineligible'}>{eligibility}</p>}
            </div>}
            <div className="fare-option-action">
              {checking && <p ref={checkingStatus} className="booking-selection-status" role="status">Checking current fare… Price and availability are not confirmed yet.</p>}
              <small>{price !== null ? 'All travellers · estimated total' : 'Total for all travellers'}</small>
              <button
                type="button"
                className="primary"
                disabled={busy || !compatible}
                aria-describedby={termsId}
                aria-pressed={selectionMode === 'leg' ? isSelected : undefined}
                onClick={event => onSelect(fare, event.currentTarget)}
              >{checking ? 'Checking fare…' : selectionMode === 'leg' && isSelected ? 'Selected' : actionLabel}</button>
            </div>
          </div>;
        })}</div>
        {offers.length > 1 && <p className="fare-comparison-guidance">{comparableCurrency ?
          'Lowest INR estimates first; unpriced offers last.' :
          'Supplier order shown. Price differences are unavailable across currencies.'}</p>}
      </div>}
    </details>
  </article>;
}
