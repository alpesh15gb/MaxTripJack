import {newCheckoutConfigured} from "@/lib/checkout-availability";
import LiveBooking from "@/components/live-booking";
import {bookingSearchPrefill} from "@/lib/booking-search-state";
export default async function BookPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const prefill=bookingSearchPrefill(await searchParams);return <LiveBooking prefill={prefill} checkoutConfigured={newCheckoutConfigured()}/>;}
