import {durationLabel, journeyMinutes, type Flight, type FlightSegment} from '@/lib/booking-presentation';
import {splitFlightItinerary, type AirportCriteria} from '@/lib/flight-airport-scope';
import {connectionLabel} from '@/lib/flight-duration';
import {travelDateLabel, travelTimeLabel} from '@/lib/travel-date';
import AirlineLogo from './airline-logo';
import {StitchSymbol} from './stitch-symbol';
import {TravelIcon} from './travel-icon';

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
  const stops = connected ? segments.slice(0, -1).map(({aa}) => {
    const city = ['GOI','GOX'].includes(aa.code) && /^goa in$/i.test(aa.city??'') ? 'Goa' : aa.city;
    return city && city !== aa.code ? `${city} (${aa.code})` : aa.code;
  }) : [];
  const stopsLabel = !connected ? null : stops.length === 0 ? 'Non-stop'
    : `${stops.length} stop${stops.length > 1 ? 's' : ''} via ${stops.join(', ')}`;
  const flightNumbers = segments.map(segment => [segment.fD.aI.code,segment.fD.fN].filter(Boolean).join(' ')).filter(Boolean);
  const sectorList = <ol className="review-flights" aria-label="Flight segments">
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
    </ol>;
  return <section className="review-flight-leg">
    {confirmedBoundary ? <>
      <header className="review-flight-face-header">
        <div className="review-flight-airline">
          <AirlineLogo code={first.fD.aI.code} name={first.fD.aI.name}/>
          <div><strong>{first.fD.aI.name || 'Airline'}{new Set(segments.map(segment=>segment.fD.aI.name)).size>1&&' and other airlines'}</strong>
            <small>{flightNumbers.join(' · ')}</small></div>
        </div>
        <span className="review-flight-departure"><TravelIcon name="departure" size={14}/>{label||'Depart'} · {travelDateLabel(first.dt)}</span>
      </header>
      <h3 className="sr-only">{first.da.code} → {last.aa.code}</h3>
      <div className="review-flight-face">
        <div><strong>{travelTimeLabel(first.dt)}</strong><span>{first.da.code}</span>{first.da.city&&<small>{first.da.city}</small>}</div>
        <div className="review-flight-track">
          {duration!==null&&<small>{durationLabel(duration)} total</small>}
          <span aria-hidden="true"></span>
          {stopsLabel&&<small>{stopsLabel}</small>}
        </div>
        <div><strong>{travelTimeLabel(last.at)}</strong><span>{last.aa.code}</span>{last.aa.city&&<small>{last.aa.city}</small>}</div>
      </div>
      {dayChange&&<p className="review-flight-arrival"><StitchSymbol name="schedule" size={16}/>{dayChange} · Arrives {travelDateLabel(last.at)}</p>}
      <details className="review-flight-details">
        <summary>Flight details</summary>
        {sectorList}
      </details>
    </> : <>
      <header className="review-flight-route"><div><h3>Flight segments</h3></div></header>
      {sectorList}
    </>}
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
