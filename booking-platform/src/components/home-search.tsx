"use client";

import Link from "next/link";
import Image from "next/image";
import Form from "next/form";
import { HomePackages } from "./home-packages";
import "@/app/home-packages.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState, useTransition, type ReactNode } from "react";
import AirportPicker from "@/components/airport-picker";
import HotelDestination from "@/components/hotel-destination";
import { indiaToday } from "@/lib/booking-presentation";
import { FARE_CALENDAR_MAX_DAYS } from "@/lib/fare-calendar-core";
import {destinationThemes, destinations} from "@/lib/featured-destinations";
import {bookingSearchInput,searchFormIsValid} from '@/lib/booking-search-input';
import {invalidateBackgroundSearch} from '@/lib/background-search';
import useBackgroundSearch from './use-background-search';
import FareDatePicker from './fare-date-picker';
import TravellersPicker, {cabinChoices} from './travellers-picker';
import useFareCalendar from './use-fare-calendar';
import "@/app/search-pickers.css";
import { TravelFooter, TravelHeader, TravelIcon } from "@/components/travel-shell";
import { HomeServiceRail } from "./travel-navigation";
import {StitchSymbol} from "./stitch-symbol";
import {HomeDisclosure} from "./home-disclosure";
import HomeRecentSearches, { rememberHomeSearch } from "./home-recent-searches";
import { MaxAiInlineAction } from "./max-ai-assistant";

type Product = "FLIGHT" | "HOTEL";
type AssistedProduct = "PACKAGE" | "ACTIVITY";
type HomeProduct = Product | AssistedProduct;
type EnquiryDraft = { destination: string; start: string; end: string; travellers: string };
const productHash: Record<HomeProduct, string> = {FLIGHT:"#flights",HOTEL:"#hotels",PACKAGE:"#packages",ACTIVITY:"#tours"};
type SearchDraft = {
  date: string;
  end: string;
  adults: number;
  children: number;
  infants: number;
  cabin: string;
};
const cities: Record<string,string> = { HYD:"Hyderabad", DEL:"New Delhi", BOM:"Mumbai", GOI:"Goa", DXB:"Dubai", BLR:"Bengaluru" };
const popularPairs = [["HYD","DEL"], ["DEL","BOM"], ["BOM","GOI"], ["HYD","DXB"], ["DEL","BLR"], ["BLR","HYD"]];
const homePerks = [
  { title: "Review before you book", photo: "hold", href: "/pricing-transparency", detail: "Check the price, baggage and fare conditions before paying." },
  { title: "Flight + Hotel", photo: "package", href: "/packages", detail: "Ask our travel desk to put your flights and stay together in one itinerary." },
  { title: "Tours & Activities", photo: "tours", href: "/contact?topic=activity#office-enquiry", detail: "Ask about activities and tickets for your destination." },
  { title: "Real travel experts", photo: "experts", href: "/customer-support", detail: "Call the travel desk or send a support request for help with your trip." },
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

function rememberHomeProduct(product: Product) {
  document.cookie = `maxtravel-home-product=${product}; Path=/; SameSite=Lax`;
}

function readAirportFields(form: HTMLFormElement | null) {
  if (!form) return null;
  const from = form.querySelector<HTMLInputElement>('[data-airport-query="from"]');
  const to = form.querySelector<HTMLInputElement>('[data-airport-query="to"]');
  return from && to ? { from: from.value, to: to.value } : null;
}

function initialEnquiryDraft(product: AssistedProduct): EnquiryDraft {
  return {destination:"",start:dateAfter(7),end:dateAfter(product==="PACKAGE"?10:8),travellers:"2"};
}

function HomeEnquirySearch({product, draft, update}: {
  product: AssistedProduct;
  draft: EnquiryDraft;
  update: (value: Partial<EnquiryDraft>)=>void;
}) {
  const packageTrip = product === "PACKAGE";
  const today = dateAfter(0);
  const minimumEnd = (start: string) => packageTrip ? shiftDate(start || today, 1) : start || today;
  return <Form action="/contact" prefetch={false} className="home-search-form destina-assisted-form">
    <input type="hidden" name="topic" value={packageTrip ? "package" : "activity"}/>
    <div className="home-search-fields is-hotel">
      <label className="home-search-input destina-enquiry-field"><span>Destination</span><input name="destination" required minLength={2} maxLength={120} placeholder="e.g. Dubai or Bali" list="destina-enquiry-destinations" value={draft.destination} onChange={event=>update({destination:event.target.value})}/></label>
      <datalist id="destina-enquiry-destinations">{destinations.map(place => <option key={place.slug}>{place.name}</option>)}</datalist>
      <div className="destina-search-dates">
        <label className="home-search-input destina-enquiry-field"><span>{packageTrip ? "Depart" : "From"}</span><input aria-label="Start date" name="start" type="date" required min={today} value={draft.start} onChange={event => {
          const start=event.target.value;
          const earliest=minimumEnd(start);
          update({start,end:draft.end&&draft.end<earliest?earliest:draft.end});
        }}/></label>
        <label className="home-search-input destina-enquiry-field"><span>{packageTrip ? "Return" : "To"}</span><input aria-label="End date" name="end" type="date" required min={minimumEnd(draft.start)} value={draft.end} onChange={event=>update({end:event.target.value})}/></label>
      </div>
      <label className="home-search-input destina-enquiry-field"><span>Travellers</span><input name="travellers" type="number" min={1} max={50} required value={draft.travellers} onChange={event=>update({travellers:event.target.value})}/></label>
      <button className="home-search-submit" type="submit"><StitchSymbol name="search" size={19}/>Enquire</button>
    </div>
    <p className="destina-enquiry-note">Our travel desk will check availability and prepare a quote for your dates.</p>
  </Form>;
}

export default function HomeSearch({ children, offers, guides, startingProduct }: { children: ReactNode; offers: ReactNode; guides: ReactNode; startingProduct: Product }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [featured, setFeatured] = useState<typeof destinations[number] | null>(null);
  const [theme, setTheme] = useState<typeof destinationThemes[number]>(destinationThemes[0]);
  const [product, setProduct] = useState<Product>(startingProduct);
  const [assisted, setAssisted] = useState<AssistedProduct | null>(null);
  const [enquiryDrafts,setEnquiryDrafts]=useState(()=>({PACKAGE:initialEnquiryDraft("PACKAGE"),ACTIVITY:initialEnquiryDraft("ACTIVITY")}));
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
  const showFlightFares = !assisted && product === "FLIGHT" && !roundTrip && childCount === 0 && infants === 0;
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
  const backgroundSearch=useBackgroundSearch({form,preloadOnMount:true,enabled:!assisted&&!navigating&&!destinationResolving,read:()=>{
    if(!form.current||!searchFormIsValid(form.current))return null;
    try{return currentSearchInput(new FormData(form.current));}catch{return null;}
  }});

  function changeProduct(next: HomeProduct, updateUrl = true) {
    if (next === (assisted ?? product)) return;
    backgroundSearch.pause();invalidateBackgroundSearch();
    if (product === "FLIGHT") {
      const fields = readAirportFields(form.current);
      if (fields) setAirports(fields);
    }
    if(product === "HOTEL" && form.current){const data=new FormData(form.current);setHotelDestination({city:String(data.get("city")||""),hotelIds:String(data.get("hotelIds")||""),regionId:String(data.get("regionId")||""),destinationCursor:String(data.get("destinationCursor")||"")});}
    if (next === "PACKAGE" || next === "ACTIVITY") {
      setDestinationResolving(false);
      setAssisted(next);
    } else {
      setAssisted(null);
      setProduct(next);
      if(updateUrl)rememberHomeProduct(next);
    }
    if(updateUrl && window.location.hash!==productHash[next])window.history.pushState(null,"",productHash[next]);
    setNotice("");
  }

  const syncProductFromUrl=useEffectEvent(()=>{
    const hash=window.location.hash;
    const matching=(Object.keys(productHash) as HomeProduct[]).find(value=>productHash[value]===hash);
    if(matching||!hash)changeProduct(matching??startingProduct,false);
  });
  useEffect(()=>{
    function sync(){syncProductFromUrl();}
    sync();
    window.addEventListener("hashchange",sync);
    return ()=>window.removeEventListener("hashchange",sync);
  },[]);

  function openSearch(next: HomeProduct) {
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
    if (product === "FLIGHT" && roundTrip && (!end || end < date)) { setNotice(end ? "Your return date cannot be before your departure." : "Choose a return date."); return; }
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
    rememberHomeSearch(params, product === "FLIGHT" ? `${from} → ${to}` : String(data.get("city") || "Hotel search"));
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
    {destinations.map(hub => <button key={hub.slug} type="button" aria-label={hub.name} aria-pressed={featured === hub} onClick={() => setFeatured(hub)}>{hub.name} <span>({hub.airports})</span></button>)}
    {featured && <Link href={`/book?${featuredStay}`}>Find stays in {featured.name.replace(/^The /,"the ")} <TravelIcon name="arrow" size={14}/></Link>}
  </div>;
  return <div className="trip-home stitch-home travel-atlas-home destina-home">
    <TravelHeader active={product === "FLIGHT" ? "flights" : "hotels"} onProductChange={openSearch} />
    <HomeServiceRail product={assisted ?? product} onProductChange={openSearch}/>
    <main id="main-content">
      <section className="destina-home-hero" aria-labelledby="home-title">
        <Image src="/travel/destina-hero.jpg" alt="" fill preload sizes="100vw" />
        <div className="destina-home-heading">
          <h1 id="home-title">Travel Made Simple</h1>
          <ul><li><StitchSymbol name="check_circle" size={16}/>Compare flights and stays</li><li><StitchSymbol name="check_circle" size={16}/>Expert travel support</li><li><StitchSymbol name="check_circle" size={16}/>Clear prices before booking</li></ul>
        </div>
      </section>

      <section id="trip-search" className="home-search-card" aria-label="Plan your trip" tabIndex={-1}>
        <div className="stitch-product-nav">
          <div className="home-product-tabs" role="group" aria-label="Booking type">
            <button type="button" aria-pressed={!assisted && product === "HOTEL"} onClick={() => changeProduct("HOTEL")}><StitchSymbol name="hotel" size={31}/>Stays</button>
            <button type="button" aria-pressed={!assisted && product === "FLIGHT"} onClick={() => changeProduct("FLIGHT")}><StitchSymbol name="flight" size={31}/>Flights</button>
            <button type="button" aria-pressed={assisted === "PACKAGE"} onClick={() => changeProduct("PACKAGE")}><StitchSymbol name="luggage" size={31}/>Flight + Hotel</button>
            <button type="button" aria-pressed={assisted === "ACTIVITY"} onClick={() => changeProduct("ACTIVITY")}><TravelIcon name="holiday" size={30}/>Tours &amp; Activities</button>
          </div>
        </div>
        {assisted ? <HomeEnquirySearch key={assisted} product={assisted} draft={enquiryDrafts[assisted]} update={value=>setEnquiryDrafts(current=>({
          ...current,[assisted]:{...current[assisted],...value},
        }))}/> : <form ref={form} className="home-search-form" aria-describedby={notice ? "home-search-error" : undefined} onChange={clearCorrectableNotice} onSubmit={submit}>
          {product === "FLIGHT" && <div className="home-search-options"><fieldset>
            <legend className="visually-hidden">Journey type</legend>
            <label><input type="radio" name="journey" checked={roundTrip} onChange={() => setRoundTrip(true)} />Round trip</label>
            <label><input type="radio" name="journey" checked={!roundTrip} onChange={() => setRoundTrip(false)} />One way</label>
            <button className="stitch-multicity" type="button" onClick={() => advancedSearch(true)}>Multi-city</button>
          </fieldset><select className="destina-cabin" aria-label="Cabin class" value={cabin} onChange={event => updateDraft({cabin: event.target.value})}>
            {cabinChoices.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select></div>}
          <div className={`home-search-fields ${product === "HOTEL" ? "is-hotel" : ""} ${roundTrip && product === "FLIGHT" ? "is-return" : ""}`}>
            {product === "FLIGHT" ? <div className="home-airports"><div className="home-search-input"><TravelIcon name="departure" size={18}/><AirportPicker key={`from-${airportRevision}`} name="from" label="From airport" initialCode={airports.from} showSelectedCode onCodeChange={setFromCode} /></div><button className="home-swap" type="button" onClick={swapAirports} aria-label="Swap departure and arrival airports"><TravelIcon name="swap" size={16} /></button><div className="home-search-input"><TravelIcon name="arrival" size={18}/><AirportPicker key={`to-${airportRevision}`} name="to" label="To airport" initialCode={airports.to} showSelectedCode onCodeChange={setToCode} /></div></div> : <div className="home-search-input home-hotel-destination"><TravelIcon name="pin" size={18}/><HotelDestination initialQuery={hotelDestination.city} initialHotelIds={hotelDestination.hotelIds.split(",").filter(Boolean)} initialRegionId={hotelDestination.regionId} initialDestinationCursor={hotelDestination.destinationCursor} onResolvingChange={setDestinationResolving} /></div>}
            <div className="destina-search-dates">
            <FareDatePicker compact name="date" label={product === "FLIGHT" ? "Departure" : "Check-in"} value={date} min={today} startAtMinimum fares={showFlightFares ? outbound.days : undefined} onChange={value => {
              const minimumEnd = product === "HOTEL" ? shiftDate(value, 1) : value;
              updateDraft({ date: value, end: product === "FLIGHT" && !end ? "" : end >= minimumEnd ? end : shiftDate(value, product === "HOTEL" ? 1 : 3) });
            }} />
            {(product === "HOTEL" || roundTrip) && <FareDatePicker compact key={product} name="end" label={product === "FLIGHT" ? "Return" : "Check-out"} value={end} min={product === "HOTEL" ? shiftDate(date, 1) : date} rangeStart={date} helper={product === "HOTEL" && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : undefined} onChange={value => updateDraft({ end: value })} />}
            </div>
            <TravellersPicker product={product} adults={adults} childCount={childCount} infants={infants} cabin={cabin} onChange={updateDraft} />
            <button className="home-search-submit" aria-label={product === "FLIGHT" ? "Search flights" : "Search stays"} disabled={navigating||(product==="HOTEL"&&destinationResolving)} type="submit"><StitchSymbol name="search" size={19}/><span>{navigating ? "Opening…" : destinationResolving ? "Finding stays…" : "Search"}</span></button>
          </div>
          {navigating&&<p role="status" className="home-navigation-status">Opening your search… Live availability will load on the next screen.</p>}
          {notice && <p id="home-search-error" className="home-search-error" role="alert">{notice}</p>}
        </form>}
        <div className="destina-search-footer">
          {!assisted && <button type="button" className="home-advanced-link" onClick={() => advancedSearch()}>{product === "FLIGHT" ? "More search options" : "More rooms, children or another nationality"}</button>}
          <p><Link href="/account">Sign in or register</Link> to manage your bookings</p>
        </div>
      </section>

      <HomeRecentSearches />
      <section className="home-confidence" aria-label="Why book with Max Travel"><div><i><StitchSymbol name="support_agent" size={20}/></i><strong>Expert support before and after you travel</strong></div><div><i><StitchSymbol name="sell" size={20}/></i><strong>Compare flights and stays and see the full price before you pay</strong></div></section>

      <section className="destina-home-tiles stitch-home-wrap" aria-label="Travel smarter with Max Travel">
        <div className="destina-home-perks">{homePerks.map(perk => <Link href={perk.href} key={perk.photo}>
          <Image src={`/travel/destina-perk-${perk.photo}.jpg`} alt="" width={560} height={420} sizes="(max-width: 900px) 50vw, 282px"/>
          <div><h3>{perk.title}</h3><p>{perk.detail}</p></div>
        </Link>)}</div>
      </section>
      <section id="discover" className="stitch-discover stitch-home-wrap" aria-labelledby="discover-heading">
        <div className="stitch-section-title"><div><h2 id="discover-heading">Popular Holiday Destinations</h2><p>Beaches, city breaks and holidays our travellers love</p></div><Link href="/destinations">All destinations<TravelIcon name="arrow" size={15}/></Link></div>
        <div className="atlas-destination-filters" role="group" aria-label="Filter hotel destinations">
          {destinationThemes.map(item => <button key={item} type="button" onClick={() => setTheme(item)} aria-pressed={theme === item}>{item}</button>)}
        </div>
        <div className="stitch-destinations">{destinations.filter(place => theme === "All" || place.themes.includes(theme)).map(place=>{
          const search = new URLSearchParams({ product:"HOTEL",city:place.city,date:drafts.HOTEL.date,end:drafts.HOTEL.end,adults:String(drafts.HOTEL.adults) });
          return <Link className={`stitch-getaway stitch-getaway-${place.slug}`} key={place.slug} href={`/book?${search}`} aria-label={`Explore stays in ${place.name}`}>
            <span className="stitch-getaway-photo" aria-hidden="true"/><div><h3>{place.name}</h3><p>{place.location}</p></div>
          </Link>;
        })}</div>
        <div className="stitch-hubs-desktop">{hubLinks}</div>
      </section>

      <section className="destina-home-routes stitch-home-wrap" aria-labelledby="home-hotel-cities-heading">
        <div className="stitch-section-title"><div><h2 id="home-hotel-cities-heading">Hotels in Top Destinations</h2><p>Compare room options for your dates</p></div><Link href="/hotels">All hotel destinations <TravelIcon name="arrow" size={15}/></Link></div>
        <div className="destina-route-options">{["Mumbai", "New Delhi", "Hyderabad", "Bengaluru", "Goa", "Dubai"].map(city => <Link key={city} href={{pathname:"/book", query:{product:"HOTEL",city,date:drafts.HOTEL.date,end:drafts.HOTEL.end,adults:drafts.HOTEL.adults}}}><StitchSymbol name="hotel" size={16}/>{city}<TravelIcon name="arrow" size={14}/></Link>)}</div>
      </section>
      {offers}

      <section className="destina-home-routes stitch-home-wrap" aria-labelledby="home-routes-heading">
        <div className="stitch-section-title"><div><h2 id="home-routes-heading">Popular Flight Routes</h2><p>Pick a route and compare flights for your dates</p></div><Link href="/flights/routes">All routes <TravelIcon name="arrow" size={15}/></Link></div>
        <div className="destina-route-options">{popularPairs.map(([from,to]) => <button type="button" key={from+to} aria-label={`Set route to ${cities[from]} to ${cities[to]}`} onClick={() => { openSearch("FLIGHT"); selectPair(from,to); }}><StitchSymbol name="flight" size={16}/>{cities[from]} to {cities[to]}<TravelIcon name="arrow" size={14}/></button>)}</div>
      </section>

      <HomePackages />

      {children}
      <div className="stitch-home-wrap stitch-guides-wrap"><HomeDisclosure className="stitch-extra-guides" title="Travel planning guides and directories">
        <div className="stitch-hubs-mobile">{hubLinks}</div>{guides}
      </HomeDisclosure></div>

      <section className="destina-home-help" aria-labelledby="home-help-heading"><div className="stitch-home-wrap">
        <div><h2 id="home-help-heading">Customer Support</h2><p>Get help finding a trip, checking booking status or requesting a change.</p><div className="destina-help-actions"><Link href="/customer-support"><StitchSymbol name="support_agent" size={18}/>Support Center</Link><Link href="/customer-support/faq">FAQs</Link><MaxAiInlineAction ariaLabel="Open Max AI travel assistant"/></div></div>
        <Image src="/travel/destina-travel-support.png" alt="" width={640} height={300} sizes="(max-width:760px) 100vw, 570px"/>
      </div></section>
    </main>
    <TravelFooter />
  </div>;
}
