import Link from 'next/link';
import {TravelHeader} from '@/components/travel-shell';

export default function BookingLoading(){
 return <><TravelHeader/><main id="main-content" className="page-shell booking-route-loading"><Link href="/" className="back">← Back to explore</Link><section role="status" aria-live="polite"><h1>Opening your search…</h1><p>Your search workspace is loading. Live prices and availability have not been received yet.</p></section></main></>;
}
