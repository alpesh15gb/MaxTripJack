import {durationLabel, journeyMinutes, type Flight, type FlightSegment} from '@/lib/booking-presentation';
import {splitFlightItinerary, type AirportCriteria} from '@/lib/flight-airport-scope';
import {connectionLabel} from '@/lib/flight-duration';
import {travelDateLabel, travelTimeLabel} from '@/lib/travel-date';
import AirlineLogo from './airline-logo';
import {StitchSymbol} from './stitch-symbol';

function dateChange(departure: string, arrival: string) {
  const from = Date.parse(`${departure.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${arrival.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return null;
  return to - from === 86_400_000 ? 'Next-day arrival' : 'Arrival on a different date';
}

function FlightReviewLeg({segments, label, confirmedBoundary}: {
  segments: FlightSegment[];
  label?: string;
  confirmedBoundary: boolean;
}) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const dayChange = confirmedBoundary && dateChange(first.dt, last.at);
  const connected = confirmedBoundary && segments.every((segment, index) =>
    index === 0 || (segments[index - 1].aa.code === segment.da.code && segments[index - 1].isRs === segment.isRs));
  const duration = connected ? journeyMinutes({sI:segments, totalPriceList:[]}) : null;
  const stops = connected ? segments.slice(0, -1).map(segment => segment.aa.city && segment.aa.city !== segment.aa.code
    ? `${segment.aa.city} (${segment.aa.code})` : segment.aa.code) : [];
  const stopsLabel = !connected ? null : stops.length === 0 ? 'Non-stop'
    : `${stops.length} stop${stops.length > 1 ? 's' : ''} via ${stops.join(', ')}`;
  return <section className="review-flight-leg">
    <header className="review-flight-route">
      <div>
        {label && <p className="review-leg-label">{label}</p>}
        <h3>{confirmedBoundary ? `${first.da.code} → ${last.aa.code}` : 'Flight segments'}</h3>
        {stopsLabel && <p>{stopsLabel}{duration !== null && ` · ${durationLabel(duration)} total`}</p>}
      </div>
      {dayChange && <span className="review-arrival-note"><StitchSymbol name="schedule" size={16}/>
        <span><strong>{dayChange}</strong><small>Arrives {travelDateLabel(last.at)}</small></span>
      </span>}
    </header>
    <ol className="review-flights" aria-label="Flight segments">
      {segments.map((segment, index) => {
        const next = confirmedBoundary ? segments[index + 1] : undefined;
        return <li key={index}>
          <div className="review-flight-sector">
            <AirlineLogo code={segment.fD.aI.code} name={segment.fD.aI.name}/>
            <div>
              <span className="review-category">{segment.fD.aI.name} · {segment.fD.aI.code} {segment.fD.fN}</span>
              <strong>{segment.da.code} → {segment.aa.code} · {travelTimeLabel(segment.dt)}–{travelTimeLabel(segment.at)}</strong>
              <small>{travelDateLabel(segment.dt)}{segment.at.slice(0, 10) !== segment.dt.slice(0, 10) && ` · Arrives ${travelDateLabel(segment.at)}`}</small>
            </div>
          </div>
          {next && <p className="review-flight-connection"><StitchSymbol name="schedule" size={16}/>{connectionLabel(segment, next)}</p>}
        </li>;
      })}
    </ol>
  </section>;
}

export default function ReviewFlightItinerary({flights, criteria}: {flights: Flight[]; criteria?: AirportCriteria}) {
  const segments = flights.flatMap(flight => flight.sI);
  if (!segments.length) return null;
  const legs = criteria ? splitFlightItinerary(segments, criteria) : null;
  if (!legs) return <FlightReviewLeg segments={segments} confirmedBoundary={false}/>;
  return <div className="review-flight-legs">{legs.map((leg, index) => (
    <FlightReviewLeg key={index} segments={leg} confirmedBoundary label={criteria?.legs
      ? `Flight ${index + 1}` : criteria?.returnDate ? index === 0 ? 'Outbound' : 'Return' : undefined}/>
  ))}</div>;
}
