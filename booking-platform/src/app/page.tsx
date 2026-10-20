"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import AirportPicker from "@/components/airport-picker";
import HotelDestination from "@/components/hotel-destination";
import { indiaToday } from "@/lib/booking-presentation";
import { TravelFooter, TravelHeader, TravelIcon } from "@/components/travel-shell";

type Product = "FLIGHT" | "HOTEL";
const photos = {
  hero: "/travel/maldives.jpg",
  goa: "/travel/goa.jpg",
  dubai: "/travel/dubai.jpg",
  bali: "/travel/bali.jpg",
};

function dateAfter(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return indiaToday(date);
}

export default function Home() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [product, setProduct] = useState<Product>("FLIGHT");
  const [airports, setAirports] = useState({ from: "Mumbai (BOM)", to: "New Delhi (DEL)" });
  const [airportRevision, setAirportRevision] = useState(0);
  const [date, setDate] = useState(() => dateAfter(7));
  const [end, setEnd] = useState(() => dateAfter(10));
  const [adults, setAdults] = useState(1);
  const [roundTrip, setRoundTrip] = useState(false);
  const [notice, setNotice] = useState("");
  const [navigating, startNavigation] = useTransition();
  const nights = Math.round((Date.parse(end) - Date.parse(date)) / 86400000);

  function changeProduct(next: Product) {
    setProduct(next);
    setAdults(current => next === "HOTEL" ? Math.min(4, current) : current);
    setNotice("");
  }

  function swapAirports() {
    if (!form.current) return;
    const data = new FormData(form.current);
    setAirports({ from: String(data.get("to") || ""), to: String(data.get("from") || "") });
    setAirportRevision(value => value + 1);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (navigating) return;
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") || "").toUpperCase();
    const to = String(data.get("to") || "").toUpperCase();
    if (date < dateAfter(0)) { setNotice("Choose today or a future date for your trip."); return; }
    if (product === "FLIGHT" && (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to))) { setNotice("Select a departure and arrival airport, or enter their three-letter airport codes."); return; }
    if (product === "FLIGHT" && from === to) { setNotice("Choose different departure and arrival airports."); return; }
    if (product === "HOTEL" && (!end || end <= date)) { setNotice("Check-out must be after check-in. Choose at least one night."); return; }
    if (product === "FLIGHT" && roundTrip && (!end || end < date)) { setNotice("Your return date cannot be before your departure."); return; }
    const hotelIds = String(data.get("hotelIds") || "");
    if (product === "HOTEL" && !hotelIds) { setNotice("Choose a destination from the available suggestions before searching."); return; }
    const params = new URLSearchParams({ product, autoSearch: "1", date, adults: String(adults) });
    if (product === "FLIGHT") {
      params.set("from", from); params.set("to", to); params.set("cabin", "ECONOMY");
      if (roundTrip) params.set("returnDate", end);
    } else {
      params.set("end", end); params.set("hotelIds", hotelIds);
      params.set("city", String(data.get("city") || "")); params.set("nationality", "106");
    }
    setNotice("");
    startNavigation(() => router.push(`/book?${params}`));
  }

  return <div className="trip-home">
    <TravelHeader active={product === "FLIGHT" ? "flights" : "hotels"} onProductChange={changeProduct} />
    <main id="main-content">
      <section className="home-hero" style={{ backgroundImage: `linear-gradient(90deg,rgba(9,32,47,.82),rgba(9,32,47,.3) 59%,rgba(9,32,47,.04)),url(${photos.hero})` }} aria-labelledby="home-title">
        <div className="home-hero-copy"><p className="home-kicker"><span /> A LITTLE FURTHER. A LITTLE FREER.</p><h1 id="home-title">Go somewhere<br /><em>that stays with you.</em></h1><p>Beautiful beginnings. Thoughtful stays.<br />Your next great story starts with a trip.</p></div>
        <div className="home-hero-caption"><TravelIcon name="pin" size={16} /><span>Somewhere worth slowing down<br /><strong>The Maldives</strong></span></div>
        <div className="home-hero-stamp" aria-hidden="true"><TravelIcon name="globe" size={22} /><span>MORE WORLD.<br />MORE YOU.</span></div>
      </section>

      <section className="home-search-card" aria-label="Plan your trip">
        <div className="home-search-top"><div className="home-product-tabs" aria-label="Booking type"><button type="button" aria-pressed={product === "FLIGHT"} onClick={() => changeProduct("FLIGHT")}><TravelIcon name="plane" />Flights</button><button type="button" aria-pressed={product === "HOTEL"} onClick={() => changeProduct("HOTEL")}><TravelIcon name="hotel" />Hotels</button></div><span><TravelIcon name="shield" size={16} /> Your next trip, a little simpler.</span></div>
        <form ref={form} className="home-search-form" onSubmit={submit}>
          <div className="home-search-options">{product === "FLIGHT" ? <fieldset><legend className="visually-hidden">Journey type</legend><label><input type="radio" name="journey" checked={!roundTrip} onChange={() => setRoundTrip(false)} />One way</label><label><input type="radio" name="journey" checked={roundTrip} onChange={() => setRoundTrip(true)} />Round trip</label><span className="home-economy">Economy</span></fieldset> : <span className="home-stay-note"><TravelIcon name="hotel" size={16} />One room · Indian nationality</span>}<Link href={`/book?product=${product}`}>{product === "FLIGHT" ? "Multi-city, children or another cabin" : "More rooms, children or another nationality"}<TravelIcon name="chevron" size={13} /></Link></div>
          <div className={`home-search-fields ${product === "HOTEL" ? "is-hotel" : ""} ${roundTrip && product === "FLIGHT" ? "is-return" : ""}`}>
            {product === "FLIGHT" ? <div className="home-airports"><div className="home-search-input"><AirportPicker key={`from-${airportRevision}`} name="from" label="From airport" initialCode={airports.from} /><small>City or airport code</small></div><button className="home-swap" type="button" onClick={swapAirports} aria-label="Swap departure and arrival airports"><TravelIcon name="swap" size={16} /></button><div className="home-search-input"><AirportPicker key={`to-${airportRevision}`} name="to" label="To airport" initialCode={airports.to} /><small>Where to next?</small></div></div> : <div className="home-search-input home-hotel-destination"><HotelDestination initialQuery="" /><small>Select an available destination</small></div>}
            <label className="home-search-input home-date-label"><span>{product === "FLIGHT" ? "Departure" : "Check-in"}</span><input aria-label={product === "FLIGHT" ? "Departure" : "Check-in"} type="date" name="date" value={date} required min={dateAfter(0)} onChange={event => setDate(event.target.value)} /><small>{product === "FLIGHT" ? "Your journey begins" : "Time to check in"}</small></label>
            {(product === "HOTEL" || roundTrip) && <label className="home-search-input home-date-label"><span>{product === "FLIGHT" ? "Return" : "Check-out"}</span><input aria-label={product === "FLIGHT" ? "Return" : "Check-out"} type="date" name="end" value={end} required min={date} onChange={event => setEnd(event.target.value)} /><small>{product === "HOTEL" && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Your journey home"}</small></label>}
            <label className="home-search-input home-guests"><span>{product === "FLIGHT" ? "Travellers" : "Guests"}</span><select aria-label={product === "FLIGHT" ? "Travellers" : "Guests"} value={adults} onChange={event => setAdults(Number(event.target.value))}>{Array.from({ length: product === "FLIGHT" ? 9 : 4 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value} adult{value === 1 ? "" : "s"}</option>)}</select><small>{product === "FLIGHT" ? "12 years & above" : "1 room"}</small></label>
            <button className="home-search-submit" disabled={navigating} type="submit"><TravelIcon name="search" size={19} /><span>{navigating ? "Opening your search…" : product === "FLIGHT" ? "Search flights" : "Search stays"}</span><TravelIcon name="arrow" size={17} /></button>
          </div>
          {notice && <p className="home-search-error" role="alert">{notice}</p>}
        </form>
        <p className="home-search-footnote"><TravelIcon name="check" size={14} />Compare first. Review the full price and rules before you pay.</p>
      </section>

      <section className="home-confidence" aria-label="Plan with confidence"><div><TravelIcon name="receipt" /><span><strong>Clear before checkout</strong><small>Full total, without the guesswork</small></span></div><div><TravelIcon name="bag" /><span><strong>The details that matter</strong><small>Fares, baggage & cancellation rules</small></span></div><div><TravelIcon name="shield" /><span><strong>Your trip, in one place</strong><small>Booking updates & documents</small></span></div></section>

      <section className="home-discover" aria-labelledby="discover-heading"><div className="home-section-heading"><div><p className="home-kicker">A CHANGE OF SCENERY</p><h2 id="discover-heading">Where will you go next?</h2><p>For a long weekend, a fresh perspective, or no reason at all.</p></div><Link href="/book?product=HOTEL">Find your kind of stay<TravelIcon name="arrow" size={18} /></Link></div><div className="home-destinations">{[{ name: "Goa", image: photos.goa, mood: "SALT IN THE AIR", detail: "Slow days. Sea views. Your pace.", number: "01" }, { name: "Dubai", image: photos.dubai, mood: "A DIFFERENT PERSPECTIVE", detail: "Big city lights, bigger possibilities.", number: "02" }, { name: "Bali", image: photos.bali, mood: "FIND YOUR OWN RHYTHM", detail: "A little green. A little getaway.", number: "03" }].map(destination => <Link className="home-destination" href={`/book?product=HOTEL&city=${encodeURIComponent(destination.name)}`} key={destination.name} style={{ backgroundImage: `linear-gradient(0deg,rgba(8,26,37,.88),transparent 75%),url(${destination.image})` }} aria-label={`Explore stays in ${destination.name}`}><span className="home-destination-mood">{destination.mood}</span><span className="home-destination-number">{destination.number}</span><div><h3>{destination.name}</h3><p>{destination.detail}</p></div><span className="home-destination-arrow"><TravelIcon name="arrow" /></span></Link>)}</div></section>

      <section className="home-how"><div className="home-how-intro"><p className="home-kicker">GOOD TRIPS START WITH CLARITY</p><h2>Less second-guessing.<br /><em>More looking forward.</em></h2><p>A booking flow that makes room for the details, so you can focus on the destination.</p><Link href="/book" className="home-text-link">Let’s get you going<TravelIcon name="arrow" size={18} /></Link></div><ol className="home-how-steps"><li><span>01</span><div><h3>Find what fits</h3><p>Compare flight timings and fare options, or choose a room that suits your stay.</p></div></li><li><span>02</span><div><h3>Know what you’re booking</h3><p>Review the final price, inclusions and supplier rules before making a payment.</p></div></li><li><span>03</span><div><h3>Keep every detail together</h3><p>Follow confirmation updates and find your travel documents in My trips.</p></div></li></ol></section>

      <section className="home-business"><span className="home-business-icon"><TravelIcon name="bag" size={27} /></span><div><p className="home-kicker">MAX TRAVEL FOR BUSINESS</p><h2>A work trip. Not more work.</h2><p>Your company account, travellers and bookings. Together.</p></div><Link href="/account">Explore business travel<TravelIcon name="arrow" size={18} /></Link></section>
    </main>
    <TravelFooter />
  </div>;
}
