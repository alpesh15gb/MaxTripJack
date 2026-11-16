"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { accountHref } from "@/lib/account-return";
import { bookingStatusDate, bookingStatusMoney, bookingStatusTitle, bookingStatusView, type BookingStatusDetails } from "@/lib/booking-status";
import { refundStage } from "@/lib/trip-organiser";
import { TravelFooter, TravelHeader, TravelIcon } from "./travel-shell";

export default function BookingStatusPage({ bookingId }: { bookingId: string }) {
  const { data: session, isPending, isRefetching, error, refetch } = authClient.useSession();
  const checking = isPending || isRefetching;
  const ready = !isPending && error?.status !== 401 && error?.status !== 403 && Boolean(session);
  const paused = checking || Boolean(error);
  const signedOut = !error && !session || error?.status === 401;
  return <>
    <TravelHeader active="trips" />
    {(!ready || paused) && <main className="page-shell booking-status-page" id="main-content"><section className="booking-status-card booking-status-access"><p className="eyebrow">YOUR PRIVATE BOOKING</p><h1>Your booking updates are here.</h1>{checking ? <p role="status">Checking secure account access…</p> : signedOut ? <><p>Sign in to check this booking. Signing in does not change its payment or confirmation status.</p><Link className="primary" href={accountHref(`/my-trips/${bookingId}`)}>Sign in to view booking</Link></> : <><p role="alert">We couldn’t verify access to this booking. Your private details are hidden until access is confirmed.</p><button className="primary" onClick={() => void refetch()}>Check account access</button></>}</section></main>}
    {ready && <div hidden={paused} inert={paused}><PrivateBookingStatus key={`${bookingId}:${session!.user.id}:${session!.session.id}:${session!.user.emailVerified}:${session!.user.phoneNumberVerified}`} bookingId={bookingId} paused={paused} /></div>}
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
          setError(response.status === 404 ? "This booking is unavailable for this account. Check My trips or contact support if you have a reference." : response.status === 401 ? "Sign in again to view this booking. This does not change its payment or booking status." : "Access to this booking is unavailable. Check your account or contact support.");
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
    void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [bookingId, paused, revision]);

  function retry() { setLoading(true); setRevision(value => value + 1); }
  const view = booking ? bookingStatusView(booking) : null;
  return <main className="page-shell booking-status-page" id={paused ? undefined : "main-content"}>
    <Link className="booking-status-back" href="/my-trips">← My trips</Link>
    {!booking ? <section className="booking-status-card booking-status-access"><p className="eyebrow">YOUR BOOKING UPDATE</p><h1>{loading ? "Checking your booking…" : accessStatus === 404 ? "We couldn’t find this booking." : "Let’s check your booking."}</h1><p role={error ? "alert" : "status"}>{loading ? "Checking payment and supplier confirmation separately." : error}</p><div className="booking-status-actions">{accessStatus === 401 || accessStatus === 403 ? <Link className="primary" href={accountHref(`/my-trips/${bookingId}`)}>Open account</Link> : !loading && accessStatus !== 404 ? <button className="primary" onClick={retry}>Check status again</button> : null}<Link className="secondary" href="/customer-support">Get booking support</Link></div></section> : <>
      <header className={`booking-status-header is-${view!.tone}`}>
        <span className="booking-status-icon"><TravelIcon name={view!.confirmed ? "check" : view!.tone === "pending" ? "clock" : "receipt"} size={30} /></span>
        <div><p className="eyebrow">BOOKING {booking.reference}</p><h1 aria-live="polite">{view!.title}</h1><p>{view!.description}</p></div>
      </header>
      {error && <p className="booking-status-notice" role="alert">{error} Your last checked details remain below.</p>}
      <div className="booking-status-layout">
        <div className="booking-status-main">
          <section className="booking-status-card" aria-label="Payment and confirmation progress">
            <h2>Your booking progress</h2>
            <ol className="booking-status-steps">
              <li className={view!.paymentReceived || !view!.paymentRequired ? "is-complete" : "is-current"}><span className="booking-status-step-icon"><TravelIcon name={view!.paymentReceived || !view!.paymentRequired ? "check" : "clock"} size={19} /></span><div><h3>{!view!.paymentRequired ? "No payment required" : view!.paymentReceived ? "Payment received" : "Payment being checked"}</h3><p>{!view!.paymentRequired ? "There is no payment due for this record." : view!.paymentReceived ? "The payment provider has verified receipt." : booking.paymentStatus === "AUTHORIZED" ? "Payment is authorised; receipt is not yet confirmed." : booking.paymentStatus === "FAILED" ? "A failed payment is recorded. Contact support before trying again." : "A successful checkout screen alone does not confirm payment."}</p></div></li>
              <li className={view!.confirmed ? "is-complete" : view!.supplierStarted || booking.status === "PAID" ? "is-current" : "is-waiting"}><span className="booking-status-step-icon"><TravelIcon name={view!.confirmed ? "check" : "clock"} size={19} /></span><div><h3>{view!.confirmed ? "Supplier confirmed" : booking.status === "BOOKING_FAILED" ? "Booking not confirmed" : booking.status === "CANCELLED" ? "Supplier cancellation confirmed" : booking.status === "MANUAL_REVIEW" ? "Supplier outcome needs checking" : "Supplier confirmation"}</h3><p>{view!.confirmed ? "The supplier has confirmed the selected travel." : booking.status === "CANCELLED" ? "This booking is no longer active." : "Your payment status and supplier confirmation are tracked separately."}</p></div></li>
              <li className={view!.confirmed ? "is-complete" : "is-waiting"}><span className="booking-status-step-icon"><TravelIcon name={view!.confirmed ? "check" : "receipt"} size={19} /></span><div><h3>{booking.product === "HOTEL" ? "Stay confirmation" : booking.serviceKind === "ANCILLARY" ? "Extras confirmation" : "Flight ticket"}</h3><p>{view!.confirmed ? "Your confirmation details and document are available below." : "Available after supplier confirmation."}</p></div></li>
            </ol>
            <div className="booking-status-refresh"><span>{checkedAt ? `Last checked ${checkedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Checking status"}{view!.poll ? " · Updates automatically" : ""}</span><button className="secondary" disabled={loading} onClick={retry}><TravelIcon name="refresh" size={16} />{loading ? "Checking…" : "Refresh status"}</button></div>
          </section>
          {view!.confirmed && <section className="booking-status-card booking-status-confirmation" aria-label="Supplier confirmation"><h2>{booking.product === "HOTEL" ? "Your stay confirmation" : "Your travel confirmation"}</h2><dl><div><dt>Supplier reference</dt><dd>{booking.supplierBookingId || "Awaiting supplier reference"}</dd></div></dl>{booking.product === "HOTEL" && <ItinerarySummary booking={booking} />}{booking.passengers.map((passenger, index) => <div className="booking-status-passenger" key={index}><h3>{passenger.name || `${booking.product === "HOTEL" ? "Guest" : "Traveller"} ${index + 1}`}</h3>{booking.product === "HOTEL" ? <p>Guest on this stay</p> : <><p>PNR: <strong>{passenger.pnrs.join(", ") || "Awaiting supplier reference"}</strong></p><p>Ticket: <strong>{passenger.tickets.join(", ") || "Awaiting supplier reference"}</strong></p></>}</div>)}<a className="primary" href={`/api/bookings/${booking.id}/document`}><TravelIcon name="receipt" size={18} />Download confirmation PDF</a></section>}
          {booking.refunds.length > 0 && <section className="booking-status-card booking-status-refunds" aria-label="Refund updates"><h2>Your refund updates</h2>{booking.refunds.map(refund => <div key={refund.id}><h3>{refundStage(refund.status).label}</h3><strong>{bookingStatusMoney(refund.amountMinor, booking.currency)}</strong><p>{refundStage(refund.status).description}</p></div>)}<p>Refunds are tracked separately from booking and cancellation.</p></section>}
        </div>
        <aside className="booking-status-card booking-status-summary" aria-label="Your booking summary"><p className="eyebrow">YOUR {booking.product === "HOTEL" ? "STAY" : "JOURNEY"}</p><h2>{bookingStatusTitle(booking)}</h2><ItinerarySummary booking={booking} /><dl><div><dt>Booking reference</dt><dd>{booking.reference}</dd></div><div><dt>Booking total</dt><dd>{bookingStatusMoney(booking.totalMinor, booking.currency)}</dd></div></dl><p className="booking-status-summary-note">Keep your reference handy when contacting support.</p><div className="booking-status-actions"><Link className="primary" href="/my-trips">View all my trips</Link><Link className="secondary" href="/customer-support">Get booking support</Link></div></aside>
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
