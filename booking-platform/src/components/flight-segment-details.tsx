import { useState } from 'react';
import type { FlightSegment } from '@/lib/booking-presentation';
import { airportDecisionLabel } from '@/lib/flight-decision';
import { connectionLabel, segmentDurationLabel } from '@/lib/flight-duration';
import { travelDateLabel, travelTimeLabel } from '@/lib/travel-date';

function FlightStop({ label, timestamp, airport }: {
  label: 'Departure' | 'Arrival';
  timestamp: string;
  airport: FlightSegment['da'];
}) {
  return <div className="flight-stop">
    <div className="flight-stop-time">
      <strong>{travelTimeLabel(timestamp)}</strong>
      <small>{travelDateLabel(timestamp)}</small>
    </div>
    <div className="flight-stop-place">
      <small>{label}</small>
      <span>{airportDecisionLabel(airport)}</span>
    </div>
  </div>;
}

export default function FlightSegmentDetails({ segments, group }: { segments: FlightSegment[]; group: string }) {
  const [open, setOpen] = useState(false);
  return <details className="flight-segment-details" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Flight details</summary>
    {open && <div className="flight-segments-content">
      <ol className="flight-segments-list" aria-label="Flight itinerary">
        {segments.map((segment, index) => <li key={index}>
          <div className="flight-segment">
            <div className="flight-segment-header">
              <strong>{[segment.fD.aI.name, [segment.fD.aI.code, segment.fD.fN].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Flight'}</strong>
              <span>Segment duration: {segmentDurationLabel(segment.duration)}</span>
            </div>
            <FlightStop label="Departure" timestamp={segment.dt} airport={segment.da} />
            <FlightStop label="Arrival" timestamp={segment.at} airport={segment.aa} />
          </div>
          {index < segments.length - 1 && <div className="flight-segment-transfer">
            {connectionLabel(segment, segments[index + 1], group)}
          </div>}
        </li>)}
      </ol>
      <small className="flight-local-time-note">All times are local to each airport.</small>
    </div>}
  </details>;
}
