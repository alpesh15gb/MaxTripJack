'use client';
import {useCompanyProfile} from './company-profile-context';
import {TravelIcon} from './travel-icon';

export default function BookingConcierge() {
  const company = useCompanyProfile();
  return <section className="booking-concierge" aria-label="Booking assistance">
    <span className="concierge-symbol"><TravelIcon name="user" size={21}/></span>
    <div><h3>{company.address.addressLocality} concierge desk</h3><p>Questions about your booking? Speak with {company.name}.</p></div>
    <a href={company.phoneHref}>Call desk</a>
  </section>;
}
