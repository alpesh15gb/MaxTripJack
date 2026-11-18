import Link from 'next/link';
import { TravelFooter, TravelHeader } from '@/components/travel-shell';
import '@/components/hotel-catalogue.css';
import '@/components/public-refresh.css';

export default function HotelNotFound() {
  return <div><TravelHeader active="hotels" hotelHref="/hotels" /><main id="main-content" className="catalogue-main public-refresh"><section className="catalogue-empty"><h1>We couldn’t find this hotel page</h1><p>The property may no longer be listed, or the link may be incomplete. Explore the hotel directory to find another stay.</p><Link className="catalogue-button" href="/hotels">Browse hotels</Link></section></main><TravelFooter /></div>;
}
