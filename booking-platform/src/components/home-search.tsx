"use client";

import Link from "next/link";
import { HomePackages } from "./home-packages";
import "@/app/home-packages.css";
import { useCompanyProfile } from "./company-profile-context";
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
import TravellersPicker, {cabinChoices} from './travellers-picker';
import useFareCalendar from './use-fare-calendar';
import "@/app/search-pickers.css";
import { TravelFooter, TravelHeader, TravelIcon } from "@/components/travel-shell";
import {StitchSymbol} from "./stitch-symbol";
import {HomeDisclosure} from "./home-disclosure";

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
  { name: "Goa", slug: "goa", airports: "GOI/GOX", detail: "Beach days, coastal cafés and heritage quarters", theme: "Coastal escape" },
  { name: "The Maldives", slug: "maldives", airports: "MLE", detail: "Turquoise lagoons and overwater villas", theme: "Island stays" },
  { name: "Dubai", slug: "dubai", airports: "DXB", detail: "Skyline panoramas and desert sunsets", theme: "City breaks" },
  { name: "Bali", slug: "bali", airports: "DPS", detail: "Lakeside temples and island jungle stays", theme: "Island discovery" },
  { name: "Paris", slug: "paris", airports: "CDG", detail: "Boulevard cafés and distinctive boutique hotels", theme: "European escapes" },
];
const hubs = [destinations[4], destinations[1], destinations[0], destinations[2], destinations[3]];
const cities: Record<string,string> = { HYD:"Hyderabad", DEL:"New Delhi", BOM:"Mumbai", GOI:"Goa", DXB:"Dubai", BLR:"Bengaluru" };
const popularPairs = [["HYD","DEL"], ["DEL","BOM"], ["BOM","GOI"], ["HYD","DXB"], ["DEL","BLR"], ["BLR","HYD"]];
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

export default function HomeSearch({ children, offers, guides, assistantEnabled }: { children: ReactNode; offers: ReactNode; guides: ReactNode; assistantEnabled: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const company = useCompanyProfile();
  const [featured, setFeatured] = useState<typeof destinations[number] | null>(null);
  const [product, setProduct] = useState<Product>("FLIGHT");
  const [airports, setAirports] = useState({ from: "Mumbai (BOM)", to: "New Delhi (DEL)" });
  const [airportRevision, setAirportRevision] = useState(0);
  const [destinationResolving,setDestinationResolving]=useState(false);
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
  const featuredStay = new URLSearchParams({
    product: "HOTEL", city: featured?.name.replace(/^The /, "") ?? "",
    date: drafts.HOTEL.date, end: drafts.HOTEL.end, adults: String(drafts.HOTEL.adults),
  });

  function updateDraft(change: Partial<SearchDraft>) {
    setDrafts(current => ({ ...current, [product]: { ...current[product], ...change } }));
    backgroundSearch.interact();
  }

  function currentSearchInput(data:FormData){
    data.set('cabin',cabin);data.set('nationality','106');
    if(product==='FLIGHT'&&roundTrip)data.set('returnDate',end);else data.delete('returnDate');
    return bookingSearchInput(data,{product,adults,children:childCount,infants,hotelOccupancy:[{adults,childAge:[]}]});
  }
  const backgroundSearch=useBackgroundSearch({form,enabled:!navigating&&!destinationResolving,read:()=>{
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
    requestAnimationFrame(() => {
      const search = document.getElementById('trip-search');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      search?.focus({preventScroll: true});
      search?.scrollIntoView({block: 'start', behavior: reducedMotion ? 'instant' : 'smooth'});
    });
  }

  function swapAirports() {
    const fields = readAirportFields(form.current);
    if (!fields) return;
    setAirports({ from: fields.to, to: fields.from });
    setAirportRevision(value => value + 1);
  }

  function advancedSearch(multiCity = false) {
    if(product==="HOTEL"&&destinationResolving)return;
    backgroundSearch.pause();
    const data = form.current ? new FormData(form.current) : new FormData();
    const params = new URLSearchParams({ product, date, adults: String(adults) });
    if (product === "FLIGHT") {
      params.set("from", String(data.get("from") || ""));
      params.set("to", String(data.get("to") || ""));
      params.set("cabin", cabin); params.set("children", String(childCount)); params.set("infants", String(infants));
      if (multiCity) params.set("journey", "multi");
      else if (roundTrip) params.set("returnDate", end);
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
    if (navigating || (product === "HOTEL" && destinationResolving)) return;
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

  const selectPair = (from: string, to: string) => {
    setAirports({ from: `${cities[from]} (${from})`, to: `${cities[to]} (${to})` });
    setCodes({from, to});
    setAirportRevision(value => value + 1);
    setNotice("");
    backgroundSearch.interact();
  };
  const hubLinks = <div role="group" aria-label="Preview a destination" className="stitch-hubs">
    <span>Trending hubs</span>
    {hubs.map(hub => <button key={hub.slug} type="button" aria-label={hub.name} aria-pressed={featured === hub} onClick={() => setFeatured(hub)}>{hub.name} <span>({hub.airports})</span></button>)}
    {featured && <Link href={`/book?${featuredStay}`}>Find stays in {featured.name.replace(/^The /,"the ")} <TravelIcon name="arrow" size={14}/></Link>}
  </div>;
  return <div className="trip-home stitch-home">
    <TravelHeader active={product === "FLIGHT" ? "flights" : "hotels"} onProductChange={openSearch} />
    <main id="main-content">
      <section className="stitch-home-hero" aria-labelledby="home-title">
        <svg aria-hidden="true" focusable="false" className="stitch-flight-paths" viewBox="0 0 1440 600" fill="none">
          <path d="M-100 480C200 400 450 180 800 240C1150 300 1300 120 1600 80" stroke="currentColor" strokeDasharray="8 8" strokeWidth="2"/>
          <path d="M100 580C360 480 620 310 940 340C1260 370 1420 220 1680 180" stroke="currentColor" strokeDasharray="6 6" strokeWidth="1.5"/>
          <g fill="currentColor"><circle cx="800" cy="240" r="5"/><circle cx="940" cy="340" r="4"/><circle cx="450" cy="380" r="4"/><circle cx="1200" cy="190" r="6"/></g>
        </svg>
        <div className="stitch-home-wrap">
          <div className="stitch-office-line"><span><i aria-hidden="true"/> {company.address.addressLocality} office · {company.hours.opens} – {company.hours.closes} IST</span>{company.gstNumber && <span>GST registered · {company.gstNumber}</span>}<a href={company.phoneHref}>Concierge hotline <b>{company.phone}</b></a>
            {assistantEnabled&&<button type="button" className="stitch-home-ai-trigger" aria-label="Open Max AI travel assistant" aria-haspopup="dialog" onClick={event=>event.currentTarget.dispatchEvent(new Event('maxtravel:open-assistant',{bubbles:true}))}>Ask Max AI</button>}
          </div>
          <h1 id="home-title">Find your <em>next escape.</em></h1>
          <p>Flights, distinctive stays and <span className="stitch-wide-only">curated boutique </span>holidays from Goa to Paris.<span className="stitch-wide-only"> Compare live availability and review the full price with our Secunderabad concierge team.</span></p>
          <div className="stitch-hubs-desktop">{hubLinks}</div>
        </div>
      </section>

      <section id="trip-search" className="home-search-card" aria-label="Plan your trip" tabIndex={-1}>
        <div className="stitch-product-nav">
          <div className="home-product-tabs" aria-label="Booking type">
            <button type="button" aria-pressed={product === "FLIGHT"} onClick={() => changeProduct("FLIGHT")}><StitchSymbol name="flight_takeoff"/>Flights</button>
            <button type="button" aria-pressed={product === "HOTEL"} onClick={() => changeProduct("HOTEL")}><StitchSymbol name="hotel"/>Hotels</button>
            <Link href="/packages"><StitchSymbol name="beach_access"/>Holiday packages</Link>
            <Link href="/visa-guide"><StitchSymbol name="assignment_turned_in"/>Visas</Link>
            <Link href="/travel-insurance-guide"><StitchSymbol name="verified_user"/>Travel insurance</Link>
          </div>
          <Link className="stitch-assurance" href="/pricing-transparency">Book with assurance <b>Pricing transparency</b></Link>
        </div>
        <form ref={form} className="home-search-form" aria-describedby={notice ? "home-search-error" : undefined} onChange={clearCorrectableNotice} onSubmit={submit}>
          <div className="home-search-options">{product === "FLIGHT" ? <fieldset><legend className="visually-hidden">Journey type</legend><label><input type="radio" name="journey" checked={!roundTrip} onChange={() => setRoundTrip(false)} />One way</label><label><input type="radio" name="journey" checked={roundTrip} onChange={() => setRoundTrip(true)} />Round trip</label><button className="stitch-multicity" type="button" onClick={() => advancedSearch(true)}>Multi-city</button></fieldset> : <span className="home-stay-note"><TravelIcon name="hotel" size={16} />One room · Indian nationality</span>}{product === "FLIGHT" && <div className="stitch-cabin-shortcuts" role="group" aria-label="Quick cabin selection"><span>Cabin class</span>{cabinChoices.map(([value,label])=><button type="button" key={value} aria-pressed={cabin === value} onClick={()=>updateDraft({cabin:value})}>{label}</button>)}</div>}<button type="button" className="home-advanced-link" onClick={() => advancedSearch()} aria-label={product === "FLIGHT" ? "More search options" : "More rooms, children or another nationality"}><span>{product === "FLIGHT" ? "More search options" : "More rooms, children or another nationality"}</span><StitchSymbol name="tune" size={16}/></button></div>
          <div className={`home-search-fields ${product === "HOTEL" ? "is-hotel" : ""} ${roundTrip && product === "FLIGHT" ? "is-return" : ""}`}>
            {product === "FLIGHT" ? <div className="home-airports"><div className="home-search-input"><AirportPicker key={`from-${airportRevision}`} name="from" label="From airport" initialCode={airports.from} showSelectedCode onCodeChange={setFromCode} /></div><button className="home-swap" type="button" onClick={swapAirports} aria-label="Swap departure and arrival airports"><TravelIcon name="swap" size={16} /></button><div className="home-search-input"><AirportPicker key={`to-${airportRevision}`} name="to" label="To airport" initialCode={airports.to} showSelectedCode onCodeChange={setToCode} /></div></div> : <div className="home-search-input home-hotel-destination"><HotelDestination initialQuery={hotelDestination.city} initialHotelIds={hotelDestination.hotelIds.split(",").filter(Boolean)} initialRegionId={hotelDestination.regionId} initialDestinationCursor={hotelDestination.destinationCursor} onResolvingChange={setDestinationResolving} /><small>Select an available destination</small></div>}
            <FareDatePicker name="date" label={product === "FLIGHT" ? "Departure" : "Check-in"} value={date} min={today} fares={showFlightFares ? outbound.days : undefined} onChange={value => {
              const minimumEnd = product === "HOTEL" ? shiftDate(value, 1) : value;
              updateDraft({ date: value, end: end >= minimumEnd ? end : shiftDate(value, product === "HOTEL" ? 1 : 3) });
            }} />
            {(product === "HOTEL" || roundTrip) && <FareDatePicker name="end" label={product === "FLIGHT" ? "Return" : "Check-out"} value={end} min={product === "HOTEL" ? shiftDate(date, 1) : date} rangeStart={date} helper={product === "HOTEL" && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : undefined} onChange={value => updateDraft({ end: value })} />}
            {product === "FLIGHT" && !roundTrip && <button className="stitch-add-return" type="button" onClick={() => setRoundTrip(true)}><span>Return</span><strong>Select date</strong><small>Compare round-trip fares</small></button>}
            <TravellersPicker product={product} adults={adults} childCount={childCount} infants={infants} cabin={cabin} onChange={updateDraft} />
            {product === "FLIGHT" && <div className="stitch-popular"><span><span className="stitch-wide-only">Popular pairs</span><span className="stitch-phone-only"><StitchSymbol name="local_fire_department" size={14}/> Popular from Secunderabad &amp; Mumbai</span></span><div>{popularPairs.map(([from,to]) => <button type="button" key={from+to} aria-label={`Set route to ${cities[from]} to ${cities[to]}`} onClick={() => selectPair(from,to)}>{from} <span aria-hidden="true">→</span> {to}</button>)}</div></div>}
            <button className="home-search-submit" disabled={navigating||(product==="HOTEL"&&destinationResolving)} type="submit"><StitchSymbol name="search" size={21}/><span>{navigating ? "Opening your search…" : product === "FLIGHT" ? "Search flights" : destinationResolving ? "Finding your destination…" : "Search stays"}</span><TravelIcon name="arrow" size={17} /></button>
          </div>
          {navigating&&<p role="status" className="home-navigation-status">Opening your search… Live availability will load on the next screen.</p>}
          {notice && <p id="home-search-error" className="home-search-error" role="alert">{notice}</p>}
        </form>
      </section>

      <section className="home-confidence" aria-label="Plan with confidence"><div><i><StitchSymbol name="receipt_long" size={23}/></i><span><strong>Clear before checkout</strong><small>Review the total and supplier rules<span className="stitch-wide-only"> before making a payment.</span></small></span></div><div><i><StitchSymbol name="luggage" size={23}/></i><span><strong>Details that matter</strong><small>Fares, baggage &amp; cancellation rules<span className="stitch-wide-only"> for the option you choose.</span></small></span></div><div><i><StitchSymbol name="folder_shared" size={23}/></i><span><strong>Your trip in 1 place</strong><small>Updates and documents in My trips<span className="stitch-wide-only">, from payment status to booking confirmation.</span></small></span></div></section>

      {offers}
      <section id="discover" className="stitch-discover stitch-home-wrap" aria-labelledby="discover-heading">
        <div className="stitch-section-title"><div><h2 id="discover-heading">Explore hotel destinations</h2><p>Compare stays and check live availability.</p></div><Link href="/hotels">Browse hotels<TravelIcon name="arrow" size={15}/></Link></div>
        <div className="stitch-destinations">{destinations.map(place=>{
          const city = place.name.replace(/^The /,"");
          const search = new URLSearchParams({ product:"HOTEL",city,date:drafts.HOTEL.date,end:drafts.HOTEL.end,adults:String(drafts.HOTEL.adults) });
          return <Link className={`stitch-getaway stitch-getaway-${place.slug}`} key={place.slug} href={`/book?${search}`} aria-label={`Explore stays in ${place.name}`}>
            <span className="stitch-getaway-photo" aria-hidden="true"/><span className="stitch-getaway-tag">{place.theme}</span><div><h3>{place.name}</h3><p>{place.detail}</p></div>
          </Link>;
        })}</div>
      </section>

      <HomePackages />

      {children}
      <div className="stitch-home-wrap stitch-guides-wrap"><HomeDisclosure className="stitch-extra-guides" title="Travel planning guides and directories">
        <div className="stitch-hubs-mobile">{hubLinks}</div>{guides}
      </HomeDisclosure></div>

    </main>
    <TravelFooter />
  </div>;
}
