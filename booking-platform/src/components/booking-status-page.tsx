"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { accountHref } from "@/lib/account-return";
import { bookingStatusDate, bookingStatusMoney, bookingStatusTitle, bookingStatusView, type BookingStatusDetails } from "@/lib/booking-status";
import { refundStage } from "@/lib/trip-organiser";
import { TravelFooter, TravelHeader, TravelIcon } from "./travel-shell";
import HotelPropertyMedia from "./hotel-property-media";
import BookingConcierge from "./booking-concierge";
import {StitchSymbol} from "./stitch-symbol";

export default function BookingStatusPage({ bookingId }: { bookingId: string }) {
  const router=useRouter();
  const { data: session, isPending, isRefetching, error, refetch } = authClient.useSession();
  const checking = isPending || isRefetching;
  // Guest checkout: a signed-out visitor still sees a booking owned by their
  // current guest session; the details API decides access (401 shows sign-in).
  const guest = !checking && !session && (!error || error.status === 401);
  const ready = !isPending && error?.status !== 401 && error?.status !== 403 && Boolean(session) || guest;
  const paused = checking || Boolean(error) && error?.status !== 401;
  const signedOut = !error && !session || error?.status === 401;
  return <>
    <TravelHeader active="trips" mobileTitle="Booking status" mobileSubtitle="Secure booking status" onMobileBack={()=>router.push('/my-trips')} />
    {(!ready || paused) && <main className="page-shell booking-status-page" id="main-content"><section className="booking-status-card booking-status-access"><p className="eyebrow">YOUR PRIVATE BOOKING</p><h1>Your booking updates are here.</h1>{checking ? <p role="status">Checking secure account access…</p> : signedOut ? <><p>Sign in to check this booking. Signing in does not change its payment or confirmation status.</p><Link className="primary" href={accountHref(`/my-trips/${bookingId}`)}>Sign in to view booking</Link></> : <><p role="alert">We couldn’t verify access to this booking. Your private details are hidden until access is confirmed.</p><button className="primary" onClick={() => void refetch()}>Check account access</button></>}</section></main>}
    {ready && <div hidden={paused} inert={paused}><PrivateBookingStatus key={session?`${bookingId}:${session.user.id}:${session.session.id}:${session.user.emailVerified}:${session.user.phoneNumberVerified}`:`${bookingId}:guest`} bookingId={bookingId} paused={paused} /></div>}
    <TravelFooter compact />
  </>;
}

function PrivateBookingStatus({ bookingId, paused }: { bookingId: string; paused: boolean }) {
  const [booking, setBooking] = useState<BookingStatusDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessStatus, setAccessStatus] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (paused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let accessLost = false;
    async function refresh() {
      if (inFlight || accessLost || controller.signal.aborted || document.hidden) return;
      inFlight = true;
      let poll = true;
      try {
        const response = await fetch(`/api/bookings/${bookingId}/details`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        if (controller.signal.aborted) return;
        if ([401, 403, 404].includes(response.status)) {
          accessLost = true;
          setBooking(null); setAccessStatus(response.status); setCheckedAt(null);
          setError(response.status === 404 ? "This booking is unavailable for this account. Check My trips or contact support if you have a reference." : response.status === 401 ? "Sign in with the email used for this booking to view it. This does not change its payment or booking status." : "Access to this booking is unavailable. Check your account or contact support.");
          return;
        }
        if (!response.ok) throw Error("Status unavailable");
        const data = await response.json() as BookingStatusDetails;
        if (controller.signal.aborted) return;
        if (data.id !== bookingId || typeof data.status !== "string" || typeof data.reference !== "string" || !data.itinerary || !Array.isArray(data.passengers) || !Array.isArray(data.refunds)) throw Error("Invalid status response");
        setBooking(data); setError(""); setAccessStatus(null); setCheckedAt(new Date());
        poll = bookingStatusView(data).poll || data.refunds.some(refund => !["COMPLETED", "FAILED"].includes(refund.status));
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t get the latest update. A connection problem does not mean payment or booking failed. We’ll keep checking; do not pay again.");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (!accessLost && poll) timer = setTimeout(refresh, 5000);
        }
      }
    }
    function onVisibility() { if (!document.hidden) { clearTimeout(timer); void refresh(); } }
    // A cancelled mount should never start an authenticated request.
    queueMicrotask(() => { void refresh(); });
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [bookingId, paused, revision]);

  function retry() { setLoading(true); setRevision(value => value + 1); }
  const view = booking ? bookingStatusView(booking) : null;
  return <main className={`page-shell booking-status-page stitch-voucher${view?.confirmed ? ' voucher-confirmed' : ''}`} id={paused ? undefined : "main-content"}>
    <Link className="booking-status-back" href="/my-trips">← My trips</Link>
    {!booking ? <section className="booking-status-card booking-status-access"><p className="eyebrow">YOUR BOOKING UPDATE</p><h1>{loading ? "Checking your booking…" : accessStatus === 404 ? "We couldn’t find this booking." : "Let’s check your booking."}</h1><p role={error ? "alert" : "status"}>{loading ? "Checking payment and supplier confirmation separately." : error}</p><div className="booking-status-actions">{accessStatus === 401 || accessStatus === 403 ? <Link className="primary" href={accountHref(`/my-trips/${bookingId}`)}>{accessStatus === 401 ? "Sign in to view booking" : "Open account"}</Link> : !loading && accessStatus !== 404 ? <button className="primary" onClick={retry}>Check status again</button> : null}<Link className="secondary" href="/customer-support">Get booking support</Link></div></section> : <>
      {view!.confirmed && <nav className="voucher-trail" aria-label="Completed booking steps"><span><StitchSymbol name="check_circle" size={16}/> {booking.product==='HOTEL'?'Room':'Flight'} selection</span><StitchSymbol name="chevron_right" size={14}/><span><StitchSymbol name="check_circle" size={16}/> Review &amp; details</span><StitchSymbol name="chevron_right" size={14}/><strong>Confirmation</strong></nav>}
      <header className={`booking-status-header is-${view!.tone}`}>
        <span className="booking-status-icon"><StitchSymbol name={view!.confirmed ? "task_alt" : view!.tone === "pending" ? "schedule" : "receipt_long"} size={34}/></span>
        <div>{view!.confirmed && <small className="voucher-status-tag"><StitchSymbol name="verified" size={13}/> Supplier confirmed</small>}<h1 aria-live="polite">{view!.title}</h1><p>{view!.description}</p></div>
        {view!.confirmed && <div className="voucher-header-actions"><button type="button" onClick={()=>window.print()}><StitchSymbol name="print" size={17}/> Print</button>
          <a href={`/api/bookings/${booking.id}/document`}><StitchSymbol name="download" size={17}/> Download voucher (PDF)</a></div>}
      </header>
      <div className="voucher-reference">
        <div><small>Booking reference</small><strong>{booking.reference}</strong></div>
        <button type="button" className="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(booking.reference); setCopied(booking.reference); setCopyError(false); }
          catch { setCopyError(true); }
        }}>{copied === booking.reference ? 'Copied' : 'Copy reference'}</button>
        {copyError && <span role="status">Select the reference above to copy it.</span>}
      </div>
      {view!.confirmed && view!.paymentReceived && <div className="voucher-payment-line"><StitchSymbol name="payments" size={17}/><strong>Paid {bookingStatusMoney(booking.totalMinor,booking.currency)}</strong><span>Payment verified</span></div>}
      {view!.confirmed && <div className="voucher-mobile-actions">
        <a href={`/api/bookings/${booking.id}/document`}><StitchSymbol name="download" size={19}/>PDF voucher</a>
        <a href="#voucher-receipt"><StitchSymbol name="receipt_long" size={19}/>{view!.paymentReceived?'Payment receipt':'Booking total'}</a>
        <Link href="/my-trips"><StitchSymbol name="luggage" size={19}/>My trips</Link></div>}
      {error && <p className="booking-status-notice" role="alert">{error} Your last checked details remain below.</p>}
      <div className="booking-status-layout">
        <div className="booking-status-main">
          {view!.confirmed && <section className="booking-status-card booking-status-confirmation" aria-label="Supplier confirmation">
            <div className={`voucher-property${booking.stay?.property.photos?.length ? ' with-gallery':''}`}>
              <div className="voucher-property-heading"><span className="voucher-confirmed-label"><StitchSymbol name="verified" size={14}/> Confirmed</span>
                {booking.stay?.property.starRating && <span className="voucher-stars" aria-label={`${booking.stay.property.starRating} stars`}>{'★'.repeat(booking.stay.property.starRating)}</span>}
                <h2>{bookingStatusTitle(booking)}</h2>
                {booking.stay?.property.address && <p className="voucher-address"><StitchSymbol name="location_on" size={16}/>{booking.stay.property.address}</p>}</div>
              {Boolean(booking.stay?.property.photos?.length) && <div className="voucher-property-gallery"><HotelPropertyMedia gallery name={bookingStatusTitle(booking)} photos={booking.stay?.property.photos}/></div>}
            </div>
            <ItinerarySummary booking={booking} />
            {booking.stay && <div className="voucher-room">
              {booking.stay.rooms.length > 0 && <div><strong>Room category</strong><p>{booking.stay.rooms.join(' + ')}</p></div>}
              {booking.stay.meal && <div><strong>Meal plan</strong><p>{booking.stay.meal}</p></div>}
              {booking.stay.inclusions.length > 0 && <div><strong>Included in your booking</strong><ul>{booking.stay.inclusions.map(item => <li key={item}><TravelIcon name="check" size={16}/>{item}</li>)}</ul></div>}
            </div>}
            <div className="voucher-doc"><div><small>Supplier reference</small><strong>{booking.supplierBookingId || "Awaiting supplier reference"}</strong></div>
              <a className="primary" href={`/api/bookings/${booking.id}/document`}><TravelIcon name="receipt" size={18} />Download confirmation PDF</a></div>
            {booking.passengers.length > 0 && <section className="voucher-party">
              <h3><TravelIcon name="user" size={19}/>{booking.product === 'HOTEL' ? 'Guest details' : 'Traveller details'}</h3>
              {booking.passengers.map((passenger, index) => <div className="booking-status-passenger" key={index}>
                <span className="voucher-avatar" aria-hidden="true">{passenger.name?.trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0,2).join('') || index + 1}</span>
                <div><h4>{passenger.name || `${booking.product === "HOTEL" ? "Guest" : "Traveller"} ${index + 1}`}</h4>{booking.product === "HOTEL" ?
                  <p>{Number.isInteger(passenger.roomIndex) && passenger.roomIndex! >= 0 && passenger.roomIndex! < (booking.itinerary.rooms?.length ?? 0) ? `Room ${passenger.roomIndex! + 1} · ` : ""}Guest on this stay</p> :
                  <><p>PNR: <strong>{passenger.pnrs.join(", ") || "Awaiting supplier reference"}</strong></p><p>Ticket: <strong>{passenger.tickets.join(", ") || "Awaiting supplier reference"}</strong></p></>}</div>
              </div>)}</section>}
          </section>}
          {view!.confirmed && booking.product==='HOTEL' && <section className="booking-status-card voucher-guidelines">
            <h2>Important stay guidelines</h2>
            <div><StitchSymbol name="badge" size={18}/><p><strong>Check-in &amp; identification</strong>Have your voucher and the identification requested by the property ready at check-in.</p></div>
            {booking.stay?.bookingNotes && <div><StitchSymbol name="info" size={18}/><p><strong>Property instructions</strong>{booking.stay.bookingNotes}</p></div>}
            <div><StitchSymbol name="calendar_month" size={18}/><p><strong>Changes &amp; cancellation</strong><Link href="/my-trips">Open My trips</Link> to check the options for your reservation.</p></div>
            {booking.stay?.property.address && <div><StitchSymbol name="location_on" size={18}/><p><strong>Property directions</strong>{booking.stay.property.address}<br/><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bookingStatusTitle(booking)+' '+booking.stay.property.address)}`} target="_blank" rel="noopener noreferrer">Open in Maps</a></p></div>}
          </section>}
          <section className="booking-status-card" aria-label="Payment and confirmation progress">
            <h2>Your booking progress</h2>
            <ol className="booking-status-steps">
              <li className={view!.paymentReceived || !view!.paymentRequired ? "is-complete" : "is-current"}><span className="booking-status-step-icon"><TravelIcon name={view!.paymentReceived || !view!.paymentRequired ? "check" : "clock"} size={19} /></span><div><h3>{!view!.paymentRequired ? "No payment required" : view!.paymentReceived ? "Payment received" : "Payment being checked"}</h3><p>{!view!.paymentRequired ? "There is no payment due for this record." : view!.paymentReceived ? "The payment provider has verified receipt." : booking.paymentStatus === "AUTHORIZED" ? "Payment is authorised; receipt is not yet confirmed." : booking.paymentStatus === "FAILED" ? "A failed payment is recorded. Contact support before trying again." : "A successful checkout screen alone does not confirm payment."}</p></div></li>
              <li className={view!.confirmed ? "is-complete" : view!.supplierStarted || booking.status === "PAID" ? "is-current" : "is-waiting"}><span className="booking-status-step-icon"><TravelIcon name={view!.confirmed ? "check" : "clock"} size={19} /></span><div><h3>{view!.confirmed ? "Supplier confirmed" : booking.status === "BOOKING_FAILED" ? "Booking not confirmed" : booking.status === "CANCELLED" ? "Supplier cancellation confirmed" : booking.status === "MANUAL_REVIEW" ? "Supplier outcome needs checking" : "Supplier confirmation"}</h3><p>{view!.confirmed ? "The supplier has confirmed the selected travel." : booking.status === "CANCELLED" ? "This booking is no longer active." : "Your payment status and supplier confirmation are tracked separately."}</p></div></li>
              <li className={view!.confirmed ? "is-complete" : "is-waiting"}><span className="booking-status-step-icon"><TravelIcon name={view!.confirmed ? "check" : "receipt"} size={19} /></span><div><h3>{booking.product === "HOTEL" ? "Stay confirmation" : booking.serviceKind === "ANCILLARY" ? "Extras confirmation" : "Flight ticket"}</h3><p>{view!.confirmed ? "Your confirmation details and document are available below." : "Available after supplier confirmation."}</p></div></li>
            </ol>
            <div className="booking-status-refresh"><span>{checkedAt ? `Last checked ${checkedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Checking status"}{view!.poll ? " · Updates automatically" : ""}</span><button className="secondary" disabled={loading} onClick={retry}><TravelIcon name="refresh" size={16} />{loading ? "Checking…" : "Refresh status"}</button></div>
          </section>
          {booking.refunds.length > 0 && <section className="booking-status-card booking-status-refunds" aria-label="Refund updates"><h2>Your refund updates</h2>{booking.refunds.map(refund => <div key={refund.id}><h3>{refundStage(refund.status).label}</h3><strong>{bookingStatusMoney(refund.amountMinor, booking.currency)}</strong><p>{refundStage(refund.status).description}</p></div>)}<p>Refunds are tracked separately from booking and cancellation.</p></section>}
        </div>
        <aside id="voucher-receipt" className="booking-status-card booking-status-summary" aria-label="Your booking summary">
          {view!.paymentReceived && <span className="voucher-paid"><StitchSymbol name="verified_user" size={14}/> Payment received</span>}
          <h2>{view!.confirmed && view!.paymentReceived ? 'Payment receipt' : 'Booking summary'}</h2>
          <p className="voucher-summary-title">{bookingStatusTitle(booking)}</p><ItinerarySummary booking={booking} />
          <dl><div><dt>Booking reference</dt><dd>{booking.reference}</dd></div>
            <div className="voucher-receipt-total"><dt>{view!.paymentReceived ? 'Payment received' : 'Booking total'}</dt><dd>{bookingStatusMoney(booking.totalMinor, booking.currency)}</dd></div></dl>
          <BookingConcierge/>
          <div className="booking-status-actions"><Link className="primary" href="/my-trips">View all my trips</Link><Link className="secondary" href="/customer-support">Get booking support</Link></div>
        </aside>
      </div>
    </>}
  </main>;
}

function ItinerarySummary({ booking }: { booking: BookingStatusDetails }) {
  const trip = booking.itinerary;
  if (booking.product === "HOTEL") {
    const guests = trip.rooms?.reduce((total, room) => total + room.adults + (room.children ?? room.childAge?.length ?? 0), 0);
    return <div className="booking-status-itinerary"><p><strong>Check-in</strong> {bookingStatusDate(trip.checkIn)}</p><p><strong>Check-out</strong> {bookingStatusDate(trip.checkOut)}</p>{trip.rooms?.length ? <p>{trip.rooms.length} room{trip.rooms.length === 1 ? "" : "s"}{guests ? ` · ${guests} guest${guests === 1 ? "" : "s"}` : ""}</p> : null}</div>;
  }
  const guests = (trip.adults ?? 0) + (trip.children ?? 0) + (trip.infants ?? 0);
  return <div className="booking-status-itinerary">{trip.legs?.length ? trip.legs.map((leg, index) => <p key={index}><strong>{leg.from} → {leg.to}</strong> {bookingStatusDate(leg.date)}</p>) : <><p><strong>Departure</strong> {bookingStatusDate(trip.date)}</p>{trip.returnDate && <p><strong>Return</strong> {bookingStatusDate(trip.returnDate)}</p>}</>}{guests > 0 && <p>{guests} traveller{guests === 1 ? "" : "s"}</p>}</div>;
}
