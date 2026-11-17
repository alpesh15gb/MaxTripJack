import { searchLegs } from '@/lib/booking-search-state';
import { travelDateLabel } from '@/lib/travel-date';
import type { HotelStayContext } from '@/lib/hotel-results';

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** Only committed criteria belong in the results header. Draft edits stay in the form. */
export default function BookingSearchSummary({ criteria, stay }: {
  criteria: Record<string, string>;
  stay: HotelStayContext | null;
}) {
  const isStay = criteria.product === 'HOTEL';
  const legs = isStay ? undefined : searchLegs(criteria.legs);
  const route = legs?.map(leg => `${leg.from} → ${leg.to}`).join(' · ') ?? `${criteria.from} → ${criteria.to}`;
  const start = stay?.checkIn || criteria.date;
  const end = isStay ? stay?.checkOut || criteria.end : criteria.returnDate;
  const guests = Number(criteria.adults || 1) + Number(criteria.children || 0) + Number(criteria.infants || 0);
  const party = isStay && stay
    ? `${countLabel(stay.rooms, 'room')} · ${countLabel(stay.guests, 'guest')}`
    : countLabel(guests, isStay ? 'guest' : 'traveller');
  const cabin = (criteria.cabin || 'ECONOMY').replaceAll('_', ' ');

  return <>
    <span className="booking-criteria-field booking-criteria-destination">
      <small>{isStay ? 'Destination' : legs ? 'Multi-city' : end ? 'Round trip' : 'One way'}</small>
      <strong>{isStay ? criteria.city || 'Selected destination' : route}</strong>
    </span>
    <span className="booking-criteria-field booking-criteria-dates">
      <small>{isStay ? 'Check-in & check-out' : 'Travel dates'}</small>
      <strong>{travelDateLabel(start)}{end && ` – ${travelDateLabel(end)}`}</strong>
    </span>
    <span className="booking-criteria-field booking-criteria-party">
      <small>{isStay ? 'Rooms & guests' : 'Travellers & cabin'}</small>
      <strong>{party}{!isStay && ` · ${cabin}`}</strong>
    </span>
    <small className="search-edit-label"><span className="booking-criteria-edit">Modify search</span><span className="booking-criteria-close">Close search</span></small>
  </>;
}
