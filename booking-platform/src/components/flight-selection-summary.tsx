import { durationLabel, flightStops, groupLabel, journeyMinutes } from '@/lib/booking-presentation';
import { displayMoney } from '@/lib/display-money';
import { comparableFareEstimate } from '@/lib/fare-display';
import { segmentDurationLabel } from '@/lib/flight-duration';
import { arrivalDayLabel } from '@/lib/flight-results';
import { airportDecisionLabel as selectionAirportLabel } from '@/lib/flight-decision';
import { selectedJourneyEstimate, type FlightSelectionGroup } from '@/lib/flight-selection-summary';
import { travelDateTimeLabel, travelTimeLabel } from '@/lib/travel-date';

export type FlightSelectionSummaryProps = {
  groups: FlightSelectionGroup[];
  activeGroup: string;
  busy: boolean;
  checking: boolean;
  onChange: (group: string) => void;
  onReview: () => void;
  allSelected: boolean;
};

/** Interactive callbacks are supplied by the existing client booking workspace.
 * This view never starts a search/review except through the explicit button. */
export default function FlightSelectionSummary({ groups, activeGroup, busy, checking, onChange, onReview, allSelected }: FlightSelectionSummaryProps) {
  const total = allSelected ? selectedJourneyEstimate(groups) : null;
  const selectedCount = groups.filter(item => item.flight && item.fare).length;
  return <section className="journey-leg-context flight-selection-summary" aria-label="Selected flight context">
    <h3>Your selected journey</h3>
    <ol>{groups.map(({ group, flight, fare }) => {
      const first = flight?.sI[0], last = flight?.sI.at(-1);
      const selected = Boolean(flight && fare);
      const price = fare ? comparableFareEstimate(fare, 'INR') : null;
      const stops = flight ? flightStops(flight, group) : null;
      const dayChange = first && last ? arrivalDayLabel(first.dt, last.at) : null;
      return <li key={group} className={activeGroup === group ? 'is-current' : ''}>
        <span className="selection-leg-label">{groupLabel(group)}</span>
        {selected && flight && fare ? <>
          {group === 'COMBO' ? <div className="selection-combo-segments"><strong>Complete itinerary · every flight</strong>{flight.sI.map((segment, index) => <div className="selection-segment" key={`${index}-${segment.fD.fN}`}>
            <strong>{segment.da.code} → {segment.aa.code}</strong><small className="selection-airports">{selectionAirportLabel(segment.da)} → {selectionAirportLabel(segment.aa)}</small>
            <p>Departs {travelDateTimeLabel(segment.dt)}<br />Arrives {travelDateTimeLabel(segment.at)}</p>
            <small>{segment.fD.aI.name} · {segment.fD.fN} · Segment duration: {segmentDurationLabel(segment.duration)}</small>
            {arrivalDayLabel(segment.dt, segment.at) && <small className="flight-day-change">{arrivalDayLabel(segment.dt, segment.at)}</small>}
          </div>)}<p>Total itinerary duration not supplied. These flights may be separate journeys, not connections.</p></div> : <>
            <strong>{first?.da.code||"Airport not supplied"} → {last?.aa.code||"Airport not supplied"} · {travelTimeLabel(first?.dt)}</strong><small className="selection-airports">{selectionAirportLabel(first?.da)} → {selectionAirportLabel(last?.aa)}</small>
            <p className="selection-leg-dates">Departs {travelDateTimeLabel(first?.dt)}<br />Arrives {travelDateTimeLabel(last?.at)}</p>
            {dayChange && <span className="flight-day-change">{dayChange}</span>}
            <small className="selection-leg-duration">{durationLabel(journeyMinutes(flight, group))} · {stops === null ? 'Stop details unavailable' : stops === 0 ? 'Non-stop' : `${stops} stop${stops === 1 ? '' : 's'}`}</small>
          </>}
          <small className="selection-leg-fare">{fare.fareIdentifier.replaceAll('_', ' ')} · {price === null ? 'Price at review' : `${displayMoney(price)} estimated`} · all travellers</small>
          <button type="button" className="secondary" disabled={busy} onClick={() => onChange(group)}>Change {groupLabel(group).toLowerCase()}</button>
        </> : <strong>{activeGroup === group ? 'Choose this flight next' : 'Not selected yet'}</strong>}
      </li>;
    })}</ol>
    <div className="selection-combined-total"><span>Complete journey · all travellers</span><strong>{total === null ? 'Complete total checked at review' : `${displayMoney(total)} estimated total`}</strong><p>All dates and times are local to each airport. Search estimates are not a quote; price and availability are checked when you continue.</p></div>
    {checking && <p role="status">Checking the current fare and conditions for your selected journey… Nothing is reserved yet.</p>}
    {allSelected && <button id="review-selected-journey" type="button" className="primary" disabled={busy} onClick={onReview}>Review selected journey ({selectedCount}/{groups.length})</button>}
  </section>;
}
