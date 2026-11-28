"use client";

import Link from 'next/link';
import {packageDurationLabel} from '@/lib/package-duration';
import {indiaToday} from '@/lib/booking-presentation';
import {PackagePhoto} from './package-photo';
import ReferenceProductNav from './reference-product-nav';
import { useEffect, useState } from 'react';
import { TravelFooter, TravelHeader, TravelIcon } from './travel-shell';
import { currentPackage, currentPackageSummary, packageEmailHref, packagePrice, packagePriceBasis, type TravelPackage, type TravelPackageSummary } from '@/lib/travel-packages';
import './public-refresh.css';

type Catalogue = {packages:TravelPackageSummary[];truncated:boolean;unavailableCount:number;planningOnly:boolean};
const durationFilters = [
  { id: 'any', label: 'Any length', matches: () => true },
  { id: 'short', label: 'Up to 4 days', matches: (days: number) => days <= 4 },
  { id: 'week', label: '5–7 days', matches: (days: number) => days >= 5 && days <= 7 },
  { id: 'long', label: '8+ days', matches: (days: number) => days >= 8 },
] as const;
type DurationFilter = (typeof durationFilters)[number]['id'];
function PackageMoney({item}: {item:TravelPackageSummary}) {
  return <div className="package-price"><strong>{item.priceAmount !== null && <small>Starting estimate </small>}{packagePrice(item)}</strong><span>{packagePriceBasis[item.priceBasis]}</span>{item.priceAmount !== null && <small>{item.taxesIncluded ? 'Taxes included' : 'Check applicable taxes'} · Valid through {item.priceValidUntil} UTC</small>}</div>;
}
type PackageView = {slug?:string;initialPackage?:TravelPackage;planningOnly?:boolean};
export function PackageExperience(props:PackageView) {
  return <PackageContent key={props.slug || 'list'} {...props}/>;
}

function PackageEnquirySearch() {
  const [start, setStart] = useState('');
  const today = indiaToday();
  return <form action="/contact#office-enquiry" method="get" className="reference-package-enquiry" aria-label="Plan a holiday">
    <input type="hidden" name="topic" value="package"/>
    <label>Destination<input name="destination" minLength={2} maxLength={100} placeholder="City or country" required/></label>
    <label>From<input name="start" type="date" min={today} value={start} onChange={event=>setStart(event.target.value)} required/></label>
    <label>To<input name="end" type="date" min={start || today} required/></label>
    <label>Travellers<input name="travellers" type="number" min={1} max={50} defaultValue={2} required/></label>
    <button className="reference-product-action" type="submit">Enquire <TravelIcon name="arrow" size={17}/></button>
  </form>;
}

function PackageContent({slug,initialPackage,planningOnly=false}:PackageView) {
  const [loadedCatalogue,setCatalogue] = useState<Catalogue|null>(null);
  const catalogue:Catalogue|null=initialPackage?{packages:[initialPackage],truncated:false,unavailableCount:0,planningOnly}:loadedCatalogue;
  const [error,setError] = useState(''); const [notFound,setNotFound] = useState(false); const [attempt,setAttempt] = useState(0);
  const [query,setQuery] = useState('');
  const [duration, setDuration] = useState<DurationFilter>('any');
  useEffect(() => {
    if(initialPackage)return;
    const controller = new AbortController();
    fetch(slug ? `/api/packages/${encodeURIComponent(slug)}` : '/api/packages', {signal:controller.signal,cache:'no-store'}).then(async response => {
      if (!response.ok) { if (response.status === 404) setNotFound(true); throw new Error(response.status === 404 ? 'This package is no longer published or available.' : 'We couldn’t load package information. Please try again.'); }
      const data = await response.json();
      const packages = (slug ? [data.package] : data.packages).map((item:unknown) => slug ? currentPackage(item) : currentPackageSummary(item));
      setCatalogue({packages,truncated:data.truncated === true,unavailableCount:data.unavailableCount || 0,planningOnly:data.source==='trip-ideas'});
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Packages unavailable.'); });
    return () => controller.abort();
  }, [slug,attempt,initialPackage]);
  const retry = () => {setError('');setNotFound(false);setCatalogue(null);setAttempt(value => value+1);};
  const item = slug ? catalogue?.packages[0] as TravelPackage | undefined : undefined;
  const search = query.trim().toLowerCase();
  const durationFilter = durationFilters.find(filter => filter.id === duration) ?? durationFilters[0];
  const filtered = Boolean(search) || duration !== 'any';
  const packages = catalogue?.packages ?? [];
  const availableDurations = durationFilters.filter(filter => filter.id === 'any' || packages.some(p => filter.matches(p.durationDays)));
  const visible = packages.filter(p => durationFilter.matches(p.durationDays) && `${p.title} ${p.destination}`.toLowerCase().includes(search));
  const destinations = [...new Map(packages.filter(p => p.coverImageUrl).map(p => [p.destination, p])).values()].slice(0, 5);
  function clearFilters() {
    setQuery('');
    setDuration('any');
    document.getElementById('package-query')?.focus();
  }
  return <div className="travel-app public-refresh"><TravelHeader active="packages"/><main id="main-content" className={`package-main revamp-discovery reference-catalogue-page ${slug ? "package-main--detail" : "package-main--catalogue"}`}>
    <header className="reference-editorial-hero reference-editorial-hero--catalogue">
      <div className="reference-content">
        <nav className="package-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span>{slug ? <><Link href="/packages">Holiday packages</Link>{item && <><span aria-hidden="true">/</span><span aria-current="page">{item.title}</span></>}</> : <span aria-current="page">Holiday packages</span>}</nav>
        <h1>{item?.title || (slug ? 'Your next journey' : 'Holiday packages')}</h1>
        <p>{item?.summary || 'Explore itineraries from Max Travel, then ask our team about travel dates and a personalised quote.'}</p>
        {!slug && <div className="reference-search-pill">
          <TravelIcon name="search" size={20}/>
          <input id="package-query" type="search" aria-label="Where would you like to go?" value={query} onChange={event => setQuery(event.target.value)} placeholder="Destination or package"/>
        </div>}
      </div>
    </header>
    <div className="reference-content reference-catalogue-content">
    {!slug && <section className="reference-product-panel" aria-label="Explore travel">
      <ReferenceProductNav active="packages"/>
      <PackageEnquirySearch/>
      {availableDurations.length > 2 && <div className="reference-package-controls">
        <fieldset className="discovery-duration">
          <legend>Trip length</legend>
          <div>{availableDurations.map(filter => <label key={filter.id}>
            <input type="radio" name="trip-length" value={filter.id} checked={duration === filter.id} onChange={() => setDuration(filter.id)} />
            {filter.label}
          </label>)}</div>
        </fieldset>
      </div>}
    </section>}
    {!slug && !filtered && destinations.length > 1 && <section aria-labelledby="package-destination-heading">
      <h2 id="package-destination-heading" className="reference-section-heading">Popular destinations</h2>
      <div className="reference-destination-tiles">{destinations.map(p => <a key={p.destination} href="#package-plans" onClick={() => setQuery(p.destination)}>
        <PackagePhoto url={p.coverImageUrl} alt=""/>
        <span>{p.destination}</span>
      </a>)}</div>
    </section>}
    <div className="package-disclosure"><TravelIcon name="shield"/><p><strong>Enquiry only — not instant booking.</strong> Availability and the final quote must be confirmed by our team. Sending an enquiry does not reserve a trip or take a payment.</p></div>
    {error ? <section className="package-state" role="alert"><h2>{notFound ? 'Package unavailable' : 'We couldn’t load packages'}</h2><p>{error}</p>{!notFound && <button onClick={retry}>Try again</button>}{slug&&<Link href="/packages">Browse packages</Link>}<Link href="/contact">Plan a trip with our team</Link><Link href="/customer-support">Contact support</Link></section> : !catalogue ? <section className="package-state" role="status"><h2>Loading travel plans…</h2><p>Checking the latest published details.</p></section> : item ? <PackageDetail item={item} planningOnly={catalogue.planningOnly}/> : <>
      {catalogue.planningOnly && <p className="package-warning">Browse sample itineraries, or ask our team to plan a trip around your dates.</p>}
      {(catalogue.truncated || catalogue.unavailableCount > 0) && <p className="package-warning" role="status">Some package details are currently unavailable or outside this list. Contact our team for more options.</p>}
      <section id="package-plans" className="reference-package-results" aria-labelledby="package-plans-heading">
        <h2 id="package-plans-heading" className="reference-section-heading">Explore holiday packages</h2>
        <p aria-live="polite">{visible.length} of {packages.length} {catalogue.planningOnly ? 'trip ideas' : 'published plans'}</p>
      {!visible.length ? <section className="package-state"><h2>{filtered ? 'No matching plans' : catalogue.unavailableCount || catalogue.truncated ? 'Plans are temporarily unavailable' : 'New journeys are on the way'}</h2><p>{filtered ? 'Try another destination or trip length.' : 'Tell our team where you’d like to travel. We can discuss a plan with you.'}</p>{filtered && <button type="button" onClick={clearFilters}>Clear search and filters</button>}<Link href="/contact">Talk to Max Travel</Link></section> : <div className="package-grid">{visible.map(p => <article className="package-card" key={p.id}><div className="package-card-photo"><PackagePhoto url={p.coverImageUrl} alt={p.coverImageAlt || p.title}/><span>{packageDurationLabel(p.durationDays,'day')} · {packageDurationLabel(p.durationNights,'night')}</span></div><div className="package-card-body"><span className="package-eyebrow">{p.destination}</span><h2><Link href={`/packages/${p.slug}`}>{p.title}</Link></h2><p>{p.summary}</p><span className={`package-status ${p.availability === 'UNAVAILABLE' ? 'is-unavailable' : ''}`}>{p.availability === 'UNAVAILABLE' ? 'Currently unavailable' : p.availability === 'SEASONAL' ? 'Seasonal · confirm dates' : catalogue.planningOnly ? 'Sample itinerary' : 'Dates & availability on request'}</span><PackageMoney item={p}/><Link className="package-button" href={`/packages/${p.slug}`}>View itinerary & details <span aria-hidden="true">→</span></Link></div></article>)}</div>}
      </section>
    </>}
    </div>
  </main><TravelFooter/></div>;
}
function PackageDetail({item:p,planningOnly}: {item:TravelPackage;planningOnly:boolean}) {
  const enquiry = `Hello Max Travel, I’m interested in ${p.title} (${p.slug}). Please confirm dates, availability and the final quote. https://maxtravel.in/packages/${p.slug}`;
  return <div className="package-detail"><div className="package-detail-content"><nav className="package-section-nav" aria-label="Package sections"><a href="#package-overview">Overview</a><a href="#package-itinerary">Itinerary</a><a href="#package-inclusions">Inclusions</a><a href="#package-terms">Terms</a></nav><div className="package-cover"><PackagePhoto url={p.coverImageUrl} alt={p.coverImageAlt || p.title}/></div><div className="package-facts"><span><TravelIcon name="pin"/>{p.destination}</span><span><TravelIcon name="clock"/>{packageDurationLabel(p.durationDays,'day')} / {packageDurationLabel(p.durationNights,'night')}</span><a href="#package-enquiry" onClick={() => document.getElementById('package-enquiry')?.focus()}>Price & enquiry ↓</a></div><section id="package-overview"><h2>The journey</h2><p className="package-prose">{p.description}</p></section><section id="package-itinerary"><h2>{planningOnly?'Sample itinerary':'Your itinerary'}</h2><ol className="package-itinerary">{[...p.itinerary].sort((a,b) => a.day-b.day).map(day => <li key={day.day}><span>Day {day.day}</span><div><h3>{day.title}</h3><p className="package-prose">{day.description}</p></div></li>)}</ol></section><div id="package-inclusions" className="package-inclusions"><section><h2>{planningOnly?'What we can arrange':'What’s included'}</h2><ul>{p.inclusions.map((value,i) => <li key={i}>{value}</li>)}</ul></section><section><h2>{planningOnly?'Confirm with our team':'Not included'}</h2><ul>{p.exclusions.map((value,i) => <li key={i}>{value}</li>)}</ul></section></div>{p.gallery.length > 0 && <section><h2>Package gallery</h2><div className="package-gallery">{p.gallery.map((photo,i) => <PackagePhoto key={photo.url+i} url={photo.url} alt={photo.alt || `${p.title} photo ${i+1}`}/>)}</div></section>}<section id="package-terms"><h2>Before you enquire</h2><h3>Cancellation policy</h3><p className="package-prose">{p.cancellationPolicy}</p><h3>Terms</h3><p className="package-prose">{p.terms}</p></section></div><aside id="package-enquiry" tabIndex={-1} className="package-quote" aria-label="Package price and enquiry"><span className="package-eyebrow">Plan with our team</span><PackageMoney item={p}/><p className="package-prose">{p.priceNotes}</p><hr/><h2>{p.availability === 'UNAVAILABLE' ? 'Currently unavailable' : 'Confirm your travel dates'}</h2>{p.travelStart && <p>Travel window: {p.travelStart} to {p.travelEnd || 'confirm with our team'}</p>}<p className="package-prose">{p.availabilityNotes}</p>{planningOnly ? <Link className="package-button" href="/contact">Ask for a quote</Link> : p.availability !== 'UNAVAILABLE' && <div className="package-contact-actions">{p.contactEmail && <a className="package-button" href={packageEmailHref(p.contactEmail,p.title,enquiry)}>Draft an email enquiry</a>}{p.contactPhone && <a className="package-button secondary" href={`tel:${p.contactPhone}`}>Call {p.contactPhone}</a>}</div>}<small>{planningOnly ? "Share your dates and group size with our travel team." : "These links open your email or phone app. Nothing is submitted here. A conversation is not a confirmed booking."}</small><Link href="/customer-support">Need help planning?</Link></aside></div>;
}
