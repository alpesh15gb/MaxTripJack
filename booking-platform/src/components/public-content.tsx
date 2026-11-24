import Link from "next/link";
import { TravelFooter, TravelHeader, TravelIcon } from "@/components/travel-shell";
import {maxAiGatewayConfiguration} from "@/lib/max-ai-provider";
import {conversationConfigured} from "@/lib/max-ai-conversation";
import HomeDesk from "./home-desk";
import {StitchSymbol} from "./stitch-symbol";
import OfficeEnquiryForm from "./office-enquiry-form";
import {MaxAiInlineAction} from "./max-ai-assistant";
import type {OfficeEnquiryService} from "@/lib/travel-enquiry-contract";
import {officeDirectionsHref} from "@/lib/business-profile";
import SeoJsonLd from "@/components/seo-json-ld";
import {getCompanyProfile} from "@/lib/company-settings";
import {getPublicPage} from "@/lib/public-pages";
import { flightGuides, flightGuideSearchHref, type FlightGuide } from "@/lib/flight-guides";
import type { ContentSection, PublicLink, PublicPage } from "@/lib/public-pages";
import { editorialDiscoveryGraph, homeDiscoveryGraph, type Breadcrumb } from "@/lib/discovery-graph";
import "./public-content.css";
import "./public-refresh.css";

function Breadcrumbs({ items }: { items: readonly Breadcrumb[] }) {
  return <nav className="public-breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={item.href}>{index === items.length - 1 ? <span aria-current="page">{item.label}</span> : <Link href={item.href}>{item.label}</Link>}</li>)}</ol></nav>;
}

function ReviewDate({ value }: { value: string }) {
  return <p className="public-reviewed">Editorial review: <time dateTime={value}>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))}</time></p>;
}

function SectionLinks({ sections, hasQuestions }: { sections: readonly ContentSection[]; hasQuestions: boolean }) {
  if (sections.length < 2) return null;

  return <nav className="public-section-links" aria-label="On this page">
    <p>On this page</p>
    <ul>
      {sections.map((section, index) => <li key={section.heading}><a href={`#section-${index}`}>{section.heading}</a></li>)}
      {hasQuestions && <li><a href="#questions-heading">Frequently asked questions</a></li>}
    </ul>
  </nav>;
}

export function ContentSections({ sections }: { sections: readonly ContentSection[] }) {
  return <>{sections.map((section, index) => <section className="public-section" aria-labelledby={`section-${index}`} key={section.heading}>
    <h2 id={`section-${index}`}>{section.heading}</h2>
    {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    {section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}
    {section.links && <ul className="public-inline-links">{section.links.map(link => <li key={link.href}><ContentLink link={link} /></li>)}</ul>}
  </section>)}</>;
}

function ContentLink({ link }: { link: PublicLink }) {
  return link.href.startsWith("/") ? <Link href={link.href}>{link.label}<span aria-hidden="true"> →</span></Link> : <a href={link.href}>{link.label}<span aria-hidden="true"> ↗</span></a>;
}

export async function OfficeContactCard({ compact = false, id }: { compact?: boolean; id?: string }) {
  const businessProfile=await getCompanyProfile();
  return <section id={id} tabIndex={id ? -1 : undefined} className={`public-office-card${compact ? " is-compact" : ""}`} aria-label="MaxTravel office and contact details">
    <span className="public-icon"><TravelIcon name="pin" size={23} /></span>
    <p className="public-eyebrow">A REAL OFFICE. A DIRECT CONTACT.</p>
    <h2>{businessProfile.locationName}</h2>
    {!compact && <address>{businessProfile.address.display}</address>}
    <p className="public-hours"><strong>{businessProfile.hours.display}</strong></p>
    <div className="public-contact-links">
      <a href={businessProfile.phoneHref}><TravelIcon name="user" size={16} />Call {businessProfile.phone}</a>
      <a href={businessProfile.emailHref}>{businessProfile.email}</a>
    </div>
    {!compact && <><a className="public-directions" href={businessProfile.mapsHref}>View our office on Google Maps <span aria-hidden="true">↗</span></a><p className="public-fineprint">Call before your visit if you need specific assistance.</p></>}
    {compact ? <Link className="public-office-link" href="/office">Office address & visit information →</Link> : <div className="public-social">{businessProfile.socialProfiles.map(profile => <a key={profile.href} href={profile.href}>{profile.label} <span aria-hidden="true">↗</span></a>)}</div>}
  </section>;
}

function PlanningNotice() {
  return <aside className="public-notice"><TravelIcon name="shield" size={20} /><p><strong>Planning guidance, not live inventory.</strong> The online platform is currently In Testing. Test results and checkout are not live travel bookings. Contact MaxTravel about your travel needs.</p></aside>;
}

function RelatedLinks({ links }: { links: readonly PublicLink[] }) {
  return <section className="public-related" aria-label="Related planning resources"><h2>Keep planning</h2><div>{links.map(link => <ContentLink key={link.href} link={link} />)}</div></section>;
}

function Questions({ questions }: { questions: readonly { question: string; answer: string }[] }) {
  return <section className="public-questions" aria-labelledby="questions-heading"><h2 id="questions-heading">Frequently asked questions</h2>{questions.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>;
}

export function RouteGuideCards({ exclude }: { exclude?: string }) {
  return <div className="public-route-grid">{flightGuides.filter(route => route.slug !== exclude).map(route => <Link className="public-route-card" key={route.slug} href={`/flights/${route.slug}`}>
    <span className="public-route-codes">{route.origin.code}<TravelIcon name="arrow" size={16} />{route.destination.code}</span>
    <h3>{route.origin.city} to {route.destination.city}</h3><p>{route.description}</p><span className="public-route-action">Read the planning guide <TravelIcon name="arrow" size={16} /></span>
  </Link>)}</div>;
}

export async function PublicPageView({page, contactTopic}: {page: PublicPage; contactTopic?: OfficeEnquiryService}) {
  const businessProfile=await getCompanyProfile();
  page=getPublicPage(page.slug,businessProfile)??page;
  const path = `/${page.slug}`;
  const assisted = page.slug === "visa-guide" ? "visa" : page.slug === "travel-insurance-guide" ? "travel insurance" : null;
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: page.slug === "flights" ? "Flights" : page.title.split(" | ")[0], href: path }];
  const schema = editorialDiscoveryGraph({ ...page, path }, breadcrumbs, { businessProfile, fullBusinessProfile: page.businessSchema });
  return <div className="public-site public-refresh">
    <TravelHeader active={page.slug === "flights" ? "flights" : undefined} />
    <main id="main-content" className="public-main">
      <Breadcrumbs items={breadcrumbs} />
      <header className="public-hero public-hero--editorial">
        <div className="public-hero-copy"><p className="public-eyebrow">{assisted ? 'Assisted enquiry' : page.eyebrow}</p><h1>{page.heading}</h1><p className="public-intro">{page.intro}</p>{(page.slug === "contact" || assisted) && <a className="public-button" href="#contact-options">{assisted ? `Discuss your ${assisted} enquiry` : 'See contact options'}<TravelIcon name="arrow" size={18} /></a>}{page.cta && !assisted && <Link className="public-button" href={page.cta.href}>{page.cta.label}<TravelIcon name="arrow" size={18} /></Link>}{page.slug === "office" && <a className="public-button" href={businessProfile.mapsHref}>Get directions<TravelIcon name="pin" size={18}/></a>}
          {page.slug==="visa-guide"&&<MaxAiInlineAction label="Start a visa enquiry with Max AI" draft="I want to prepare a visa enquiry."/>}
          {page.slug==="contact"&&!contactTopic&&<MaxAiInlineAction label="Start a travel enquiry with Max AI"/>}</div>
        <SectionLinks sections={page.sections} hasQuestions={Boolean(page.questions?.length)} />
      </header>
      {page.slug==='flights'&&<p className="public-inline-links"><Link href="/my-trips?lookup=flight">Already booked? Find your flight by PNR <span aria-hidden="true">→</span></Link></p>}
      <div className="public-layout"><article className="public-article">{contactTopic && <OfficeEnquiryForm key={contactTopic} service={contactTopic}/>}<PlanningNotice /><ContentSections sections={page.sections} />
        {page.showRoutes && <section className="public-section" aria-labelledby="route-guides-heading"><h2 id="route-guides-heading">Find your flight planning guide</h2><p><Link href="/flights/routes">Browse the flight route directory →</Link></p><RouteGuideCards /></section>}
        {page.questions && <Questions questions={page.questions} />}<ReviewDate value={page.reviewedAt} />
      </article><aside className="public-rail"><OfficeContactCard compact={!page.contact} id={page.slug === "contact" || assisted ? "contact-options" : undefined} /><section className="public-rail-note"><h2>Clarity before checkout</h2><p>Check the full price, inclusions and supplier rules. Payment and supplier confirmation are separate steps.</p><Link href="/pricing-transparency">How pricing works →</Link></section></aside></div>
      <RelatedLinks links={page.related} />
    </main><TravelFooter /><SeoJsonLd id="public-page-schema" data={schema} />
  </div>;
}

export async function FlightGuideView({ guide }: { guide: FlightGuide }) {
  const businessProfile=await getCompanyProfile();
  const path = `/flights/${guide.slug}`;
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: "Flights", href: "/flights" }, { label: `${guide.origin.city} to ${guide.destination.city}`, href: path }];
  const related = flightGuides.filter(route => guide.relatedSlugs.includes(route.slug)).map(route => ({ label: `${route.origin.city} to ${route.destination.city} guide`, href: `/flights/${route.slug}` }));
  return <div className="public-site public-refresh"><TravelHeader active="flights" /><main id="main-content" className="public-main">
    <Breadcrumbs items={breadcrumbs} /><header className="public-hero public-hero--editorial">
      <div className="public-hero-copy"><p className="public-eyebrow">FLIGHT PLANNING GUIDE</p><h1>{guide.heading}</h1><p className="public-intro">{guide.intro}</p><Link className="public-button" href={flightGuideSearchHref(guide)}>Plan this route<TravelIcon name="arrow" size={18} /></Link><p className="public-cta-note">Prefills airports only. Choose your own dates. Does not select or reserve a flight.</p></div>
      <div className="public-route-pass" aria-label="Route at a glance"><div><span>Departure</span><strong>{guide.origin.code}</strong><p>{guide.origin.city}</p></div><TravelIcon name="plane" size={28}/><div><span>Arrival</span><strong>{guide.destination.code}</strong><p>{guide.destination.city}</p></div><a href="#airports-heading">Check your airports <span aria-hidden="true">↓</span></a></div>
    </header>
    <div className="public-layout"><article className="public-article"><PlanningNotice />
      <section className="public-section" aria-labelledby="airports-heading"><h2 id="airports-heading">Your airport pair</h2><div className="public-table-wrap"><table className="public-airport-table"><caption>Planning reference—not flight availability</caption><thead><tr><th scope="col">Journey</th><th scope="col">Airport</th><th scope="col">Code</th></tr></thead><tbody><tr><th scope="row">From {guide.origin.city}</th><td>{guide.origin.name}</td><td><strong>{guide.origin.code}</strong></td></tr><tr><th scope="row">To {guide.destination.city}</th><td>{guide.destination.name}</td><td><strong>{guide.destination.code}</strong></td></tr></tbody></table></div><p className="public-fineprint">Airlines, prices, durations, terminals and baggage rules must be checked for the selected dates and fare. This guide does not establish that a flight is offered in MaxTravel inventory.</p></section>
      <SectionLinks sections={guide.sections} hasQuestions={guide.questions.length > 0} /><ContentSections sections={guide.sections} /><Questions questions={guide.questions} />
      <section className="public-sources" aria-labelledby="sources-heading"><h2 id="sources-heading">Official planning references</h2><p>Use the current airport, airline and government guidance before travelling. External references are not endorsements or evidence of a MaxTravel partnership.</p><ul>{guide.sources.map(source => <li key={source.href}><a href={source.href}>{source.label} <span aria-hidden="true">↗</span></a></li>)}</ul><ReviewDate value={guide.reviewedAt} /></section>
    </article><aside className="public-rail"><OfficeContactCard compact /><section className="public-rail-note"><h2>Compare the same journey</h2><p>Use the same passengers, dates, airports and baggage needs when comparing the full price.</p><Link href="/flight-booking-guide">Follow the booking checklist →</Link></section></aside></div>
    <RelatedLinks links={[...related, { label: "All flight planning guides", href: "/flights" }, { label: "Pricing transparency", href: "/pricing-transparency" }]} />
  </main><TravelFooter /><SeoJsonLd id="route-guide-schema" data={editorialDiscoveryGraph({ ...guide, path }, breadcrumbs, {businessProfile, sources: guide.sources })} /></div>;
}

/** Rendered by the server and passed through the interactive homepage as children. */
export async function HomePublicIntro() {
  const businessProfile=await getCompanyProfile();
  const localWeekday=new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:businessProfile.hours.timezone}).format(new Date());
  return <section className="home-public-intro studio-concierge" aria-labelledby="home-public-heading">
    <div className="studio-concierge-band">
      <section className="stitch-office-card">
        <header><span><StitchSymbol name="apartment" size={24}/></span><div><small className="stitch-wide-only">Walk-in center</small><h2 id="home-public-heading">Visit {businessProfile.locationName}</h2><small className="stitch-phone-only">{businessProfile.address.addressRegion} office</small></div>{businessProfile.hours.days.some(day=>day===localWeekday) && <b className="stitch-desk-status">Open today</b>}</header>
        <div className="stitch-office-facts">
          <div><TravelIcon name="pin"/><span><strong>Office address</strong><address>{businessProfile.address.display}</address></span></div>
          <div><TravelIcon name="clock"/><span><strong>Desk timings</strong>{businessProfile.hours.display}</span></div>
          <div><StitchSymbol name="mail"/><span><strong>Direct email</strong><a href={businessProfile.emailHref}>{businessProfile.email}</a></span></div>
        </div>
        {businessProfile.mapsHref === officeDirectionsHref && <a className="stitch-office-map" href={businessProfile.mapsHref}><span><TravelIcon name="pin" size={16}/> Get directions on Google Maps</span></a>}
        <div className="stitch-office-actions"><a href={businessProfile.phoneHref}><StitchSymbol name="call" size={16}/>Call our team</a><a href={businessProfile.mapsHref}><StitchSymbol name="location_on" size={16}/>Get directions</a></div>
      </section>
      <HomeDesk enabled={Boolean(maxAiGatewayConfiguration()) && conversationConfigured()}/>
    </div>
    <SeoJsonLd id="maxtravel-business-schema" data={homeDiscoveryGraph(businessProfile)}/>
  </section>;
}

export function HomeRouteGuides() {
  return <><section className="stitch-route-guides"><h3 className="home-public-routes-heading">Start with the right airport pair &amp; terminal checklist</h3><RouteGuideCards/></section>
    <nav className="home-public-links" aria-label="Travel planning and agency information"><Link href="/flights">Flight planning</Link><Link href="/domestic-flights">Domestic flights</Link><Link href="/international-flights">International flights</Link><Link href="/flight-booking-guide">Booking guide</Link><Link href="/passport-renewal-guide">Passport help</Link><Link href="/visa-guide">Visa planning</Link><Link href="/travel-insurance-guide">Travel insurance</Link><Link href="/cruise-holidays-guide">Cruises</Link><Link href="/holiday-packages-guide">Holiday packages</Link><Link href="/pricing-transparency">Pricing transparency</Link><Link href="/about">About MaxTravel</Link></nav>
    <nav className="home-public-links" aria-label="Browse travel catalogues"><Link href="/hotels">Explore the hotel directory</Link><Link href="/flights/routes">Explore the flight route directory</Link></nav></>;
}
