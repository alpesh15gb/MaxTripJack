"use client";

import Link from "next/link";
import { HomePackages } from "./home-packages";
import "@/app/home-packages.css";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition, type ReactNode } from "react";
import AirportPicker from "@/components/airport-picker";
import HotelDestination from "@/components/hotel-destination";
import { indiaToday } from "@/lib/booking-presentation";
import { FARE_CALENDAR_MAX_DAYS } from "@/lib/fare-calendar-core";
import {bookingSearchInput,searchFormIsValid} from '@/lib/booking-search-input';
import {invalidateBackgroundSearch} from '@/lib/background-search';
import useBackgroundSearch from './use-background-search';
import FareDatePicker from './fare-date-picker';
import TravellersPicker from './travellers-picker';
import useFareCalendar from './use-fare-calendar';
import "@/app/search-pickers.css";
import { TravelFooter, TravelHeader, TravelIcon } from "@/components/travel-shell";

type Product = "FLIGHT" | "HOTEL";
type SearchDraft = {
  date: string;
  end: string;
  adults: number;
  children: number;
  infants: number;
  cabin: string;
};
const destinations = [
  { name: "The Maldives", image: "/travel/maldives.jpg", alt: "Turquoise lagoon and overwater villas in the Maldives", detail: "Lagoons and overwater villas" },
  { name: "Goa", image: "/travel/goa.jpg", alt: "Goa's coastline", detail: "Beach days and coastal cafés" },
  { name: "Dubai", image: "/travel/dubai.jpg", alt: "Dubai's skyline", detail: "Skyline views and desert sunsets" },
  { name: "Bali", image: "/travel/bali.jpg", alt: "Ulun Danu Beratan temple reflected in a lake in Bali", detail: "Lakeside temples and island stays" },
];
const heroDestinations = [
  { name: "Paris", image: "/travel/paris-evening.webp", alt: "The Eiffel Tower and the Seine at blue hour" },
  ...destinations,
];

function shiftDate(value: string, days: number) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function dateAfter(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return indiaToday(date);
}

function initialDraft(): SearchDraft {
  const date = dateAfter(7);
  return { date, end: shiftDate(date, 3), adults: 1, children: 0, infants: 0, cabin: "ECONOMY" };
}

function readAirportFields(form: HTMLFormElement | null) {
  if (!form) return null;
  const from = form.querySelector<HTMLInputElement>('[data-airport-query="from"]');
  const to = form.querySelector<HTMLInputElement>('[data-airport-query="to"]');
  return from && to ? { from: from.value, to: to.value } : null;
}

export default function HomeSearch({ children }: { children: ReactNode }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [featured, setFeatured] = useState(heroDestinations[0]);
  const [product, setProduct] = useState<Product>("FLIGHT");
  const [airports, setAirports] = useState({ from: "Mumbai (BOM)", to: "New Delhi (DEL)" });
  const [airportRevision, setAirportRevision] = useState(0);
  const [hotelDestination,setHotelDestination] = useState({city:"",hotelIds:"",regionId:"",destinationCursor:""});
  const [drafts, setDrafts] = useState<Record<Product, SearchDraft>>(() => ({
    FLIGHT: initialDraft(),
    HOTEL: initialDraft(),
  }));
  const { date, end, adults, children: childCount, infants, cabin } = drafts[product];
  const [roundTrip, setRoundTrip] = useState(false);
  const [notice, setNotice] = useState("");
  const [codes, setCodes] = useState({ from: "BOM", to: "DEL" });
  const setFromCode = useCallback((code: string) => setCodes(current => current.from === code ? current : { ...current, from: code }), []);
  const setToCode = useCallback((code: string) => setCodes(current => current.to === code ? current : { ...current, to: code }), []);
  const today = dateAfter(0);
  const fareMonth = `${date.slice(0, 7)}-01`;
  const showFlightFares = product === "FLIGHT" && !roundTrip && childCount === 0 && infants === 0;
  const outbound = useFareCalendar({
    from: codes.from, to: codes.to, cabin, start: fareMonth > today ? fareMonth : today,
    days: FARE_CALENDAR_MAX_DAYS, enabled: showFlightFares,
  });
  const [navigating, startNavigation] = useTransition();
  const nights = Math.round((Date.parse(end) - Date.parse(date)) / 86400000);

  function updateDraft(change: Partial<SearchDraft>) {
    setDrafts(current => ({ ...current, [product]: { ...current[product], ...change } }));
    backgroundSearch.interact();
  }

  function currentSearchInput(data:FormData){
    data.set('cabin',cabin);data.set('nationality','106');
    if(product==='FLIGHT'&&roundTrip)data.set('returnDate',end);else data.delete('returnDate');
    return bookingSearchInput(data,{product,adults,children:childCount,infants,hotelOccupancy:[{adults,childAge:[]}]});
  }
  const backgroundSearch=useBackgroundSearch({form,enabled:!navigating,read:()=>{
    if(!form.current||!searchFormIsValid(form.current))return null;
    try{return currentSearchInput(new FormData(form.current));}catch{return null;}
  }});

  function changeProduct(next: Product) {
    if (next === product) return;
    backgroundSearch.pause();invalidateBackgroundSearch();
    if (product === "FLIGHT") {
      const fields = readAirportFields(form.current);
      if (fields) setAirports(fields);
    }
    if(product === "HOTEL" && form.current){const data=new FormData(form.current);setHotelDestination({city:String(data.get("city")||""),hotelIds:String(data.get("hotelIds")||""),regionId:String(data.get("regionId")||""),destinationCursor:String(data.get("destinationCursor")||"")});}
    setProduct(next);
    setNotice("");
  }

  function openSearch(next: Product) {
    changeProduct(next);
    const search = document.getElementById('trip-search');
    search?.scrollIntoView({block:'start'});
    search?.focus({preventScroll:true});
  }

  function swapAirports() {
    const fields = readAirportFields(form.current);
    if (!fields) return;
    setAirports({ from: fields.to, to: fields.from });
    setAirportRevision(value => value + 1);
  }

  function advancedSearch() {
    backgroundSearch.pause();
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
      params.set("regionId",String(data.get("regionId")||"")); params.set("destinationCursor",String(data.get("destinationCursor")||""));
    }
    router.push(`/book?${params}`);
  }

  function clearCorrectableNotice(event: React.FormEvent<HTMLFormElement>) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (field.name === "city" && notice === "Choose a destination from the available suggestions before searching.") setNotice("");
    if (field.dataset.airportQuery && [
      "Choose different departure and arrival airports.",
      "Select a departure and arrival airport, or enter their three-letter airport codes.",
    ].includes(notice)) setNotice("");
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
    if (product === "HOTEL" && !hotelIds && !(data.get("regionId") && data.get("destinationCursor"))) {
      setNotice("Choose a destination from the available suggestions before searching.");
      event.currentTarget.querySelector<HTMLInputElement>('input[name="city"]')?.focus();
      return;
    }
    const params = new URLSearchParams({ product, autoSearch: "1", date, adults: String(adults) });
    if (product === "FLIGHT") {
      params.set("from", from); params.set("to", to); params.set("cabin", cabin); params.set("children", String(childCount)); params.set("infants", String(infants));
      if (roundTrip) params.set("returnDate", end);
    } else {
      params.set("end", end); params.set("hotelIds", hotelIds);
      params.set("regionId",String(data.get("regionId")||"")); params.set("destinationCursor",String(data.get("destinationCursor")||""));
      params.set("city", String(data.get("city") || "")); params.set("nationality", "106");
    }
    setNotice("");
    // Exact criteria stay in JS memory across the client navigation. An incomplete
    // destination batch simply uses the normal /book mapping/search path.
    try{backgroundSearch.warmOnSubmit(currentSearchInput(data));}catch{backgroundSearch.pause();}
    startNavigation(() => router.push(`/book?${params}`));
  }

  return <div className="trip-home">
    <TravelHeader active={product === "FLIGHT" ? "flights" : "hotels"} onProductChange={openSearch} />
    <main id="main-content">
      <section className="home-intro" aria-labelledby="home-title">
        <div className="studio-hero-copy">
          <h1 id="home-title">Find your <em>next escape.</em></h1>
          <p>Flights, distinctive stays and holidays from Goa to Paris.</p>
          <div className="home-hero-actions">
            <a className="hero-explore-link" href="#discover">Explore destinations <TravelIcon name="arrow" size={17} /></a>
            <a className="hero-search-link" href="#trip-search">Plan a trip</a>
          </div>
        </div>
        <div className="studio-hero-photo">
          <Image src={featured.image} alt={featured.alt} fill sizes="100vw" preload={featured === heroDestinations[0]} />
          <span role="status"><TravelIcon name="pin" size={15} />{featured.name}</span>
        </div>
        <div className="hero-destination-picker" role="group" aria-label="Preview a destination">
          {heroDestinations.map(destination => (
            <button key={destination.name} type="button" aria-pressed={featured === destination} onClick={() => setFeatured(destination)}>
              {destination.name}
            </button>
          ))}
        </div>
      </section>

      <section id="trip-search" className="home-search-card" aria-label="Plan your trip" tabIndex={-1}>
        <div className="home-search-top">
          <div className="home-search-heading"><div aria-hidden="true"><TravelIcon name={product === "FLIGHT" ? "airplane" : "bed"} size={21} /></div><h2>{product === "FLIGHT" ? "Find a flight" : "Find a stay"}</h2></div>
          <div className="home-product-tabs" aria-label="Booking type"><button type="button" aria-pressed={product === "FLIGHT"} onClick={() => changeProduct("FLIGHT")}><TravelIcon name="plane" />Flights</button><button type="button" aria-pressed={product === "HOTEL"} onClick={() => changeProduct("HOTEL")}><TravelIcon name="hotel" />Hotels</button></div>
        </div>
        <form ref={form} className="home-search-form" aria-describedby={notice ? "home-search-error" : undefined} onChange={clearCorrectableNotice} onSubmit={submit}>
          <div className="home-search-options">{product === "FLIGHT" ? <fieldset><legend className="visually-hidden">Journey type</legend><label><input type="radio" name="journey" checked={!roundTrip} onChange={() => setRoundTrip(false)} />One way</label><label><input type="radio" name="journey" checked={roundTrip} onChange={() => setRoundTrip(true)} />Round trip</label></fieldset> : <span className="home-stay-note"><TravelIcon name="hotel" size={16} />One room · Indian nationality</span>}<button type="button" className="home-advanced-link" onClick={advancedSearch}>{product === "FLIGHT" ? "More search options" : "More rooms, children or another nationality"}<TravelIcon name="chevron" size={13} /></button></div>
          <div className={`home-search-fields ${product === "HOTEL" ? "is-hotel" : ""} ${roundTrip && product === "FLIGHT" ? "is-return" : ""}`}>
            {product === "FLIGHT" ? <div className="home-airports"><div className="home-search-input"><AirportPicker key={`from-${airportRevision}`} name="from" label="From airport" initialCode={airports.from} showSelectedCode onCodeChange={setFromCode} /></div><button className="home-swap" type="button" onClick={swapAirports} aria-label="Swap departure and arrival airports"><TravelIcon name="swap" size={16} /></button><div className="home-search-input"><AirportPicker key={`to-${airportRevision}`} name="to" label="To airport" initialCode={airports.to} showSelectedCode onCodeChange={setToCode} /></div></div> : <div className="home-search-input home-hotel-destination"><HotelDestination initialQuery={hotelDestination.city} initialHotelIds={hotelDestination.hotelIds.split(",").filter(Boolean)} initialRegionId={hotelDestination.regionId} initialDestinationCursor={hotelDestination.destinationCursor} /><small>Select an available destination</small></div>}
            <FareDatePicker name="date" label={product === "FLIGHT" ? "Departure" : "Check-in"} value={date} min={today} fares={showFlightFares ? outbound.days : undefined} onChange={value => {
              const minimumEnd = product === "HOTEL" ? shiftDate(value, 1) : value;
              updateDraft({ date: value, end: end >= minimumEnd ? end : shiftDate(value, product === "HOTEL" ? 1 : 3) });
            }} />
            {(product === "HOTEL" || roundTrip) && <FareDatePicker name="end" label={product === "FLIGHT" ? "Return" : "Check-out"} value={end} min={product === "HOTEL" ? shiftDate(date, 1) : date} rangeStart={date} helper={product === "HOTEL" && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : undefined} onChange={value => updateDraft({ end: value })} />}
            <TravellersPicker product={product} adults={adults} childCount={childCount} infants={infants} cabin={cabin} onChange={updateDraft} />
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
          <div><h2 id="discover-heading">Where to next?</h2></div>
          <Link href="/book?product=HOTEL">Search all stays <TravelIcon name="arrow" size={18} /></Link>
        </div>
        <div className="home-destinations">
          {[destinations[1], destinations[0], ...destinations.slice(2)].map(destination => (
            <Link className="home-destination" href={`/book?product=HOTEL&city=${encodeURIComponent(destination.name === "The Maldives" ? "Maldives" : destination.name)}`} key={destination.name} aria-label={`Explore stays in ${destination.name}`}>
              <Image className="home-destination-photo" src={destination.image} alt="" fill sizes="(max-width: 700px) 50vw, (max-width: 1280px) 40vw, 520px" loading="lazy" />
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
