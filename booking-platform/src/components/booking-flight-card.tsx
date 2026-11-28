import { useId, useLayoutEffect, useRef, useState } from 'react';
import AirlineLogo from './airline-logo';
import FareOptionsRail from './fare-options-rail';
import FlightSegmentDetails from './flight-segment-details';
import { TravelIcon } from './travel-icon';
import { durationLabel, flightStops, groupLabel, journeyMinutes, refundLabel, type Flight, type FlightFare, type FlightSegment } from '@/lib/booking-presentation';
import { displayMoney } from '@/lib/display-money';
import { comparableFareEstimate, haveComparableCurrency, orderFareOffers } from '@/lib/fare-display';
import { airportDecisionLabel, baggageDecisionLabel, fareDecisionDetails, fareDecisionLabel, lowestComparableFare } from '@/lib/flight-decision';
import { connectionLabel, segmentDurationLabel } from '@/lib/flight-duration';
import { arrivalDayLabel, flightConnectionAirports } from '@/lib/flight-results';
import { travelDateLabel, travelDateTimeLabel, travelTimeLabel } from '@/lib/travel-date';
import {flightSeatCount} from '@/lib/flight-seat-inventory';

export const money = displayMoney;

type BookingFlightCardProps = {
  flight: Flight;
  group: string;
  selectedFareId?: string;
  checkingFareId?: string;
  busy: boolean;
  readOnly?: boolean;
  selectionMode?: 'review' | 'leg';
  journeyContext?: string;
  seatInventoryScope?: 'adult-only' | 'mixed';
  onSelect: (fare: FlightFare, trigger: HTMLButtonElement) => void | Promise<void>;
  isCompatible?: (fare: FlightFare) => boolean;
  onChangeOutbound?: () => void;
  onEditSearch?: () => void;
};

const anyFare = () => true;
const resultDepartureDate = new Intl.DateTimeFormat('en-IN', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});

function resultClock(timestamp: string | undefined) {
  const local = travelTimeLabel(timestamp);
  if (local === 'Time unavailable') return local;
  const hour = Number(local.slice(0, 2));
  return `${hour % 12 || 12}${local.slice(2)} ${hour < 12 ? 'AM' : 'PM'}`;
}

function resultDate(timestamp: string) {
  return travelDateLabel(timestamp) === 'Date unavailable'
    ? 'Date unavailable'
    : resultDepartureDate.format(Date.parse(`${timestamp.slice(0, 10)}T00:00:00Z`));
}

function knownBaggage(value: string) {
  return value !== 'Not supplied' && !value.endsWith('(unit not supplied)');
}

function SeatsLeft({fare, scope}: {fare?: FlightFare; scope?: BookingFlightCardProps['seatInventoryScope']}) {
  const count = flightSeatCount(fare?.fD.ADULT?.sR);
  if (!scope || !count) return null;
  return <span className="flight-seat-availability" title="TripJack test inventory at search. Availability is checked again at review.">
    <TravelIcon name="user" size={13}/>
    <span>{count} {count===1?'seat':'seats'} left{scope==='mixed'?' on the adult fare':''} <small>· at search</small></span>
  </span>;
}

function DrawerAirport({airport, localTime}: {airport: FlightSegment['da']; localTime: string}) {
  const place = [airport.name, airport.city].filter((value, index, values) =>
    value && value !== airport.code && values.indexOf(value) === index).join(' · ');
  return <div className="drawer-airport">
    <div className="drawer-airport-time"><strong>{travelTimeLabel(localTime)}</strong><small>{travelDateLabel(localTime).replace(/ \d{4}$/,'')}</small></div>
    <div className="drawer-airport-place"><strong>{airport.code || 'Airport not supplied'}</strong>{place && <small>{place}</small>}</div>
  </div>;
}

function DrawerTimeline({segments, group}: {segments: FlightSegment[]; group: string}) {
  return <ol className="drawer-flight-timeline" aria-label="Flight timeline">
    {segments.map((segment, index) => {
      const next = segments[index + 1];
      const connection = next && group !== 'COMBO' && Boolean(segment.isRs) === Boolean(next.isRs)
        ? connectionLabel(segment, next, group) : undefined;
      const flightNumber = [segment.fD.aI.code, segment.fD.fN].filter(Boolean).join(' ');
      return <li key={index}>
        <DrawerAirport airport={segment.da} localTime={segment.dt}/>
        <div className="drawer-airline-row">
          <AirlineLogo code={segment.fD.aI.code} name={segment.fD.aI.name}/>
          <div><strong>{segment.fD.aI.name || 'Airline'}</strong><small>{[flightNumber, segmentDurationLabel(segment.duration)].filter(Boolean).join(' · ')}</small></div>
        </div>
        <DrawerAirport airport={segment.aa} localTime={segment.at}/>
        {connection && <p className="drawer-flight-connection">{connection}</p>}
      </li>;
    })}
  </ol>;
}

export default function BookingFlightCard({
  flight, group, selectedFareId, checkingFareId, busy, onSelect, isCompatible = anyFare, onChangeOutbound, onEditSearch,
  readOnly = false, selectionMode = 'review', journeyContext, seatInventoryScope,
}: BookingFlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [drawerFareId, setDrawerFareId] = useState<string>();
  const id = useId();
  const termsId = `${id}-terms`;
  const priceId = `${id}-price`;
  const headingId = `${id}-heading`;
  const dialog = useRef<HTMLDialogElement>(null);
  const fareTrigger = useRef<HTMLButtonElement>(null);
  const fareHeading = useRef<HTMLHeadingElement>(null);
  const checkingStatus = useRef<HTMLParagraphElement>(null);
  const selected = flight.totalPriceList.some(fare => fare.id === selectedFareId);

  useLayoutEffect(() => {
    if (!busy || !checkingFareId) return;
    const action = checkingStatus.current?.parentElement;
    if (!action) return;
    // The action grows when progress appears. Reveal both the status and button
    // on both axes after that layout is in place, without moving keyboard focus.
    const frame = requestAnimationFrame(() => {
      const bounds = action.getBoundingClientRect();
      const block = bounds.top < 16 || bounds.bottom > window.innerHeight - 24 ? 'center' : 'nearest';
      action.scrollIntoView({behavior: 'instant', block, inline: 'nearest'});
    });
    return () => cancelAnimationFrame(frame);
  }, [busy, checkingFareId]);

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!expanded || !panel || panel.open) return;
    panel.showModal();
    fareHeading.current?.focus({ preventScroll: true });
  }, [expanded]);

  function closeFares() {
    dialog.current?.close();
    setExpanded(false);
    setDrawerFareId(undefined);
  }

  function chooseFare(fare: FlightFare) {
    const trigger = fareTrigger.current;
    if (!trigger || busy) return;
    if (selectionMode === 'leg') {
      closeFares();
      onSelect(fare, trigger);
      return;
    }
    void Promise.resolve(onSelect(fare, trigger)).finally(closeFares);
  }

  const offers = orderFareOffers(flight.totalPriceList, 'INR');
  const eligible = offers.filter(isCompatible);
  const noCompatibleFare = offers.length > 0 && eligible.length === 0;
  const prices = eligible.map(fare => comparableFareEstimate(fare, 'INR')).filter(price => price !== null);
  const estimate = prices.length ? Math.min(...prices) : null;
  const headlineFare = !readOnly && estimate !== null
    ? eligible.find(fare => comparableFareEstimate(fare, 'INR') === estimate)
    : undefined;
  const headlineAdult = group !== 'COMBO' ? headlineFare?.fD.ADULT : undefined;
  const cabinBaggage = baggageDecisionLabel(headlineAdult?.bI?.cB);
  const checkedBaggage = baggageDecisionLabel(headlineAdult?.bI?.iB);
  const cabinCode = headlineAdult?.cc ?? (eligible.length === 1 ? eligible[0].fD.ADULT?.cc : undefined);
  const suppliedCabin = cabinCode?.replaceAll('_', ' ').trim().toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  const haveFareFacts = Boolean(suppliedCabin || knownBaggage(cabinBaggage) || knownBaggage(checkedBaggage));
  const comparableCurrency = haveComparableCurrency(offers, 'INR');
  const showFares = expanded || readOnly;
  const baseline = !readOnly && showFares && eligible.length > 1 ? lowestComparableFare(offers, isCompatible) : undefined;
  const baselinePrice = baseline ? comparableFareEstimate(baseline, 'INR') : null;
  const showBaseline = baselinePrice !== null && prices.length > 1;
  const first = flight.sI[0], last = flight.sI.at(-1);
  const dayChange = first && last ? arrivalDayLabel(first.dt, last.at) : null;
  const dayOffset = dayChange?.split(' ')[0];
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
  const visibleAction = noCompatibleFare ? 'See alternatives' : 'View itinerary';
  const viaAirports = flight.sI.slice(0, -1).map(segment => segment.aa.code).filter(Boolean).join(', ');
  const connectionAirports = flightConnectionAirports(flight, group);
  const stopCount = stops === null ? 'Stop details unavailable' : stops === 0 ? 'Direct' : `${stops} stop${stops === 1 ? '' : 's'}`;
  const stopLabel = stops === null ? 'Stop details unavailable' : stops === 0 ? 'Non-stop' :
    `${stops} stop${stops === 1 ? '' : 's'}${viaAirports ? ` via ${viaAirports}` : ''}`;
  const arrivalTime = travelDateLabel(first?.dt) === travelDateLabel(last?.at)
    ? travelTimeLabel(last?.at)
    : travelDateTimeLabel(last?.at);
  const fareChoices = showFares ? offers.map(fare => {
    const name = fareDecisionLabel(fare, offers);
    const price = comparableFareEstimate(fare, 'INR');
    const compatible = isCompatible(fare);
    return { fare, name, price, compatible };
  }) : [];
  const drawerFare = fareChoices.find(choice => choice.compatible && choice.fare.id === (drawerFareId ?? selectedFareId)) ?? fareChoices.find(choice => choice.compatible);
  const drawerFareChecking = busy && checkingFareId === drawerFare?.fare.id;
  const routeHeading = !first || !last || combo ? 'Complete itinerary' : first.da.city && last.aa.city
    ? `${first.da.city} → ${last.aa.city}` : `${first.da.code} → ${last.aa.code}`;

  const priceSummary = <strong id={priceId}>{noCompatibleFare ? 'No compatible fare' : estimate === null ? 'Price at review' : <>
    {!readOnly && offers.length > 1 && <span className="flight-price-from">From </span>}<span className="flight-price-amount">{money(estimate)}</span>
    {!readOnly && <span className="flight-result-currency" aria-hidden="true">INR</span>}
  </>}
    {noCompatibleFare ? <small>These fares do not match your outbound selection.</small> : <>
      <small>{estimate === null ? 'Total for all travellers' : 'Estimated total · all travellers'}</small>
      <small>{combo ? 'Complete itinerary' : `${groupName} journey`}</small>
    </>}
  </strong>;

  const fareCards = showFares && <div className="fare-comparison-options">
    {offers.length === 0 && <p className="muted">No fare options were supplied for this flight.</p>}
    {offers.length > 0 && <FareOptionsRail
      options={fareChoices.map(({name, price, compatible}) => [name, price === null ? 'Price at review' : money(price), !compatible && 'Incompatible fare'].filter(Boolean).join(' · '))}
      locked={busy}
      readOnly={readOnly}
    >{fareChoices.map(({fare, name: fareName, price, compatible}, index) => {
      const difference = compatible && price !== null && baselinePrice !== null ? price - baselinePrice : 0;
      const isSelected = selectedFareId === fare.id;
      const checking = busy && checkingFareId === fare.id;
      const fareHeadingId = `${id}-offer-${index}`;
      const rows = fareDecisionDetails(fare, compatible && price !== null ? baseline : undefined);
      const differences = rows.filter(row => row.differs).map(row => row.label.toLowerCase());
      const unverifiedInclusions = showBaseline && difference > 0 && differences.length === 0;
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
        className={`live-fare fare-option fare-option-compact${isSelected ? ' is-selected' : ''}${showBaseline && fare.id === baseline?.id ? ' is-lowest-fare' : ''}`}
        key={fare.id}
        role="group"
        aria-labelledby={fareHeadingId}
        aria-describedby={termsId}
      >
        <div className="fare-option-heading">
          <h4 id={fareHeadingId} tabIndex={-1}>{fareName}</h4>
          <div className="fare-card-estimate">
            <strong>{price === null ? 'Price at review' : money(price)}</strong>
            <small>{price === null ? 'All travellers' : 'Estimated total · all travellers'}</small>
          </div>
          {showBaseline && (fare.id === baseline?.id || difference > 0) && <p className="fare-price-comparison">
            {difference > 0 ? `+${money(difference)} vs lowest shown fare` : 'Lowest shown estimate'}
          </p>}
        </div>
        <dl className="fare-decision-dimensions">
          {rows.map(({ label, value, differs }) => <div key={label} className={differs ? 'fare-difference' : undefined}>
            <dt>{label}</dt>
            <dd>{value}{differs && <span className="fare-difference-note"> · Differs from lowest shown fare</span>}</dd>
          </div>)}
        </dl>
        {(differences.length > 0 || unverifiedInclusions || passengerBaggage.length > 0 || eligibility) && <div className="fare-option-notes">
          {differences.length > 0 && <p className="fare-changed-inclusions"><TravelIcon name="swap" size={15}/> Differs in {differences.join(', ')}</p>}
          {unverifiedInclusions && <p className="muted">Check the fare rules for any additional inclusions.</p>}
          {passengerBaggage}
          {eligibility && <p className={compatible ? 'muted' : 'fare-ineligible'}>{eligibility}</p>}
        </div>}
        <div className={`fare-option-action${offers.length === 1 ? ' drawer-single-fare-action' : ''}`}>
          {offers.length === 1 && <div className="drawer-fare-total">
            <strong>{price === null ? 'Price at review' : money(price)}</strong>
            <small>{price === null ? 'Total for all travellers' : 'Estimated total for all travellers'}</small>
          </div>}
          {checking && <p ref={checkingStatus} className="booking-selection-status" role="status">Checking current fare… Price and availability are not confirmed yet.</p>}
          <button
            type="button"
            className="primary"
            disabled={busy || !compatible}
            aria-describedby={termsId}
            aria-pressed={selectionMode === 'leg' ? isSelected : undefined}
            onClick={() => chooseFare(fare)}
          >{checking ? 'Checking fare…' : selectionMode === 'leg' && isSelected ? 'Selected' : actionLabel}</button>
        </div>
      </div>;
    })}</FareOptionsRail>}
    {offers.length > 1 && <p className="fare-comparison-guidance">{comparableCurrency ?
      'Lowest INR estimates first; unpriced offers last.' :
      'Supplier order shown. Price differences are unavailable across currencies.'}</p>}
  </div>;

  return <article data-single-fare={offers.length===1||undefined} data-overnight={dayChange?true:undefined} data-combo={combo||undefined} className={`white-card booking-record live-flight-card${readOnly ? ' is-readonly' : ' reference-flight-card'}${selected ? ' is-selected' : ''}${noCompatibleFare ? ' has-no-compatible-fare' : ''}`}>
    <div className="flight-result-top">
      <div className="airline-identity">
        <AirlineLogo code={first?.fD.aI.code} name={first?.fD.aI.name} />
        <div>
          <strong>{airlineName}{airlines.size > 1 && <span className="flight-multiple-airlines"> + {airlines.size - 1} airline{airlines.size === 2 ? '' : 's'}</span>}</strong>
          <small>{flight.sI.map(segment => [segment.fD.aI.code, segment.fD.fN].filter(Boolean).join(' ')).filter(Boolean).join(' · ') || groupName}</small>
        </div>
      </div>
      <SeatsLeft fare={headlineFare} scope={seatInventoryScope}/>
      {!readOnly && first?.dt && <span className="destina-flight-departure">{group === 'RETURN' ? 'Return' : 'Depart'} · {resultDate(first.dt)}</span>}
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
          <strong>{readOnly ? travelTimeLabel(first?.dt) : resultClock(first?.dt)}</strong>
          <span>{first?.da.code}</span>
          {first?.da.city && <span className="flight-airport-city">{first.da.city}</span>}
          <small>{travelDateLabel(first?.dt)}</small>
        </div>
        <div className="flight-route-track" data-direct={stops===0||undefined}>
          <small className="flight-total-duration">{minutes !== null && <span className={connections.length ? undefined : 'sr-only'}>Total journey </span>}{durationLabel(minutes)}</small>
          <span className="flight-track-drawing" aria-hidden="true"><i/>
            {readOnly ? <TravelIcon name="airplane" size={15}/> : connectionAirports.map((airport, index) => <b key={index} />)}
          </span>
          {readOnly ? <small>{stopLabel}</small> : <div className="flight-track-stop-summary">
            <small>{stopCount}</small>
            {connectionAirports.map((airport, index) => <span className="flight-stop-code" key={index}>{airport.code}</span>)}
          </div>}
          {connections.map((label, index) => <small className={readOnly || label.startsWith('Transfer between') ? 'flight-connection-note' : 'sr-only'} key={index}>{label}</small>)}
        </div>
        <div>
          <strong>{readOnly ? travelTimeLabel(last?.at) : resultClock(last?.at)}{!readOnly && dayOffset && <sup className="flight-arrival-offset" title={dayChange??undefined}><span aria-hidden="true">{dayOffset}</span><span className="sr-only"> {dayChange}</span></sup>}</strong>
          <span>{last?.aa.code}</span>
          {last?.aa.city && <span className="flight-airport-city">{last.aa.city}</span>}
          <small>{travelDateLabel(last?.at)}</small>
          {readOnly && dayChange && <span className="flight-day-change">{dayChange}</span>}
        </div>
      </div>
      <div className="flight-result-details">
        {!readOnly && haveFareFacts && <div className="flight-headline-facts">
          <span>Adult fare conditions</span>
          <ul aria-label="Known details for the displayed adult fare">
            {suppliedCabin && <li className="destina-flight-cabin"><TravelIcon name="user" size={13}/>{suppliedCabin}</li>}
            {knownBaggage(cabinBaggage) && <li><TravelIcon name="bag" size={13}/>{/^\d/.test(cabinBaggage) ? `Cabin bag ${cabinBaggage}` : `Cabin bag: ${cabinBaggage}`}</li>}
            {knownBaggage(checkedBaggage) && <li className="flight-checked-baggage"><TravelIcon name="bag" size={13}/>{/^\d/.test(checkedBaggage) ? `${checkedBaggage} checked` : `Checked bag: ${checkedBaggage}`}</li>}
          </ul>
        </div>}
        <FlightSegmentDetails segments={flight.sI} group={group} />
      </div>
    </>}
    {readOnly ? <details className="fare-comparison" open={selected || undefined}>
      <summary><span>Selected fare</span>{priceSummary}</summary>
      {fareCards}
    </details> : <div className="fare-comparison">
      <button
        ref={fareTrigger}
        type="button"
        className="fare-comparison-trigger"
        disabled={busy && !expanded}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-dialog` : undefined}
        aria-label={`${visibleAction} for ${airlineName}, ${resultClock(first?.dt)}`}
        aria-describedby={priceId}
        onClick={event => {
          event.currentTarget.focus({ preventScroll: true });
          setExpanded(true);
        }}
      >
        <span>
          <span className="choose-fare-label">{visibleAction} <TravelIcon name="chevron" size={16}/></span>
          {offers.length !== 1 && <small>{offers.length} fare options</small>}
        </span>
        {priceSummary}
      </button>
      {expanded && <dialog
        ref={dialog}
        id={`${id}-dialog`}
        className="flight-fares-dialog flight-reference-drawer"
        data-fare-count={offers.length}
        aria-labelledby={headingId}
        aria-describedby={`${id}-drawer-context`}
        onCancel={event => {
          event.preventDefault();
          if (!busy) closeFares();
        }}
      >
        <header className="flight-fares-header">
          <div>
            <h3 ref={fareHeading} id={headingId} tabIndex={-1} aria-label="Flight details and fare options">{routeHeading}</h3>
            <p id={`${id}-drawer-context`}><span className="sr-only">{routeHeading} · </span>{journeyContext || groupName}</p>
          </div>
          <button type="button" className="flight-fares-close" aria-label="Back to flights" title="Close fare options" disabled={busy} onClick={closeFares}>×</button>
        </header>
        <div className="flight-fares-body">
          <div className="drawer-fare-notices">
            {drawerFare&&drawerFare.price!==null&&<SeatsLeft fare={drawerFare.fare} scope={seatInventoryScope}/>}
            <p id={termsId} className="fare-details-unavailable fare-shared-terms"><TravelIcon name="receipt" size={18}/>Check final prices, fees, meals and seat options at review.</p>
          </div>
          <div className="flight-fares-itinerary">
            <div className="flight-fares-route">
              <strong>{combo ? 'Flight itinerary' : `${groupName} · ${travelDateLabel(first?.dt)}`}</strong>
              {!combo && <span className="flight-fares-stops">{[minutes === null ? null : durationLabel(minutes), stopLabel].filter(Boolean).join(' · ')}</span>}
            </div>
            {!combo && <p className="fare-itinerary-dates sr-only">{travelDateTimeLabel(first?.dt)} → {arrivalTime}{dayChange ? ` · ${dayChange}` : ''}</p>}
            <DrawerTimeline segments={flight.sI} group={group}/>
            {combo && <FlightSegmentDetails segments={flight.sI} group={group}/>}
          </div>
          {noCompatibleFare && onChangeOutbound && <div className="flight-fare-recovery">
            <p>Try another outbound fare or change your dates to look for a pair that works together.</p>
            <button type="button" className="secondary" disabled={busy} onClick={() => { closeFares(); onChangeOutbound(); }}>Change outbound fare</button>
            {onEditSearch && <button type="button" className="secondary" disabled={busy} onClick={() => { closeFares(); onEditSearch(); }}>Edit flight search</button>}
          </div>}
          {fareCards}
        </div>
        {offers.length > 1 && drawerFare && <footer className="drawer-fare-footer">
          <div className="drawer-fare-total">
            <strong>{drawerFare.price === null ? 'Price at review' : money(drawerFare.price)}</strong>
            <small>{drawerFare.price === null ? 'Total for all travellers' : 'Estimated total for all travellers'}</small>
            <label><span className="sr-only">Fare to continue with</span><select value={drawerFare.fare.id} disabled={busy} onChange={event => setDrawerFareId(event.target.value)}>
              {fareChoices.filter(choice => choice.compatible).map(choice => <option key={choice.fare.id} value={choice.fare.id}>{choice.name}{choice.price === null ? ' · Price at review' : ` · ${money(choice.price)}`}</option>)}
            </select></label>
          </div>
          <button type="button" className="primary" aria-describedby={termsId} disabled={busy} onClick={() => chooseFare(drawerFare.fare)}>{drawerFareChecking ? 'Checking fare…' : 'Select & continue'}</button>
        </footer>}
      </dialog>}
    </div>}
  </article>;
}
