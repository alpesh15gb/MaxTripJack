"use client";

import Link from 'next/link';
import {packageDurationLabel} from '@/lib/package-duration';
import {PackagePhoto} from './package-photo';
import { useEffect, useState } from 'react';
import { TravelFooter, TravelHeader, TravelIcon } from './travel-shell';
import { currentPackage, currentPackageSummary, packageEmailHref, packagePrice, packagePriceBasis, type TravelPackage, type TravelPackageSummary } from '@/lib/travel-packages';

type Catalogue = {packages:TravelPackageSummary[];truncated:boolean;unavailableCount:number};
function PackageMoney({item}: {item:TravelPackageSummary}) {
  return <div className="package-price"><strong>{item.priceAmount !== null && <small>Starting estimate </small>}{packagePrice(item)}</strong><span>{packagePriceBasis[item.priceBasis]}</span>{item.priceAmount !== null && <small>{item.taxesIncluded ? 'Taxes included' : 'Check applicable taxes'} · Valid through {item.priceValidUntil} UTC</small>}</div>;
}
export function PackageExperience({slug,initialPackage}: {slug?:string;initialPackage?:TravelPackage}) { return <PackageContent key={slug || 'list'} slug={slug} initialPackage={initialPackage}/>; }
function PackageContent({slug,initialPackage}: {slug?:string;initialPackage?:TravelPackage}) {
  const [loadedCatalogue,setCatalogue] = useState<Catalogue|null>(null);
  const catalogue:Catalogue|null=initialPackage?{packages:[initialPackage],truncated:false,unavailableCount:0}:loadedCatalogue;
  const [error,setError] = useState(''); const [notFound,setNotFound] = useState(false); const [attempt,setAttempt] = useState(0);
  const [query,setQuery] = useState('');
  useEffect(() => {
    if(initialPackage)return;
    const controller = new AbortController();
    fetch(slug ? `/api/packages/${encodeURIComponent(slug)}` : '/api/packages', {signal:controller.signal,cache:'no-store'}).then(async response => {
      if (!response.ok) { if (response.status === 404) setNotFound(true); throw new Error(response.status === 404 ? 'This package is no longer published or available.' : 'We couldn’t load package information. Please try again.'); }
      const data = await response.json();
      const packages = (slug ? [data.package] : data.packages).map((item:unknown) => slug ? currentPackage(item) : currentPackageSummary(item));
      setCatalogue({packages,truncated:data.truncated === true,unavailableCount:data.unavailableCount || 0});
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Packages unavailable.'); });
    return () => controller.abort();
  }, [slug,attempt,initialPackage]);
  const retry = () => {setError('');setNotFound(false);setCatalogue(null);setAttempt(value => value+1);};
  const item = slug ? catalogue?.packages[0] as TravelPackage | undefined : undefined;
  const visible = catalogue?.packages.filter(p => `${p.title} ${p.destination}`.toLowerCase().includes(query.trim().toLowerCase())) || [];
  return <div className="travel-app"><TravelHeader active="packages"/><main id="main-content" className="package-main">
    <div className="package-breadcrumb"><Link href="/">Home</Link><span>/</span>{slug ? <Link href="/packages">Travel packages</Link> : <span>Travel packages</span>}</div>
    <header className="package-heading"><span className="package-eyebrow">A journey, thoughtfully planned</span><h1>{item?.title || (slug ? 'Your next journey' : 'Travel packages')}</h1><p>{item?.summary || 'Explore plans from the Max Travel team. Review what’s included, then speak with us about dates and a personalised quote.'}</p></header>
    <div className="package-disclosure"><TravelIcon name="shield"/><p><strong>Enquiry only — not instant booking.</strong> Availability and the final quote must be confirmed by our team. Sending an enquiry does not reserve a trip or take a payment.</p></div>
    {error ? <section className="package-state" role="alert"><h2>{notFound ? 'Package unavailable' : 'We couldn’t load packages'}</h2><p>{error}</p>{!notFound && <button onClick={retry}>Try again</button>}<Link href="/packages">Browse packages</Link><Link href="/customer-support">Contact support</Link></section> : !catalogue ? <section className="package-state" role="status"><h2>Loading travel plans…</h2><p>Checking the latest published details.</p></section> : item ? <PackageDetail item={item}/> : <>
      {(catalogue.truncated || catalogue.unavailableCount > 0) && <p className="package-warning" role="status">Some package details are currently unavailable or outside this list. Contact our team for more options.</p>}
      <section className="package-discovery" aria-label="Find a package"><label htmlFor="package-query">Where would you like to go?</label><input id="package-query" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search destination or package name"/><p aria-live="polite">{visible.length} of {catalogue.packages.length} published plans in this list</p></section>
      {!visible.length ? <section className="package-state"><h2>{query ? 'No matching plans' : catalogue.unavailableCount || catalogue.truncated ? 'Plans are temporarily unavailable' : 'New journeys are on the way'}</h2><p>{query ? 'Try another destination or clear your search.' : 'Tell our team where you’d like to travel. We can discuss a plan with you.'}</p>{query && <button onClick={() => {setQuery('');document.getElementById('package-query')?.focus();}}>Clear search</button>}<Link href="/contact">Talk to Max Travel</Link></section> : <div className="package-grid">{visible.map(p => <article className="package-card" key={p.id}><div className="package-card-photo"><PackagePhoto url={p.coverImageUrl} alt={p.coverImageAlt || p.title}/><span>{packageDurationLabel(p.durationDays,'day')} · {packageDurationLabel(p.durationNights,'night')}</span></div><div className="package-card-body"><span className="package-eyebrow">{p.destination}</span><h2><Link href={`/packages/${p.slug}`}>{p.title}</Link></h2><p>{p.summary}</p><span className={`package-status ${p.availability === 'UNAVAILABLE' ? 'is-unavailable' : ''}`}>{p.availability === 'UNAVAILABLE' ? 'Currently unavailable' : p.availability === 'SEASONAL' ? 'Seasonal · confirm dates' : 'Dates & availability on request'}</span><PackageMoney item={p}/><Link className="package-button" href={`/packages/${p.slug}`}>View itinerary & details <span aria-hidden="true">→</span></Link></div></article>)}</div>}
    </>}
  </main><TravelFooter/></div>;
}
function PackageDetail({item:p}: {item:TravelPackage}) {
  const enquiry = `Hello Max Travel, I’m interested in ${p.title} (${p.slug}). Please confirm dates, availability and the final quote. https://maxtravel.in/packages/${p.slug}`;
  return <div className="package-detail"><div className="package-detail-content"><div className="package-cover"><PackagePhoto url={p.coverImageUrl} alt={p.coverImageAlt || p.title}/></div><div className="package-facts"><span><TravelIcon name="pin"/>{p.destination}</span><span><TravelIcon name="clock"/>{packageDurationLabel(p.durationDays,'day')} / {packageDurationLabel(p.durationNights,'night')}</span><a href="#package-enquiry" onClick={() => document.getElementById('package-enquiry')?.focus()}>Price & enquiry ↓</a></div><section><h2>The journey</h2><p className="package-prose">{p.description}</p></section><section><h2>Your itinerary</h2><ol className="package-itinerary">{[...p.itinerary].sort((a,b) => a.day-b.day).map(day => <li key={day.day}><span>Day {day.day}</span><div><h3>{day.title}</h3><p className="package-prose">{day.description}</p></div></li>)}</ol></section><div className="package-inclusions"><section><h2>What’s included</h2><ul>{p.inclusions.map((value,i) => <li key={i}>{value}</li>)}</ul></section><section><h2>Not included</h2><ul>{p.exclusions.map((value,i) => <li key={i}>{value}</li>)}</ul></section></div>{p.gallery.length > 0 && <section><h2>Package gallery</h2><div className="package-gallery">{p.gallery.map((photo,i) => <PackagePhoto key={photo.url+i} url={photo.url} alt={photo.alt || `${p.title} photo ${i+1}`}/>)}</div></section>}<section><h2>Before you enquire</h2><h3>Cancellation policy</h3><p className="package-prose">{p.cancellationPolicy}</p><h3>Terms</h3><p className="package-prose">{p.terms}</p></section></div><aside id="package-enquiry" tabIndex={-1} className="package-quote" aria-label="Package price and enquiry"><span className="package-eyebrow">Plan with our team</span><PackageMoney item={p}/><p className="package-prose">{p.priceNotes}</p><hr/><h2>{p.availability === 'UNAVAILABLE' ? 'Currently unavailable' : 'Confirm your travel dates'}</h2>{p.travelStart && <p>Travel window: {p.travelStart} to {p.travelEnd || 'confirm with our team'}</p>}<p className="package-prose">{p.availabilityNotes}</p>{p.availability !== 'UNAVAILABLE' && <div className="package-contact-actions">{p.contactWhatsapp && <a className="package-button" href={`https://wa.me/${p.contactWhatsapp.slice(1)}?text=${encodeURIComponent(enquiry)}`} target="_blank" rel="noopener noreferrer">Enquire on WhatsApp ↗</a>}{p.contactEmail && <a className="package-button secondary" href={packageEmailHref(p.contactEmail,p.title,enquiry)}>Draft an email enquiry</a>}{p.contactPhone && <a className="package-button secondary" href={`tel:${p.contactPhone}`}>Call {p.contactPhone}</a>}</div>}<small>These links open your messaging, email or phone app. Nothing is submitted here. A conversation is not a confirmed booking.</small><Link href="/customer-support">Need help planning?</Link></aside></div>;
}
