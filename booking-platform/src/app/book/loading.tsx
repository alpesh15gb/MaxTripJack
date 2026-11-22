import {TravelHeader, TravelFooter} from '@/components/travel-shell';
import BookingActivity from '@/components/booking-activity';

export default function BookingLoading(){
 return <><TravelHeader/><main id="main-content" className="page-shell stitch-route-loading"><BookingActivity heading title="Opening your search…"/></main><TravelFooter/></>;
}
