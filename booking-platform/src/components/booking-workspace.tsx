"use client";
import { displayMoney } from "@/lib/display-money";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import "@/app/trips-experience.css";
import { WorkspaceNavigation } from "./account-experience-shell";
import { useCompanyProfile } from "./company-profile-context";
import "@/app/stitch-trips.css";
import { authClient } from "@/lib/auth-client";
import { accountHref } from "@/lib/account-return";
import { isBookingConfirmed } from "@/lib/booking-status";
import { refundStage, sortTrips, tripGroup, tripGroups } from "@/lib/trip-organiser";
import HotelPropertyMedia from "./hotel-property-media";
import type { HotelPropertyDetails } from "@/lib/hotel-presentation";
import BookingLookup from "./booking-lookup";
import FlightServices from "./flight-services";
import CancellationRequest from "./cancellation-request";
import CancellationProgress from "./cancellation-progress";
import { TravelFooter, TravelHeader, TravelIcon } from "./travel-shell";
import { StitchSymbol } from "./stitch-symbol";

type Itinerary = {
  from?: string; to?: string; date?: string; returnDate?: string;
  legs?: { from: string; to: string; date: string }[];
  checkIn?: string; checkOut?: string; hotelName?: string; city?: string;
  adults?: number; children?: number; infants?: number;
  rooms?: { adults: number; children?: number; childAge?: number[] }[];
};
type Booking = {
  linked_services?: { reference: string; kind: string; status: string }[];
  service_kind?: string | null; parent_order_id?: string | null;
  id: string; reference: string; product: string; status: string;
  currency: string; total_minor: string; created_at: string;
  itinerary_summary?: Itinerary | null;
  hotelPhotos?: HotelPropertyDetails["photos"];
  hotelStay?: {name?: string; rooms: string[]; meal?: string; inclusions: string[]};
  refunds?: { id: string; amountMinor: string; status: string }[];
};
type Confirmation = { supplierBookingId?: string; hotelName?: string; passengers?: { name: string; pnrs: string[]; tickets: string[]; roomIndex?: number }[] };
type StatusInfo = { label: string; tone: "confirmed" | "pending" | "attention" | "neutral"; description: string };
const pendingStatuses = ["PAID", "BOOKING_PENDING", "PAYMENT_PENDING"];
const manageableStatuses = ["CONFIRMED", "TICKETED"];
const attentionStatuses = ["BOOKING_FAILED", "MANUAL_REVIEW"];
const statusLabels: Record<string, StatusInfo> = {
  DRAFT: { label: "Not booked", tone: "neutral", description: "This booking has not reached payment or supplier confirmation." },
  QUOTED: { label: "Price reviewed", tone: "neutral", description: "Travel is not confirmed. Availability and pricing must be reviewed before payment." },
  PAYMENT_PENDING: { label: "Payment being checked", tone: "pending", description: "We’re checking the payment status. Do not pay again or create a duplicate booking while this is pending." },
  PAID: { label: "Awaiting supplier", tone: "pending", description: "Payment received. Your trip is not yet confirmed; we’re waiting for the supplier." },
  BOOKING_PENDING: { label: "Confirmation in progress", tone: "pending", description: "Your booking is with the supplier. Wait for confirmation before making another booking." },
  CONFIRMED: { label: "Confirmed", tone: "confirmed", description: "The supplier has confirmed this booking. Open the details for your confirmation reference." },
  TICKETED: { label: "Ticketed", tone: "confirmed", description: "Your flight ticket has been confirmed. Check your ticket and travel details before departure." },
  BOOKING_FAILED: { label: "Booking unsuccessful", tone: "attention", description: "The supplier did not confirm this booking. Any payment or refund needs a separate status check." },
  MANUAL_REVIEW: { label: "Needs a status check", tone: "attention", description: "This booking needs a team review. Confirmation is not established; do not pay again while it is being checked." },
  CANCELLED: { label: "Cancelled", tone: "neutral", description: "The supplier has confirmed cancellation. A refund, if applicable, is tracked separately below." },
  CLOSED: { label: "Closed", tone: "neutral", description: "This booking record is closed. Refer to its documents and status history for details." },
};

function isWaitingForTicket(booking: Pick<Booking, "product" | "status" | "service_kind">) {
  return booking.product === "FLIGHT" && booking.status === "CONFIRMED" && booking.service_kind !== "ANCILLARY";
}
function isConfirmed(booking: Pick<Booking, "product" | "status" | "service_kind">) {
  return isBookingConfirmed(booking.product, booking.status, booking.service_kind);
}
function isPendingBooking(booking: Pick<Booking, "product" | "status" | "service_kind">) {
  return pendingStatuses.includes(booking.status) || isWaitingForTicket(booking);
}
function bookingGroup(booking: Booking) {
  // A confirmed flight reservation is still waiting for ticket issuance.
  return isWaitingForTicket(booking) ? "OTHER" : tripGroup(booking);
}
function statusInfo(status: string, product?: string, serviceKind?: string | null): StatusInfo {
  if (product === "FLIGHT" && serviceKind === "ANCILLARY" && ["CONFIRMED", "TICKETED"].includes(status)) return { label: "Extras confirmed", tone: "confirmed", description: "The supplier has confirmed these extras for your original journey. Check the confirmation details for this service." };
  if (product === "FLIGHT" && status === "CONFIRMED") return { label: "Awaiting ticket", tone: "pending", description: "The flight reservation is confirmed, but your ticket has not been issued yet. Wait for ticket confirmation before travelling." };
  return statusLabels[status] ?? { label: status.replaceAll("_", " ").toLowerCase(), tone: "neutral", description: "Check the latest booking details before making travel arrangements." };
}
function money(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Amount unavailable";
  if (currency === "INR" && Number.isSafeInteger(amount)) return displayMoney(amount);
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount / 100); }
  catch { return `${currency} ${(amount / 100).toFixed(2)}`; }
}
function travelDate(value?: string) {
  if (!value) return "Date not available";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return "Date not available";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
function bookingTitle(booking: Booking) {
  const trip = booking.itinerary_summary;
  if (booking.service_kind === "ANCILLARY") return "Flight extras";
  if (booking.product === "HOTEL") return trip?.hotelName || booking.hotelStay?.name || (trip?.city ? `Your stay in ${trip.city}` : "Your hotel stay");
  if (trip?.legs?.length) return `${trip.legs[0].from} → ${trip.legs.at(-1)!.to}`;
  return trip?.from && trip?.to ? `${trip.from} → ${trip.to}` : "Your flight booking";
}
function tripMeta(booking: Booking) {
  const trip = booking.itinerary_summary;
  if (!trip) return "Itinerary details are available after supplier confirmation.";
  if (booking.product === "HOTEL") {
    const rooms = trip.rooms?.length || 1;
    const guests = trip.rooms?.reduce((count, room) => count + room.adults + (room.children ?? room.childAge?.length ?? 0), 0) ?? ((trip.adults ?? 0) + (trip.children ?? 0));
    return `${rooms} room${rooms === 1 ? "" : "s"}${guests ? ` · ${guests} guest${guests === 1 ? "" : "s"}` : ""}`;
  }
  const guests = (trip.adults ?? 0) + (trip.children ?? 0) + (trip.infants ?? 0);
  return `${trip.legs?.length ? `${trip.legs.length} flights` : trip.returnDate ? "Round trip" : "One way"}${guests ? ` · ${guests} traveller${guests === 1 ? "" : "s"}` : ""}`;
}
function TripJourney({ booking }: { booking: Booking }) {
  const trip = booking.itinerary_summary;
  if (!trip || booking.service_kind === "ANCILLARY") return null;
  if (booking.product === "HOTEL") {
    const nights = (Date.parse(trip.checkOut ?? "") - Date.parse(trip.checkIn ?? "")) / 86_400_000;
    const duration = Number.isInteger(nights) && nights > 0 ? `${nights} ${nights === 1 ? "night" : "nights"}` : undefined;
    return <><dl className="hub-stay-dates" aria-label="Stay dates">
      <div><dt>Check-in</dt><dd>{travelDate(trip.checkIn)}</dd></div>
      <div><dt>Check-out</dt><dd>{travelDate(trip.checkOut)}</dd></div>
      {duration && <div><dt>Duration</dt><dd>{duration}</dd></div>}
    </dl><div className="hub-stay-mobile"><StitchSymbol name="calendar_month" size={18}/><div><small>Stay duration</small><strong>{travelDate(trip.checkIn)} – {travelDate(trip.checkOut)}</strong><span>{[duration, tripMeta(booking)].filter(Boolean).join(" · ")}</span></div></div></>;
  }
  const legs = trip.legs?.length ? trip.legs : trip.from && trip.to ? [{ from: trip.from, to: trip.to, date: trip.date }, ...(trip.returnDate ? [{ from: trip.to, to: trip.from, date: trip.returnDate }] : [])] : [];
  if (!legs.length) return trip.date ? <p><time dateTime={trip.date}>{travelDate(trip.date)}</time></p> : null;
  return <div className="trip-journeys" aria-label="Journey itinerary">{legs.map((leg, index) => <div className="trip-journey" key={`${index}-${leg.from}-${leg.to}`}><div><span>{index === 0 ? "Departure" : trip.returnDate && !trip.legs?.length ? "Return" : `Flight ${index + 1}`}</span><strong>{leg.from}</strong></div><span className="trip-journey-line"><small>{travelDate(leg.date)}</small><TravelIcon name="plane" size={18} /></span><div><span>Arrival</span><strong>{leg.to}</strong></div></div>)}</div>;
}

function TripFilter({ label, text, count, active, onChoose }: { label: string; text: string; count: number; active: boolean; onChoose: () => void }) {
  const countId = useId();
  return <button type="button" aria-label={label} aria-describedby={countId} aria-pressed={active} onClick={onChoose}>
    {text} <b>{count}</b><span className="trips-visually-hidden" id={countId}>{count} matching loaded bookings</span>
  </button>;
}

function TripSupport({ upcoming }: { upcoming: Booking[] }) {
  const company = useCompanyProfile();
  return <aside className="trips-support" aria-label="Trip help">
    <section className="trips-support-card">
      <div className="hub-rail-heading"><span>Travel concierge</span><StitchSymbol name="support_agent"/></div>
      <div className="hub-desk"><span className="hub-avatar"><StitchSymbol name="support_agent" size={26}/></span><div><h2>{company.address.addressLocality} desk</h2><p>{company.hours.display}</p></div></div>
      <p className="hub-desk-note">For help with a ticket, hotel voucher or booking change, give our team your booking reference.</p>
      <a href={company.phoneHref} className="primary"><StitchSymbol name="call" size={17}/>Call the travel desk</a>
      <Link className="secondary" href="/customer-support">Get booking support <TravelIcon name="arrow" size={16}/></Link>
    </section>
    {upcoming.length > 0 && <section className="trips-checklist"><h2>Journey prep &amp; documents</h2><ul>
      <li><TravelIcon name="check" size={18}/>Check the supplier confirmation and traveller names.</li>
      <li><TravelIcon name="receipt" size={18}/>Download your ticket or voucher when available.</li>
      {upcoming.some(booking=>booking.product === "HOTEL") && <li><TravelIcon name="hotel" size={18}/>Keep your hotel voucher and photo ID ready for check-in.</li>}
    </ul>{upcoming.some(booking=>booking.product === "FLIGHT") && <Link href="/flight-booking-guide">Flight booking guide <span aria-hidden="true">↗</span></Link>}</section>}
    <section className="trips-checklist"><h2>Your account</h2><Link href="/travellers">Saved travellers</Link><Link href="/account">Account &amp; security</Link></section>
  </aside>;
}

function mergeBookings(current: Booking[], incoming: Booking[]) {
  return [...new Map([...current, ...incoming].map(booking => [booking.id, booking])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function BookingRecord({ booking, originalReference, onUpdate, onAccessLost }: { booking: Booking; originalReference?: string; onUpdate: () => void; onAccessLost: (status: 401 | 403) => void }) {
  const status = statusInfo(booking.status, booking.product, booking.service_kind);
  const [expanded, setExpanded] = useState(false);
  const [managementOpened, setManagementOpened] = useState(false);
  const [cancellationRevision,setCancellationRevision]=useState(0);
  const [details, setDetails] = useState<Confirmation | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const detailsInFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function loadDetails() {
    if (detailsInFlight.current) return;
    if (expanded && !detailsError) { setExpanded(false); return; }
    setExpanded(true);
    if (details) return;
    detailsInFlight.current = true;
    setDetailsLoading(true); setDetailsError("");
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch(`/api/bookings/${booking.id}/details`, { cache: "no-store", signal: request.signal });
      if (request.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { onAccessLost(response.status); return; }
      const data = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) throw Error(data.error || "Confirmation details could not be loaded.");
      setDetails(data);
    } catch (error) {
      if (!request.signal.aborted) setDetailsError(error instanceof Error ? error.message : "Details unavailable. Please try again.");
    } finally {
      detailsInFlight.current = false;
      if (!request.signal.aborted) setDetailsLoading(false);
    }
  }
  const hotel = booking.product === "HOTEL";
  const productLabel = booking.service_kind === "ANCILLARY" ? "Flight extras receipt" : booking.service_kind === "REISSUE" ? "Replacement flight" : hotel ? "Hotel stay" : "Flight booking";
  const hasPhoto = hotel && Boolean(booking.hotelPhotos?.length);
  const stay = hotel && isConfirmed(booking) ? booking.hotelStay : undefined;
  return <article className={`white-card trip-record trip-tone-${status.tone}`} aria-labelledby={`trip-title-${booking.id}`}>
    <div className={`hub-summary${hasPhoto ? " with-photo" : ""}`}>
      <header className="hub-booking-heading">
        <span className="hub-product-icon"><StitchSymbol name={hotel ? "hotel" : "flight_takeoff"} size={24}/></span>
        <div className="hub-booking-title"><small>{productLabel}{hotel && booking.itinerary_summary?.city ? ` · ${booking.itinerary_summary.city}` : ""}</small><h2 id={`trip-title-${booking.id}`}>{bookingTitle(booking)}</h2></div>
        <span className={`trip-status is-${status.tone}`}><i />{status.label}</span>
      </header>
      <dl className="hub-reference"><div><dt>Booking reference</dt><dd>{booking.reference}</dd></div><div><dt>Booked on</dt><dd>{travelDate(booking.created_at)}</dd></div><div><dt>Booking total</dt><dd>{money(booking.total_minor, booking.currency)}</dd></div></dl>
      {hasPhoto && <div className="hub-property-photo"><HotelPropertyMedia name={bookingTitle(booking)} photos={booking.hotelPhotos}/></div>}
      <div className="hub-booking-facts">
        <TripJourney booking={booking}/>
        {stay?.rooms.length ? <p className="hub-room"><StitchSymbol name="cottage" size={19}/><span><small>Selected room</small>{stay.rooms.join(" · ")}</span></p> : null}
        <p className="hub-party"><StitchSymbol name={hotel ? "hotel" : "airline_seat_recline_normal"} size={17}/>{tripMeta(booking)}</p>
        {(stay?.meal || Boolean(stay?.inclusions.length)) && <ul className="hub-inclusions" aria-label="Booked meal plan and inclusions">
          {stay?.meal && <li><StitchSymbol name="restaurant" size={16}/>Meal plan: {stay.meal}</li>}
          {stay?.inclusions.map((item, index) => <li key={index}><StitchSymbol name="check_circle" size={15}/>{item}</li>)}
        </ul>}
      </div>
    </div>
    {status.tone !== "confirmed" && <p className={`trip-status-note is-${status.tone}`}><TravelIcon name={status.tone === "pending" ? "clock" : "receipt"} size={16}/>{status.description}</p>}
    {booking.service_kind && <p className="trip-linked-note">Linked to your original booking{originalReference ? ` ${originalReference}` : ""}.{booking.service_kind === "REISSUE" ? " Use the replacement ticket for changed travel once it is ticketed." : " These extras belong to that journey."}</p>}
    <div className="trip-record-actions"><Link className="secondary" href={`/my-trips/${booking.id}`}><TravelIcon name="clock" size={16} />Track booking</Link>{isConfirmed(booking) && <button type="button" className="secondary" aria-expanded={expanded} aria-controls={`confirmation-${booking.id}`} disabled={detailsLoading} onClick={() => void loadDetails()}><TravelIcon name="receipt" size={16} />{detailsLoading ? "Loading details…" : expanded && !detailsError ? "Hide confirmation details" : detailsError ? "Retry confirmation details" : "View confirmation details"}</button>}{(isConfirmed(booking) || booking.status === "CANCELLED") && <a className="secondary" href={`/api/bookings/${booking.id}/document`}><StitchSymbol name={hotel ? "picture_as_pdf" : "download"} size={17}/>Download confirmation PDF</a>}{isPendingBooking(booking) && <span className="trip-auto-update"><span />We’ll refresh this status automatically</span>}</div>
    {expanded && <section className="trip-confirmation" id={`confirmation-${booking.id}`} aria-label={`Confirmation for ${booking.reference}`}>
      {detailsLoading ? <p role="status">Loading verified confirmation details…</p> : detailsError ? <p role="alert" className="trip-inline-error">{detailsError}</p> : details && <><h3>Supplier confirmation</h3><dl><div><dt>Supplier reference</dt><dd>{details.supplierBookingId || "Awaiting supplier reference"}</dd></div>{details.hotelName && <div><dt>Hotel</dt><dd>{details.hotelName}</dd></div>}</dl>{details.passengers?.length ? <div className="trip-passengers">{details.passengers.map((passenger, index) => <div key={`${passenger.name}-${index}`}><strong>{passenger.name || `${booking.product === "HOTEL" ? "Guest" : "Traveller"} ${index + 1}`}</strong>{booking.product === "HOTEL" ? <span>{Number.isInteger(passenger.roomIndex) && passenger.roomIndex! >= 0 && passenger.roomIndex! < (booking.itinerary_summary?.rooms?.length ?? 0) ? `Room ${passenger.roomIndex! + 1} · ` : ""}Guest on this stay</span> : <><span>PNR <b>{passenger.pnrs?.join(", ") || "Awaiting supplier"}</b></span><span>Ticket <b>{passenger.tickets?.join(", ") || "Awaiting supplier"}</b></span></>}</div>)}</div> : booking.product === "FLIGHT" && <p>Passenger ticket references have not been returned. Check the confirmation PDF or request a status check before travel.</p>}</>}
    </section>}
    {booking.linked_services?.map(service => <div className="trip-related" key={service.reference}><TravelIcon name="bag" size={16} /><p><strong>{service.kind === "REISSUE" ? "Replacement flight" : "Flight extras"} · {service.reference}</strong><span>{statusInfo(service.status, "FLIGHT", service.kind).label}{service.kind === "REISSUE" && service.status === "TICKETED" ? " · Some original travel has been replaced. Use the replacement ticket for changed travel." : ""}</span></p></div>)}
    {!!booking.refunds?.length && <section className="trip-refunds" aria-label={`Refunds for ${booking.reference}`}><h3>Refund progress</h3>{booking.refunds.map(refund => <div key={refund.id}><span><b>{refundStage(refund.status).label}</b><small>{refundStage(refund.status).description}</small></span><strong>{money(refund.amountMinor, booking.currency)}</strong></div>)}<p>Cancellation and payment refunds are tracked separately.</p></section>}
    <details className="trip-management" onToggle={event => { if (event.currentTarget.open) setManagementOpened(true); }}><summary>Changes, cancellation & refund updates<TravelIcon name="chevron" size={16} /></summary>{managementOpened && <div>{booking.service_kind !== "ANCILLARY" && manageableStatuses.includes(booking.status) && <CancellationRequest bookingId={booking.id} product={booking.product} onSubmitted={()=>setCancellationRevision(value=>value+1)} />}{booking.product === "FLIGHT" && booking.status === "TICKETED" && booking.service_kind !== "ANCILLARY" && <FlightServices bookingId={booking.id} onUpdate={onUpdate} />}<CancellationProgress bookingId={booking.id} refreshVersion={cancellationRevision} /></div>}</details>
  </article>;
}

export default function BookingWorkspace({ admin = false, openFlightLookup = false }: { admin?: boolean; openFlightLookup?: boolean }) {
  const { data: session, isPending, isRefetching, error, refetch } = authClient.useSession();
  const checking = isPending || isRefetching;
  const signedOut = !error && !session || error?.status === 401;
  // The installed Better Auth hook already subscribes to visibility and cross-tab
  // session changes. A new settled identity gets a new private component, even if
  // all previous bookings were settled and no booking poll was running.
  const ready = !isPending && error?.status !== 401 && error?.status !== 403 && Boolean(session);
  const blocked = checking || Boolean(error);
  return <>
    {(!ready || blocked) && <><TravelHeader active={admin ? undefined : "trips"}/><main className="page-shell trips-workspace" id="main-content"><h1>Your trips are private.</h1>{checking ? <p role="status">Checking secure account access…</p> : error && !signedOut ? <><p role="alert">{error.status === 403 ? "Access to these trips is no longer available. Check your account or contact support; this does not establish that you were signed out." : "We couldn’t verify account access. Your private trips are hidden; this does not establish that you were signed out or change any booking status."}</p><button type="button" className="primary" onClick={()=>void refetch()}>Check account access</button></> : <><p role="alert">Sign in using the email address on your booking to look up a flight by PNR or see your booking updates.</p><div className="trip-access-actions"><Link className="primary" href={accountHref("/my-trips")}>Sign in to view trips</Link><Link className="secondary" href={accountHref("/my-trips?lookup=flight")}>Find a flight by PNR</Link></div></>}</main><TravelFooter/></>}
    {ready && <div hidden={blocked} inert={blocked}><PrivateBookingWorkspace key={`${session!.user.id}:${session!.session.id}:${session!.user.emailVerified}:${session!.user.phoneNumberVerified}`} admin={admin} paused={blocked} travellerName={session!.user.name || ""} emailVerified={session!.user.emailVerified} openFlightLookup={openFlightLookup}/></div>}
  </>;
}

function PrivateBookingWorkspace({ admin, paused, travellerName, emailVerified, openFlightLookup }: { admin: boolean; paused: boolean; travellerName: string; emailVerified: boolean; openFlightLookup: boolean }) {
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessError, setAccessError] = useState(false);
  const [search, setSearch] = useState("");
  const [listError, setListError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [journeyFilter, setJourneyFilter] = useState("ALL");
  const moreController = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);
  const accessLost = useRef(false);
  const loseAccess = useCallback((status: 401 | 403) => {
    accessLost.current = true;
    moreController.current?.abort(); moreInFlight.current = false;
    setBookings([]); setMetrics({}); setHasMore(false); setLoadingMore(false);
    setSearch(""); setPage(1); setFilter("ALL"); setJourneyFilter("ALL"); setListError(""); setSyncError("");
    setAccessError(true); setError(status === 401 ? "Sign in again to view your private booking updates. This does not change your payment or booking status." : "Access to these booking details is no longer available. Check your account or contact support. This does not establish that you were signed out or change your booking status."); setLoading(false);
  }, []);
  const hasPending = bookings.some(isPendingBooking);

  useEffect(() => {
    const controller = new AbortController();
    fetch(admin ? "/api/admin/overview" : "/api/bookings?page=1", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (controller.signal.aborted || accessLost.current) return;
      if (response.status === 401 || response.status === 403) { loseAccess(response.status); return; }
      const data = await response.json();
      if (controller.signal.aborted || accessLost.current) return;
      if (!response.ok) { setAccessError(response.status === 401 || response.status === 403); throw Error(data.error || "Your bookings could not be loaded."); }
      if (admin) setMetrics(data);
      else { setHasMore(Boolean(data.hasMore)); setBookings(data.bookings ?? []); }
    }).catch(error => {
      if (!controller.signal.aborted && !accessLost.current) setError(error instanceof Error ? error.message : "Your bookings could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [admin, revision, loseAccess]);

  // Refresh every loaded page, not just page one. A pending older booking must
  // continue to update after the customer opens more history. Recursive timeout
  // prevents overlapping polls if the network is slower than the interval.
  useEffect(() => {
    if (admin || paused || !hasPending || loading) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refreshPending() {
      try {
        const pages = await Promise.all(Array.from({ length: page }, async (_, index) => {
          const response = await fetch(`/api/bookings?page=${index + 1}`, { cache: "no-store", signal: controller.signal });
          if (!controller.signal.aborted && (response.status === 401 || response.status === 403)) { loseAccess(response.status); controller.abort(); }
          const data = await response.json();
          if (!response.ok) throw Error(data.error || "Status updates are temporarily unavailable.");
          return (data.bookings ?? []) as Booking[];
        }));
        if (!controller.signal.aborted && !accessLost.current) { setBookings(current => mergeBookings(current, pages.flat())); setSyncError(""); }
      } catch (error) {
        if (!controller.signal.aborted && !accessLost.current) setSyncError(error instanceof Error ? error.message : "Status updates are temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refreshPending, 5000);
      }
    }
    timer = setTimeout(refreshPending, 5000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [admin, paused, hasPending, loading, page, revision, loseAccess]);
  useEffect(() => () => moreController.current?.abort(), []);

  function refresh() {
    accessLost.current = false;
    moreController.current?.abort(); moreInFlight.current = false;
    setPage(1); setLoadingMore(false); setLoading(true); setError(""); setAccessError(false); setListError(""); setSyncError(""); setRevision(value => value + 1);
  }
  async function loadMore() {
    if (moreInFlight.current || accessLost.current) return;
    moreInFlight.current = true; setLoadingMore(true); setListError("");
    const controller = new AbortController(); moreController.current = controller;
    try {
      const response = await fetch(`/api/bookings?page=${page + 1}`, { cache: "no-store", signal: controller.signal });
      if (!controller.signal.aborted && (response.status === 401 || response.status === 403)) { loseAccess(response.status); return; }
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Older trips could not be loaded.");
      if (!controller.signal.aborted && !accessLost.current) { setBookings(current => mergeBookings(current, data.bookings ?? [])); setHasMore(Boolean(data.hasMore)); setPage(current => current + 1); }
    } catch (error) {
      if (!controller.signal.aborted && !accessLost.current) setListError(error instanceof Error ? error.message : "Older trips could not be loaded.");
    } finally {
      if (!controller.signal.aborted) { moreInFlight.current = false; setLoadingMore(false); }
    }
  }
  const groups = new Map(bookings.map(booking => [booking.id, bookingGroup(booking)]));
  const upcoming = bookings.filter(booking => groups.get(booking.id) === "UPCOMING");
  const confirmedCount = bookings.filter(isConfirmed).length;
  const pendingCount = bookings.filter(isPendingBooking).length;
  const searchText = search.trim().toLowerCase();
  const matching = bookings.filter(booking => [booking.reference, bookingTitle(booking), booking.itinerary_summary?.city].join(" ").toLowerCase().includes(searchText));
  function matchesFilter(booking: Booking, key: string) {
    if (key === "ATTENTION") return attentionStatuses.includes(booking.status);
    if (key === "PENDING") return isPendingBooking(booking);
    return key === "ALL" || booking.product === key;
  }
  const productMatches = matching.filter(booking => matchesFilter(booking, filter));
  const dateMatches = matching.filter(booking => journeyFilter === "ALL" || groups.get(booking.id) === journeyFilter);
  const visible = dateMatches.filter(booking => matchesFilter(booking, filter));
  const filterOptions = [
    {value:"ALL", label:"All trips", short:"All"}, {value:"FLIGHT", label:"Flights"}, {value:"HOTEL", label:"Hotels"},
    {value:"PENDING", label:"In progress"}, {value:"ATTENTION", label:"Needs attention"},
  ];
  const dateOptions = [
    {value:"ALL", label:"Any travel date", short:"All dates"}, {value:"UPCOMING", label:"Upcoming & current", short:"Upcoming"},
    {value:"PAST", label:"Past travel", short:"Past"}, {value:"CANCELLED", label:"Cancelled trips", short:"Cancelled"},
    {value:"OTHER", label:"Booking updates & undated trips", short:"Other updates"},
  ];

  return <>
    <TravelHeader active={admin ? undefined : "trips"} tripTools={!admin && bookings.length > 0 && !error && !loading && !paused} />
    <main className={`page-shell trips-workspace ${admin ? "account-workspace-layout" : "concierge-trips"}`} id={paused?undefined:"main-content"}>
      {admin && <WorkspaceNavigation active="trips" />}
      <div className="trips-content">
        {!admin && <nav className="trip-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/account">My account</Link> / <b>My trips</b></nav>}
        <div className="page-heading">
          {!admin && <span className="hub-avatar" aria-hidden="true">{travellerName.trim().split(/\s+/).slice(0,2).map(name=>name[0]).join("").toUpperCase() || <TravelIcon name="user"/>}</span>}
          <div className="hub-identity">{admin ? <><div className="eyebrow">Max Travel Operations</div><h1>Your operations workspace.</h1><p>Protected access · Admin permission and authenticator required</p></> : <>
            <h1>{travellerName ? <>{travellerName}<span>’s Travel Hub</span></> : "Your Travel Hub"}</h1>
            <p>{!error && !loading && bookings.length > 0 ? <><StitchSymbol name="luggage" size={15}/>{bookings.length} loaded {bookings.length === 1 ? "booking" : "bookings"} · {confirmedCount} confirmed</> : "Your bookings, travel documents and itinerary updates."}</p></>}
          </div>
          <div className="trips-heading-actions">
            {!admin && !error && !loading && bookings.length > 0 && <div className="hub-metrics"><div><small>Upcoming</small><b>{upcoming.length} {upcoming.length === 1 ? "booking" : "bookings"}</b></div><div><small>In progress</small><b>{pendingCount}</b></div></div>}
            {!accessError && (admin || !bookings.length) && <button className="secondary" disabled={loading} onClick={refresh} aria-label="Refresh booking updates"><TravelIcon name="refresh" size={16}/>Refresh</button>}
            <Link className="primary" href="/book" aria-label="Book new trip"><StitchSymbol name="add_circle" size={17}/><span className="hub-book-desktop">Book new trip</span><span className="hub-book-mobile">Book trip</span></Link>
          </div>
        </div>
      {!admin&&!loading&&!error&&<BookingLookup emailVerified={emailVerified} initiallyOpen={openFlightLookup}/>}
      {loading ? <div className="trips-loading" role="status" aria-label="Loading your trips"><p>Gathering your journeys…</p><div className="booking-skeleton" /><div className="booking-skeleton" /></div> : error ? <section className="trips-empty trips-access"><span className="trips-empty-icon"><TravelIcon name="shield" size={29} /></span><p className="eyebrow">{accessError ? "YOUR TRIPS ARE PRIVATE" : "LET’S TRY THAT AGAIN"}</p><h2>{accessError ? "Let’s get you to your bookings." : "We couldn’t load your trips."}</h2><p role="alert">{error}</p><div>{accessError && <Link className="primary" href={accountHref("/my-trips")}>Sign in to view trips</Link>}{!accessError&&<button className="secondary" onClick={refresh}>Try again</button>}</div></section> : admin ? <div className="metric-grid">{Object.entries(metrics).map(([key, value]) => <div className="white-card metric" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value}</strong><small>Database records</small></div>)}</div> : bookings.length === 0 ? <section className="trips-empty trips-empty-discover"><Image className="trips-empty-photo" src="/travel/bali.jpg" alt="" fill sizes="(max-width: 750px) 100vw, 500px" /><span className="trips-empty-icon"><TravelIcon name="bag" size={31} /></span><p className="eyebrow">A BLANK PAGE. A WORLD OF POSSIBILITIES.</p><h2>Your next story starts here.</h2><p>No bookings are linked to this account yet. A weekend away, a long-awaited reunion, or somewhere completely new?</p><Link className="primary" href="/book">Find your next journey<TravelIcon name="arrow" size={17} /></Link><span>Already booked? Check you’re signed in to the right account.</span><Link className="trips-account-link" href="/account">Account & security</Link></section> : <>
        <div className="hub-browser">
          <label className="hub-search"><StitchSymbol name="search"/><span className="trips-visually-hidden">Search loaded bookings</span><input id="trip-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by booking reference, city or hotel…"/></label>
          <button className="hub-sync hub-sync-mobile" onClick={refresh} aria-label="Refresh booking updates"><StitchSymbol name="sync" size={17}/></button>
          <div className="hub-product-filters" role="group" aria-label="Filter your bookings"><span>Filter</span>{filterOptions.map(option => {
            const count = dateMatches.filter(booking => matchesFilter(booking, option.value)).length;
            if (!count && ["PENDING","ATTENTION"].includes(option.value) && filter !== option.value) return null;
            return <TripFilter key={option.value} label={option.label} text={option.short || option.label} count={count} active={filter === option.value} onChoose={() => setFilter(option.value)}/>;
          })}</div>
        </div>
        <div className="hub-dashboard-tools" id="trip-updates" tabIndex={-1}>
          <div className="hub-date-filters" role="group" aria-label="Filter by travel dates">{dateOptions.map(option => {
            const count = option.value === "ALL" ? productMatches.length : productMatches.filter(booking => groups.get(booking.id) === option.value).length;
            return <TripFilter key={option.value} label={option.label} text={option.short} count={count} active={journeyFilter === option.value} onChoose={() => setJourneyFilter(option.value)}/>;
          })}</div>
          <button className="hub-sync" onClick={refresh} aria-label="Refresh booking updates"><StitchSymbol name="sync" size={17}/><span>Sync itineraries</span></button>
        </div>
        <div className="trips-dashboard"><div className="trips-dashboard-main">
        {syncError && <p className="trip-inline-error" role="status">Automatic updates are temporarily unavailable: {syncError} Your last loaded status is shown. We’ll retry automatically.</p>}
        {visible.length ? <div className="trips-list">{tripGroups.map(group=>{const records=sortTrips(visible.filter(booking=>groups.get(booking.id)===group.value),group.value);return records.length?<section className="trip-date-group" key={group.value} aria-label={group.label}><header><h2>{group.label} <span>{records.length}</span></h2><p>{group.description}</p></header>{records.map(booking => <BookingRecord booking={booking} originalReference={bookings.find(original => original.id === booking.parent_order_id)?.reference} key={booking.id} onUpdate={refresh} onAccessLost={loseAccess} />)}</section>:null;})}</div> : <section className="trips-filter-empty"><TravelIcon name="search" size={25} /><h2>No bookings in this view.</h2><p>Try a different search or filter, or load older trips if more history is available.</p><button className="secondary" onClick={() => { setFilter("ALL"); setJourneyFilter("ALL"); setSearch(""); }}>Show all trips</button></section>}
        <p className="trips-loaded-scope">Search, filters and counts cover {bookings.length} loaded bookings only.{hasMore ? " More booking records are available below, including earlier bookings for upcoming travel." : ""}</p>
        {listError && <p className="trip-inline-error" role="alert">{listError} Your loaded trips are still here. Try loading older trips again.</p>}
        {hasMore && <div className="trips-load-more"><button className="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading older trips…" : "Load older trips"}</button></div>}</div><TripSupport upcoming={upcoming}/></div>
      </>}
    </div></main>
    <TravelFooter />
  </>;
}
