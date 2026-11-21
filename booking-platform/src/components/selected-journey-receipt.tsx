import type { ReactNode } from 'react';
import type { Flight } from '@/lib/booking-presentation';
import type { HotelPropertyDetails } from '@/lib/hotel-presentation';
import { travelDateLabel, travelTimeLabel } from '@/lib/travel-date';
import { displayMoney } from '@/lib/display-money';
import HotelPropertyMedia from './hotel-property-media';
import AirlineLogo from './airline-logo';
import { TravelIcon } from './travel-icon';
import { StitchSymbol } from './stitch-symbol';
import { stayNights } from '@/lib/hotel-results';

type SelectedStay = {
  name: string;
  room: string;
  meal: string;
  cancellation: string;
  guests: number; rooms: number; inclusions: string[]; bookingNotes?: string;
  property?: HotelPropertyDetails;
  checkIn?: string;
  checkOut?: string;
};

export default function SelectedJourneyReceipt({ flights, fallbackFlight, totalMinor, hotel, context, children }: {
  flights: Flight[]; fallbackFlight?: { title: string; date?: string }; totalMinor: number; hotel?: SelectedStay; context: ReactNode; children: ReactNode;
}) {
  const nights = hotel?.checkIn && hotel.checkOut ? stayNights({checkIn:hotel.checkIn,checkOut:hotel.checkOut,guests:hotel.guests,rooms:hotel.rooms}) : null;
  return <section className="selected-itinerary compact-selected-itinerary stitch-itinerary" aria-label="Selected itinerary">
    {!hotel && context}
    <div className="selected-journey-recap">
      {!hotel && !flights.some(flight=>flight.sI.length) && fallbackFlight && <div className="receipt-fallback-flight"><StitchSymbol name="flight" size={24}/><div><strong>{fallbackFlight.title}</strong><p>{travelDateLabel(fallbackFlight.date)}</p></div></div>}
      {hotel ? <div className="review-stay">
        <div className="review-stay-heading">
          {hotel.property?.photos?.length ? <HotelPropertyMedia name={hotel.name} photos={hotel.property.photos} /> :
            <span className="review-stay-symbol"><TravelIcon name="hotel" size={28} /></span>}
          <div className="review-stay-copy">{context}
            {hotel.property?.starRating && <span className="review-category">{hotel.property.starRating}-star hotel</span>}
            <h3>{hotel.name}</h3>{(hotel.property?.address || hotel.property?.city) && <p><TravelIcon name="pin" size={15} /> {hotel.property.address || hotel.property.city}</p>}
          </div>
        </div>
        {hotel.checkIn && hotel.checkOut && <dl className="review-dates"><div className="review-date-range"><dt>Dates</dt><dd>{travelDateLabel(hotel.checkIn).replace(/ \d{4}$/,'')} – {travelDateLabel(hotel.checkOut).replace(/ \d{4}$/,'')}</dd>{nights && <small>{nights} night{nights===1?'':'s'}</small>}</div><div className="review-date-separate"><dt>Check-in</dt><dd>{travelDateLabel(hotel.checkIn)}</dd></div><div className="review-date-separate"><dt>Check-out</dt><dd>{travelDateLabel(hotel.checkOut)}</dd>{nights && <small>{nights} night{nights===1?'':'s'}</small>}</div>
          <div className="review-room-count"><dt>Guests &amp; rooms</dt><dd>{hotel.guests} guest{hotel.guests===1?'':'s'} · {hotel.rooms} room{hotel.rooms===1?'':'s'}</dd></div></dl>}
        <div className="review-room"><h4><TravelIcon name="bed" /> {hotel.room}</h4>
          <p><TravelIcon name="receipt" size={15} /> {hotel.meal.charAt(0).toUpperCase()+hotel.meal.slice(1).toLowerCase()}</p>{hotel.inclusions.slice(0,3).filter(item=>item.toLowerCase()!==hotel.meal.toLowerCase()).map(item=><p key={item}><TravelIcon name="check" size={15}/> {item}</p>)}<p><TravelIcon name="clock" size={15} /> {hotel.cancellation}</p>
        </div>
      </div> : <ul className="review-flights">{flights.flatMap((flight, index) => flight.sI.map((segment, part) =>
        <li key={`${index}-${part}`}>
          <AirlineLogo code={segment.fD.aI.code} name={segment.fD.aI.name} />
          <div><span className="review-category">{segment.fD.aI.name} · {segment.fD.aI.code} {segment.fD.fN}</span>
            <strong>{segment.da.code} → {segment.aa.code} · {travelTimeLabel(segment.dt)}–{travelTimeLabel(segment.at)}</strong>
            <small>{travelDateLabel(segment.dt)}{segment.at.slice(0,10) !== segment.dt.slice(0,10) ? ` → ${travelDateLabel(segment.at)}` : ''}</small>
          </div>
        </li>))}</ul>}
      {!hotel && <div className="selected-reviewed-total"><span>Reviewed total</span><strong>{displayMoney(totalMinor)}</strong><small>All travellers</small></div>}
    </div>
    {(!hotel || hotel.inclusions.length>3 || hotel.bookingNotes) && <details className="selected-source-details"><summary>{hotel ? 'Room details & inclusions' : 'Original search details & fare'}</summary>{children}</details>}
  </section>;
}
