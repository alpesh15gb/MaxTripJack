"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@/app/trips-experience.css";
import { accountHref } from "@/lib/account-return";
import { refundStage, sortTrips, tripGroup, tripGroups } from "@/lib/trip-organiser";
import FlightServices from "./flight-services";
import CancellationRequest from "./cancellation-request";
import CancellationProgress from "./cancellation-progress";
import { TravelFooter, TravelHeader, TravelIcon } from "./travel-shell";

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
  refunds?: { id: string; amountMinor: string; status: string }[];
};
type Confirmation = { supplierBookingId?: string; hotelName?: string; passengers?: { name: string; pnrs: string[]; tickets: string[] }[] };
type StatusInfo = { label: string; tone: "confirmed" | "pending" | "attention" | "neutral"; description: string };
const pendingStatuses = ["PAID", "BOOKING_PENDING", "PAYMENT_PENDING"];
const confirmedStatuses = ["CONFIRMED", "TICKETED"];
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

function statusInfo(status: string): StatusInfo {
  return statusLabels[status] ?? { label: status.replaceAll("_", " ").toLowerCase(), tone: "neutral", description: "Check the latest booking details before making travel arrangements." };
}
function money(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Amount unavailable";
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
  if (booking.product === "HOTEL") return trip?.hotelName || (trip?.city ? `Your stay in ${trip.city}` : "Your hotel stay");
  if (trip?.legs?.length) return `${trip.legs[0].from} → ${trip.legs.at(-1)!.to}`;
  return trip?.from && trip?.to ? `${trip.from} → ${trip.to}` : "Your flight booking";
}
function tripMeta(booking: Booking) {
  const trip = booking.itinerary_summary;
  if (!trip) return "Itinerary details are available after supplier confirmation.";
  if (booking.product === "HOTEL") {
    const rooms = trip.rooms?.length || 1;
    const guests = trip.rooms?.reduce((count, room) => count + room.adults + (room.children ?? room.childAge?.length ?? 0), 0) ?? ((trip.adults ?? 0) + (trip.children ?? 0));
    return `${travelDate(trip.checkIn)} – ${travelDate(trip.checkOut)} · ${rooms} room${rooms === 1 ? "" : "s"}${guests ? ` · ${guests} guest${guests === 1 ? "" : "s"}` : ""}`;
  }
  const guests = (trip.adults ?? 0) + (trip.children ?? 0) + (trip.infants ?? 0);
  return `${travelDate(trip.legs?.[0]?.date ?? trip.date)}${trip.returnDate ? ` – ${travelDate(trip.returnDate)}` : ""} · ${trip.legs?.length ? `${trip.legs.length} flights` : trip.returnDate ? "Round trip" : "One way"}${guests ? ` · ${guests} traveller${guests === 1 ? "" : "s"}` : ""}`;
}
function TripJourney({ booking }: { booking: Booking }) {
  const trip = booking.itinerary_summary;
  if (!trip || booking.service_kind === "ANCILLARY") return null;
  if (booking.product === "HOTEL") return <div className="trip-journey trip-stay" aria-label="Stay dates"><div><span>Check-in</span><strong>{travelDate(trip.checkIn)}</strong></div><span className="trip-journey-line"><TravelIcon name="hotel" size={20} /></span><div><span>Check-out</span><strong>{travelDate(trip.checkOut)}</strong></div></div>;
  const legs = trip.legs?.length ? trip.legs : trip.from && trip.to ? [{ from: trip.from, to: trip.to, date: trip.date }, ...(trip.returnDate ? [{ from: trip.to, to: trip.from, date: trip.returnDate }] : [])] : [];
  if (!legs.length) return null;
  return <div className="trip-journeys" aria-label="Journey itinerary">{legs.map((leg, index) => <div className="trip-journey" key={`${index}-${leg.from}-${leg.to}`}><div><span>{index === 0 ? "Departure" : trip.returnDate && !trip.legs?.length ? "Return" : `Flight ${index + 1}`}</span><strong>{leg.from}</strong></div><span className="trip-journey-line"><small>{travelDate(leg.date)}</small><TravelIcon name="plane" size={18} /></span><div><span>Arrival</span><strong>{leg.to}</strong></div></div>)}</div>;
}

function TripSupport() {
  return <aside className="trips-support" aria-label="Trip help"><section className="trips-support-card"><span className="trips-support-icon"><TravelIcon name="shield" size={25} /></span><p className="eyebrow">HERE FOR YOUR JOURNEY</p><h2>A little help, when you need it.</h2><p>Questions about your booking? Keep your booking reference handy so our team can help.</p><Link className="secondary" href="/customer-support">Get booking support<TravelIcon name="arrow" size={16} /></Link></section><section className="trips-checklist"><h2>Before you go</h2><ul><li><TravelIcon name="check" size={18} /><span>Check the supplier confirmation and traveller details.</span></li><li><TravelIcon name="receipt" size={18} /><span>Download your confirmation when it’s available.</span></li><li><TravelIcon name="bag" size={18} /><span>Review baggage, check-in and supplier rules.</span></li></ul><Link href="/flight-booking-guide">Your flight booking guide <span aria-hidden="true">↗</span></Link></section><p className="trips-support-footnote"><TravelIcon name="clock" size={17} />Waiting for confirmation? Avoid paying again while your status is being checked.</p></aside>;
}

function mergeBookings(current: Booking[], incoming: Booking[]) {
  return [...new Map([...current, ...incoming].map(booking => [booking.id, booking])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function BookingRecord({ booking, originalReference, onUpdate }: { booking: Booking; originalReference?: string; onUpdate: () => void }) {
  const status = statusInfo(booking.status);
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
    controller.current = new AbortController();
    try {
      const response = await fetch(`/api/bookings/${booking.id}/details`, { cache: "no-store", signal: controller.current.signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Confirmation details could not be loaded.");
      setDetails(data);
    } catch (error) {
      if (!controller.current.signal.aborted) setDetailsError(error instanceof Error ? error.message : "Details unavailable. Please try again.");
    } finally {
      detailsInFlight.current = false;
      if (!controller.current.signal.aborted) setDetailsLoading(false);
    }
  }
  return <article className={`white-card trip-record trip-tone-${status.tone}`} aria-labelledby={`trip-title-${booking.id}`}>
    <div className="trip-record-top"><div className="trip-record-type"><TravelIcon name={booking.product === "FLIGHT" ? "plane" : "hotel"} size={16} /><span>{booking.service_kind === "ANCILLARY" ? "Flight extras receipt" : booking.service_kind === "REISSUE" ? "Replacement flight" : booking.product === "FLIGHT" ? "Flight booking" : "Hotel booking"}</span></div><span className={`trip-status is-${status.tone}`}><i />{status.label}</span></div>
    <div className="trip-record-main"><div><h2 id={`trip-title-${booking.id}`}>{bookingTitle(booking)}</h2><p className="trip-itinerary">{tripMeta(booking)}</p><p className="trip-reference">Booking reference <strong>{booking.reference}</strong><span>Created {travelDate(booking.created_at)}</span></p></div><div className="trip-record-total"><small>Booking total</small><strong>{money(booking.total_minor, booking.currency)}</strong><span>{booking.currency} · All travellers</span></div></div>
    <TripJourney booking={booking} />
    <p className={`trip-status-note is-${status.tone}`}><TravelIcon name={status.tone === "confirmed" ? "check" : status.tone === "pending" ? "clock" : "receipt"} size={16} />{status.description}</p>
    {booking.service_kind && <p className="trip-linked-note">Linked to your original booking{originalReference ? ` ${originalReference}` : ""}.{booking.service_kind === "REISSUE" ? " Use the replacement ticket for changed travel once it is ticketed." : " These extras belong to that journey."}</p>}
    <div className="trip-record-actions">{confirmedStatuses.includes(booking.status) && <button type="button" className="secondary" aria-expanded={expanded} aria-controls={`confirmation-${booking.id}`} disabled={detailsLoading} onClick={() => void loadDetails()}><TravelIcon name="receipt" size={16} />{detailsLoading ? "Loading details…" : expanded && !detailsError ? "Hide confirmation details" : detailsError ? "Retry confirmation details" : "View confirmation details"}</button>}{[...confirmedStatuses, "CANCELLED"].includes(booking.status) && <a className="secondary" href={`/api/bookings/${booking.id}/document`}><TravelIcon name="bag" size={16} />Download confirmation PDF</a>}{pendingStatuses.includes(booking.status) && <span className="trip-auto-update"><span />We’ll refresh this status automatically</span>}</div>
    {expanded && <section className="trip-confirmation" id={`confirmation-${booking.id}`} aria-label={`Confirmation for ${booking.reference}`}>
      {detailsLoading ? <p role="status">Loading verified confirmation details…</p> : detailsError ? <p role="alert" className="trip-inline-error">{detailsError}</p> : details && <><h3>Supplier confirmation</h3><dl><div><dt>Supplier reference</dt><dd>{details.supplierBookingId || "Awaiting supplier reference"}</dd></div>{details.hotelName && <div><dt>Hotel</dt><dd>{details.hotelName}</dd></div>}</dl>{details.passengers?.length ? <div className="trip-passengers">{details.passengers.map((passenger, index) => <div key={`${passenger.name}-${index}`}><strong>{passenger.name || `Traveller ${index + 1}`}</strong><span>PNR <b>{passenger.pnrs?.join(", ") || "Awaiting supplier"}</b></span><span>Ticket <b>{passenger.tickets?.join(", ") || "Awaiting supplier"}</b></span></div>)}</div> : booking.product === "FLIGHT" && <p>Passenger ticket references have not been returned. Check the confirmation PDF or request a status check before travel.</p>}</>}
    </section>}
    {booking.linked_services?.map(service => <div className="trip-related" key={service.reference}><TravelIcon name="bag" size={16} /><p><strong>{service.kind === "REISSUE" ? "Replacement flight" : "Flight extras"} · {service.reference}</strong><span>{statusInfo(service.status).label}{service.kind === "REISSUE" && service.status === "TICKETED" ? " · Some original travel has been replaced. Use the replacement ticket for changed travel." : ""}</span></p></div>)}
    {!!booking.refunds?.length && <section className="trip-refunds" aria-label={`Refunds for ${booking.reference}`}><h3>Refund progress</h3>{booking.refunds.map(refund => <div key={refund.id}><span><b>{refundStage(refund.status).label}</b><small>{refundStage(refund.status).description}</small></span><strong>{money(refund.amountMinor, booking.currency)}</strong></div>)}<p>Cancellation and payment refunds are tracked separately.</p></section>}
    <details className="trip-management" onToggle={event => { if (event.currentTarget.open) setManagementOpened(true); }}><summary>Changes, cancellation & refund updates<TravelIcon name="chevron" size={16} /></summary>{managementOpened && <div>{booking.service_kind !== "ANCILLARY" && confirmedStatuses.includes(booking.status) && <CancellationRequest bookingId={booking.id} product={booking.product} onSubmitted={()=>setCancellationRevision(value=>value+1)} />}{booking.product === "FLIGHT" && booking.status === "TICKETED" && booking.service_kind !== "ANCILLARY" && <FlightServices bookingId={booking.id} onUpdate={onUpdate} />}<CancellationProgress bookingId={booking.id} refreshVersion={cancellationRevision} /></div>}</details>
  </article>;
}

export default function BookingWorkspace({ admin = false }: { admin?: boolean }) {
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
  const hasPending = bookings.some(booking => pendingStatuses.includes(booking.status));

  useEffect(() => {
    const controller = new AbortController();
    fetch(admin ? "/api/admin/overview" : "/api/bookings?page=1", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) { setAccessError(response.status === 401 || response.status === 403); throw Error(data.error || "Your bookings could not be loaded."); }
      if (admin) setMetrics(data);
      else { setHasMore(Boolean(data.hasMore)); setBookings(data.bookings ?? []); }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Your bookings could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [admin, revision]);

  // Refresh every loaded page, not just page one. A pending older booking must
  // continue to update after the customer opens more history. Recursive timeout
  // prevents overlapping polls if the network is slower than the interval.
  useEffect(() => {
    if (admin || !hasPending || loading) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refreshPending() {
      try {
        const pages = await Promise.all(Array.from({ length: page }, async (_, index) => {
          const response = await fetch(`/api/bookings?page=${index + 1}`, { cache: "no-store", signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw Error(data.error || "Status updates are temporarily unavailable.");
          return (data.bookings ?? []) as Booking[];
        }));
        if (!controller.signal.aborted) { setBookings(current => mergeBookings(current, pages.flat())); setSyncError(""); }
      } catch (error) {
        if (!controller.signal.aborted) setSyncError(error instanceof Error ? error.message : "Status updates are temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refreshPending, 5000);
      }
    }
    timer = setTimeout(refreshPending, 5000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [admin, hasPending, loading, page, revision]);
  useEffect(() => () => moreController.current?.abort(), []);

  function refresh() {
    moreController.current?.abort(); moreInFlight.current = false;
    setPage(1); setLoadingMore(false); setLoading(true); setError(""); setAccessError(false); setListError(""); setSyncError(""); setRevision(value => value + 1);
  }
  async function loadMore() {
    if (moreInFlight.current) return;
    moreInFlight.current = true; setLoadingMore(true); setListError("");
    const controller = new AbortController(); moreController.current = controller;
    try {
      const response = await fetch(`/api/bookings?page=${page + 1}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Older trips could not be loaded.");
      if (!controller.signal.aborted) { setBookings(current => mergeBookings(current, data.bookings ?? [])); setHasMore(Boolean(data.hasMore)); setPage(current => current + 1); }
    } catch (error) {
      if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "Older trips could not be loaded.");
    } finally {
      if (!controller.signal.aborted) { moreInFlight.current = false; setLoadingMore(false); }
    }
  }
  const visible = bookings.filter(booking => (journeyFilter === "ALL" || tripGroup(booking) === journeyFilter) && (filter === "ALL" || (filter === "ATTENTION" ? attentionStatuses.includes(booking.status) : filter === "PENDING" ? pendingStatuses.includes(booking.status) : booking.product === filter)) && `${booking.reference} ${bookingTitle(booking)} ${booking.itinerary_summary?.city ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const confirmedCount = bookings.filter(booking => confirmedStatuses.includes(booking.status)).length;
  const pendingCount = bookings.filter(booking => pendingStatuses.includes(booking.status)).length;

  return <>
    <TravelHeader active={admin ? undefined : "trips"} />
    <main className="page-shell trips-workspace" id="main-content">
      <nav className="trips-workspace-nav" aria-label="Your travel workspace"><Link href="/account"><TravelIcon name="user" size={18}/>Account & security</Link><Link href="/my-trips" aria-current="page"><TravelIcon name="bag" size={18}/>My trips</Link><Link href="/travellers"><TravelIcon name="receipt" size={18}/>Saved travellers</Link></nav><div className="page-heading"><div><div className="eyebrow">{admin ? "MAX TRAVEL OPERATIONS" : "EVERY JOURNEY, TOGETHER"}</div><h1>{admin ? "Your operations workspace." : "Your trips. All in one place."}</h1><p>{admin ? "Protected access · Admin permission and authenticator required" : "From the next departure to the memories you bring home."}</p></div><div className="trips-heading-actions">{!accessError&&<button className="secondary" disabled={loading} onClick={refresh} aria-label="Refresh booking updates"><TravelIcon name="refresh" size={16} />Refresh</button>}<Link className="primary" href="/book"><TravelIcon name="plane" size={16} />Plan a trip</Link></div></div>
      {loading ? <div className="trips-loading" role="status" aria-label="Loading your trips"><p>Gathering your journeys…</p><div className="booking-skeleton" /><div className="booking-skeleton" /></div> : error ? <section className="trips-empty trips-access"><span className="trips-empty-icon"><TravelIcon name="shield" size={29} /></span><p className="eyebrow">{accessError ? "YOUR TRIPS ARE PRIVATE" : "LET’S TRY THAT AGAIN"}</p><h2>{accessError ? "Let’s get you to your bookings." : "We couldn’t load your trips."}</h2><p role="alert">{error}</p><div>{accessError && <Link className="primary" href={accountHref("/my-trips")}>Open account</Link>}{!accessError&&<button className="secondary" onClick={refresh}>Try again</button>}</div></section> : admin ? <div className="metric-grid">{Object.entries(metrics).map(([key, value]) => <div className="white-card metric" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value}</strong><small>Database records</small></div>)}</div> : bookings.length === 0 ? <section className="trips-empty"><span className="trips-empty-icon"><TravelIcon name="bag" size={31} /></span><p className="eyebrow">A BLANK PAGE. A WORLD OF POSSIBILITIES.</p><h2>Your next story starts here.</h2><p>No bookings are linked to this account yet. A weekend away, a long-awaited reunion, or somewhere completely new?</p><Link className="primary" href="/book">Find your next journey<TravelIcon name="arrow" size={17} /></Link><span>Already booked? Check you’re signed in to the right account.</span><Link className="trips-account-link" href="/account">Account & security</Link></section> : <>
        <div className="trips-overview"><div><span>YOUR TRIPS</span><strong>{bookings.length}<small>loaded bookings</small></strong></div><div><span>SUPPLIER CONFIRMED</span><strong>{confirmedCount}<small>confirmed in loaded trips</small></strong></div><div><span>STAY IN THE LOOP</span><strong>{pendingCount}<small>pending in loaded trips</small></strong></div><p><TravelIcon name="shield" size={20} />Payment and supplier confirmation are separate. We’ll show the actual status here.</p></div>
        <div className="trips-dashboard"><div className="trips-dashboard-main"><label className="trips-search"><TravelIcon name="search" size={20} /><span className="trips-visually-hidden">Search loaded bookings</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search destination or booking reference" /><span>Loaded trips</span></label><div className="trips-filter-row"><div className="trips-filters" aria-label="Filter your bookings">{[{ value: "ALL", label: "All trips" }, { value: "FLIGHT", label: "Flights" }, { value: "HOTEL", label: "Hotels" }, { value: "PENDING", label: "In progress" }, { value: "ATTENTION", label: "Needs attention" }].map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><span>{visible.length} loaded bookings shown · Travel-date order</span></div>
        <div className="trips-filters trips-journey-filters" aria-label="Filter by travel dates">{[{value:"ALL",label:"Any travel date"},...tripGroups].map(group=><button type="button" key={group.value} aria-pressed={journeyFilter===group.value} onClick={()=>setJourneyFilter(group.value)}>{group.label}</button>)}</div><p className="trips-loaded-scope">Search, filters and counts cover {bookings.length} loaded bookings only.{hasMore ? " More booking records are available below; upcoming trips may also be in older records." : " All available booking records are loaded."}</p>
        {syncError && <p className="trip-inline-error" role="status">Automatic updates are temporarily unavailable: {syncError} Your last loaded status is shown. We’ll retry automatically.</p>}
        {visible.length ? <div className="trips-list">{tripGroups.map(group=>{const records=sortTrips(visible.filter(booking=>tripGroup(booking)===group.value),group.value);return records.length?<section className="trip-date-group" key={group.value} aria-label={group.label}><header><h2>{group.label} <span>{records.length}</span></h2><p>{group.description}</p></header>{records.map(booking => <BookingRecord booking={booking} originalReference={bookings.find(original => original.id === booking.parent_order_id)?.reference} key={booking.id} onUpdate={refresh} />)}</section>:null;})}</div> : <section className="trips-filter-empty"><TravelIcon name="search" size={25} /><h2>No bookings in this view.</h2><p>Try a different search or filter, or load older trips if more history is available.</p><button className="secondary" onClick={() => { setFilter("ALL"); setJourneyFilter("ALL"); setSearch(""); }}>Show all trips</button></section>}
        {listError && <p className="trip-inline-error" role="alert">{listError} Your loaded trips are still here. Try loading older trips again.</p>}
        {hasMore && <div className="trips-load-more"><button className="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading older trips…" : "Load older trips"}</button></div>}</div><TripSupport /></div>
      </>}
    </main>
    <TravelFooter />
  </>;
}
