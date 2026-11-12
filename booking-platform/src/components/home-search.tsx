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
const destinations = [
  { name: "The Maldives", image: "/travel/maldives.jpg", alt: "Turquoise lagoon and overwater villas in the Maldives", detail: "Lagoons and overwater villas" },
  { name: "Goa", image: "/travel/goa.jpg", alt: "Goa's coastline", detail: "Beach days and coastal cafés" },
  { name: "Dubai", image: "/travel/dubai.jpg", alt: "Dubai's skyline", detail: "Skyline views and desert sunsets" },
  { name: "Bali", image: "/travel/bali.jpg", alt: "Ulun Danu Beratan temple reflected in a lake in Bali", detail: "Lakeside temples and island stays" },
];

function dateAfter(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return indiaToday(date);
}

export default function HomeSearch({ children }: { children: ReactNode }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [featured, setFeatured] = useState(destinations[0]);
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
        <div className="studio-hero-copy">
          <h1 id="home-title">Find your <em>next escape.</em></h1>
          <p>Beach days in Goa, city lights in Dubai, or somewhere you haven’t thought of yet.</p>
          <a className="hero-explore-link" href="#discover">Explore destinations <TravelIcon name="arrow" size={18} /></a>
        </div>
        <div className="studio-hero-photo">
          <Image src={featured.image} alt={featured.alt} fill sizes="(max-width: 1288px) 100vw, 1240px" preload={featured === destinations[0]} />
          <span role="status"><TravelIcon name="pin" size={15} />{featured.name}</span>
        </div>
        <div className="hero-destination-picker" role="group" aria-label="Preview a destination">
          {destinations.map(destination => (
            <button key={destination.name} type="button" aria-pressed={featured === destination} onClick={() => setFeatured(destination)}>
              {destination.name}
            </button>
          ))}
        </div>
      </section>

      <section id="trip-search" className="home-search-card" aria-label="Plan your trip">
        <div className="home-search-top"><div className="home-product-tabs" aria-label="Booking type"><button type="button" aria-pressed={product === "FLIGHT"} onClick={() => changeProduct("FLIGHT")}><TravelIcon name="plane" />Flights</button><button type="button" aria-pressed={product === "HOTEL"} onClick={() => changeProduct("HOTEL")}><TravelIcon name="hotel" />Hotels</button></div></div>
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
          {navigating&&<p role="status" className="home-navigation-status">Opening your search… Live availability will load on the next screen.</p>}
          {notice && <p id="home-search-error" className="home-search-error" role="alert">{notice}</p>}
        </form>
        <p className="home-search-footnote"><TravelIcon name="check" size={14} />Compare first. Review the full price and rules before you pay.</p>
      </section>

      <section className="home-confidence" aria-label="Plan with confidence"><div><TravelIcon name="receipt" /><span><strong>Clear before checkout</strong><small>Review the total and supplier rules</small></span></div><div><TravelIcon name="bag" /><span><strong>The details that matter</strong><small>Fares, baggage & cancellation rules</small></span></div><div><TravelIcon name="shield" /><span><strong>Your trip, in one place</strong><small>Updates and documents in My trips</small></span></div></section>

      <section id="discover" className="home-discover" aria-labelledby="discover-heading">
        <div className="home-section-heading">
          <div><h2 id="discover-heading">Pick a place to get away</h2></div>
          <Link href="/book?product=HOTEL">Search all stays <TravelIcon name="arrow" size={18} /></Link>
        </div>
        <div className="home-destinations">
          {destinations.map(destination => (
            <Link className="home-destination" href={`/book?product=HOTEL&city=${encodeURIComponent(destination.name === "The Maldives" ? "Maldives" : destination.name)}`} key={destination.name} aria-label={`Explore stays in ${destination.name}`}>
              <Image className="home-destination-photo" src={destination.image} alt="" fill sizes="(max-width: 700px) 90vw, 50vw" loading="lazy" />
              <span className="home-destination-shade" aria-hidden="true" />
              <div><h3>{destination.name}</h3><p>{destination.detail}</p></div>
              <span className="home-destination-arrow"><TravelIcon name="arrow" /></span>
            </Link>
          ))}
        </div>
      </section>

      <HomePackages />

      {children}

    </main>
    <TravelFooter />
  </div>;
}
