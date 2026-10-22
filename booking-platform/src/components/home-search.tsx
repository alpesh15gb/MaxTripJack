"use client";

import Link from "next/link";
import { HomePackages } from "./home-packages";
import "@/app/home-packages.css";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
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

export default function HomeSearch({ children }: { children: ReactNode }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [product, setProduct] = useState<Product>("FLIGHT");
  const [airports, setAirports] = useState({ from: "Mumbai (BOM)", to: "New Delhi (DEL)" });
  const [airportRevision, setAirportRevision] = useState(0);
  const [date, setDate] = useState(() => dateAfter(7));
  const [end, setEnd] = useState(() => dateAfter(10));
  const [adults, setAdults] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabin, setCabin] = useState("ECONOMY");
  const [roundTrip, setRoundTrip] = useState(false);
  const [notice, setNotice] = useState("");
  const [navigating, startNavigation] = useTransition();
  const nights = Math.round((Date.parse(end) - Date.parse(date)) / 86400000);

  function changeProduct(next: Product) {
    if (product === "FLIGHT" && form.current) {
      const data = new FormData(form.current);
      setAirports({ from: String(data.get("from") || ""), to: String(data.get("to") || "") });
      setAirportRevision(value => value + 1);
    }
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

  function advancedSearch() {
    const data = form.current ? new FormData(form.current) : new FormData();
    const params = new URLSearchParams({ product, date, adults: String(adults) });
    if (product === "FLIGHT") {
      params.set("from", String(data.get("from") || ""));
      params.set("to", String(data.get("to") || ""));
      params.set("cabin", cabin); params.set("children", String(childCount)); params.set("infants", String(infants));
      if (roundTrip) params.set("returnDate", end);
    } else {
      params.set("end", end); params.set("city", String(data.get("city") || ""));
      params.set("hotelIds", String(data.get("hotelIds") || ""));
    }
    router.push(`/book?${params}`);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (navigating) return;
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") || "").toUpperCase();
    const to = String(data.get("to") || "").toUpperCase();
    if (date < dateAfter(0)) { setNotice("Choose today or a future date for your trip."); return; }
    if (product === "FLIGHT" && (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to))) { setNotice("Select a departure and arrival airport, or enter their three-letter airport codes."); return; }
    if (product === "FLIGHT" && from === to) { setNotice("Choose different departure and arrival airports."); form.current?.querySelector<HTMLInputElement>('[aria-label="To airport"]')?.focus(); return; }
    if (product === "HOTEL" && (!end || end <= date)) { setNotice("Check-out must be after check-in. Choose at least one night."); return; }
    if (product === "FLIGHT" && roundTrip && (!end || end < date)) { setNotice("Your return date cannot be before your departure."); return; }
    if (product === "FLIGHT" && adults + childCount > 9) { setNotice("Choose up to 9 adults and children in one search."); return; }
    if (product === "FLIGHT" && infants > adults) { setNotice("Each infant must travel with an adult."); return; }
    const hotelIds = String(data.get("hotelIds") || "");
    if (product === "HOTEL" && !hotelIds) { setNotice("Choose a destination from the available suggestions before searching."); return; }
    const params = new URLSearchParams({ product, autoSearch: "1", date, adults: String(adults) });
    if (product === "FLIGHT") {
      params.set("from", from); params.set("to", to); params.set("cabin", cabin); params.set("children", String(childCount)); params.set("infants", String(infants));
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
      <section className="home-intro" aria-labelledby="home-title">
        <div className="studio-hero-copy"><p className="home-kicker"><span aria-hidden="true">✦</span> THE JOURNEY STUDIO</p><h1 id="home-title">A great trip starts with <em>a clear plan.</em></h1><p>Flights, stays and thoughtfully planned journeys.<span className="studio-hero-support">A little less searching. A lot more looking forward.</span></p><span className="studio-hero-signature">Your world. Your kind of journey.</span></div>
        <div className="studio-hero-photo"><Image src={photos.hero} alt="Turquoise lagoon and overwater villas in the Maldives" fill sizes="(max-width:700px) 38vw, 48vw" priority/><span><TravelIcon name="pin" size={15}/>The Maldives · Travel inspiration</span><div className="studio-photo-note" aria-hidden="true">Somewhere<br/><em>different.</em></div></div>
      </section>

      <section id="trip-search" className="home-search-card" aria-label="Plan your trip">
        <div className="home-search-top"><div className="home-product-tabs" aria-label="Booking type"><button type="button" aria-pressed={product === "FLIGHT"} onClick={() => changeProduct("FLIGHT")}><TravelIcon name="plane" />Flights</button><button type="button" aria-pressed={product === "HOTEL"} onClick={() => changeProduct("HOTEL")}><TravelIcon name="hotel" />Hotels</button></div><span><TravelIcon name="shield" size={16} /> Flights, stays & a fresh start.</span></div>
        <form ref={form} className="home-search-form" aria-describedby={notice?'home-search-error':undefined} onChange={event=>{const target=event.target;if(target instanceof HTMLInputElement&&['From airport','To airport'].includes(target.getAttribute('aria-label')??'')&&['Choose different departure and arrival airports.','Select a departure and arrival airport, or enter their three-letter airport codes.'].includes(notice))setNotice('');}} onSubmit={submit}>
          <div className="home-search-options">{product === "FLIGHT" ? <fieldset><legend className="visually-hidden">Journey type</legend><label><input type="radio" name="journey" checked={!roundTrip} onChange={() => setRoundTrip(false)} />One way</label><label><input type="radio" name="journey" checked={roundTrip} onChange={() => setRoundTrip(true)} />Round trip</label><span className="home-economy">{cabin.replaceAll("_", " ").toLowerCase()}</span></fieldset> : <span className="home-stay-note"><TravelIcon name="hotel" size={16} />One room · Indian nationality</span>}<button type="button" className="home-advanced-link" onClick={advancedSearch}>{product === "FLIGHT" ? "More search options" : "More rooms, children or another nationality"}<TravelIcon name="chevron" size={13} /></button></div>
          {product === "FLIGHT" && <details className="home-party-options"><summary>Children, infants & cabin <span>{childCount||infants||cabin!=="ECONOMY"?`${childCount} children · ${infants} infants · ${cabin.replaceAll("_", " ").toLowerCase()}`:""}</span></summary><div><label>Children · age 2–11<select aria-label="Children · age 2–11" value={childCount} onChange={event => setChildCount(Number(event.target.value))}>{Array.from({length: 10 - adults}, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label><label>Infants · under 2<select aria-label="Infants · under 2" value={infants} onChange={event => setInfants(Number(event.target.value))}>{Array.from({length: adults + 1}, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label><label>Cabin<select aria-label="Cabin" value={cabin} onChange={event => setCabin(event.target.value)}><option value="ECONOMY">Economy</option><option value="PREMIUM_ECONOMY">Premium economy</option><option value="BUSINESS">Business</option><option value="FIRST">First</option></select></label></div><p>Up to 9 adults and children. Each infant travels with an adult. Ages apply on the travel date.</p></details>}
          <div className={`home-search-fields ${product === "HOTEL" ? "is-hotel" : ""} ${roundTrip && product === "FLIGHT" ? "is-return" : ""}`}>
            {product === "FLIGHT" ? <div className="home-airports"><div className="home-search-input"><AirportPicker key={`from-${airportRevision}`} name="from" label="From airport" initialCode={airports.from} showSelectedCode /></div><button className="home-swap" type="button" onClick={swapAirports} aria-label="Swap departure and arrival airports"><TravelIcon name="swap" size={16} /></button><div className="home-search-input"><AirportPicker key={`to-${airportRevision}`} name="to" label="To airport" initialCode={airports.to} showSelectedCode /></div></div> : <div className="home-search-input home-hotel-destination"><HotelDestination initialQuery="" /><small>Select an available destination</small></div>}
            <label className="home-search-input home-date-label"><span>{product === "FLIGHT" ? "Departure" : "Check-in"}</span><input aria-label={product === "FLIGHT" ? "Departure" : "Check-in"} type="date" name="date" value={date} required min={dateAfter(0)} onChange={event => setDate(event.target.value)} /><small>{product === "FLIGHT" ? "Your journey begins" : "Time to check in"}</small></label>
            {(product === "HOTEL" || roundTrip) && <label className="home-search-input home-date-label"><span>{product === "FLIGHT" ? "Return" : "Check-out"}</span><input aria-label={product === "FLIGHT" ? "Return" : "Check-out"} type="date" name="end" value={end} required min={date} onChange={event => setEnd(event.target.value)} /><small>{product === "HOTEL" && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Your journey home"}</small></label>}
            <label className="home-search-input home-guests"><span>{product === "FLIGHT" ? "Travellers" : "Guests"}</span><select aria-label={product === "FLIGHT" ? "Travellers" : "Guests"} value={adults} onChange={event => { const count = Number(event.target.value); setAdults(count); setChildCount(value => Math.min(value, 9 - count)); setInfants(value => Math.min(value, count)); }}>{Array.from({ length: product === "FLIGHT" ? 9 : 4 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value} adult{value === 1 ? "" : "s"}</option>)}</select><small>{product === "FLIGHT" ? "12 years & above" : "1 room"}</small></label>
            <button className="home-search-submit" disabled={navigating} type="submit"><TravelIcon name="search" size={19} /><span>{navigating ? "Opening your search…" : product === "FLIGHT" ? "Search flights" : "Search stays"}</span><TravelIcon name="arrow" size={17} /></button>
          </div>
          {notice && <p id="home-search-error" className="home-search-error" role="alert">{notice}</p>}
        </form>
        <p className="home-search-footnote"><TravelIcon name="check" size={14} />Compare first. Review the full price and rules before you pay.</p>
      </section>

      <section className="home-confidence" aria-label="Plan with confidence"><div><TravelIcon name="receipt" /><span><strong>Clear before checkout</strong><small>Review the total and supplier rules</small></span></div><div><TravelIcon name="bag" /><span><strong>The details that matter</strong><small>Fares, baggage & cancellation rules</small></span></div><div><TravelIcon name="shield" /><span><strong>Your trip, in one place</strong><small>Updates and documents in My trips</small></span></div></section>

      <HomePackages/>

      <section className="home-discover" aria-labelledby="discover-heading"><div className="home-section-heading"><div><p className="home-kicker">A CHANGE OF SCENERY</p><h2 id="discover-heading">Where will you go next?</h2><p>For a long weekend, a fresh perspective, or no reason at all.</p></div><Link href="/book?product=HOTEL">Find your kind of stay<TravelIcon name="arrow" size={18} /></Link></div><div className="home-destinations">{[{ name: "Goa", image: photos.goa, mood: "SALT IN THE AIR", detail: "Slow days. Sea views. Your pace.", number: "01" }, { name: "Dubai", image: photos.dubai, mood: "A DIFFERENT PERSPECTIVE", detail: "Big city lights, bigger possibilities.", number: "02" }, { name: "Bali", image: photos.bali, mood: "FIND YOUR OWN RHYTHM", detail: "A little green. A little getaway.", number: "03" }].map(destination => <Link className="home-destination" href={`/book?product=HOTEL&city=${encodeURIComponent(destination.name)}`} key={destination.name} style={{ backgroundImage: `linear-gradient(0deg,rgba(8,26,37,.88),transparent 75%),url(${destination.image})` }} aria-label={`Explore stays in ${destination.name}`}><span className="home-destination-mood">{destination.mood}</span><span className="home-destination-number">{destination.number}</span><div><h3>{destination.name}</h3><p>{destination.detail}</p></div><span className="home-destination-arrow"><TravelIcon name="arrow" /></span></Link>)}</div></section>

      {children}

    </main>
    <TravelFooter />
  </div>;
}
