import Link from 'next/link';
import {TravelIcon} from './travel-icon';

export default function FlightTripIdeas({destination}: {destination: string}) {
  const hotels = `/book?${new URLSearchParams({product:'HOTEL', city:destination})}`;
  const activities = `/contact?${new URLSearchParams({topic:'activity', destination})}#office-enquiry`;

  return <section className="flight-trip-ideas" aria-labelledby="flight-trip-ideas-title">
    <h2 id="flight-trip-ideas-title">Complete your trip to {destination}</h2>
    <div className="flight-trip-ideas-links">
      <Link href={hotels} prefetch={false}><TravelIcon name="hotel" size={19}/>Find hotels<TravelIcon name="chevron" size={16}/></Link>
      <Link href={activities} prefetch={false}><TravelIcon name="pin" size={19}/>Ask about things to do<TravelIcon name="chevron" size={16}/></Link>
    </div>
  </section>;
}
