import Link from "next/link";
import { TravelFooter, TravelHeader, TravelIcon } from "@/components/travel-shell";
import SeoJsonLd from "@/components/seo-json-ld";
import { businessProfile, businessStructuredData, officeDirectionsHref } from "@/lib/business-profile";
import { flightGuides, flightGuideSearchHref, type FlightGuide } from "@/lib/flight-guides";
import type { ContentSection, PublicLink, PublicPage } from "@/lib/public-pages";
import { canonicalUrl } from "@/lib/seo";
import "./public-content.css";

type Breadcrumb = { label: string; href: string };

export function breadcrumbStructuredData(items: readonly Breadcrumb[]) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.label, item: canonicalUrl(item.href) })),
  };
}

export function editorialStructuredData(path: string, title: string, description: string, reviewedAt: string) {
  return {
    "@context": "https://schema.org", "@type": "WebPage", "@id": `${canonicalUrl(path)}#webpage`,
    url: canonicalUrl(path), name: title, description, dateModified: reviewedAt,
    inLanguage: "en-IN", publisher: { "@id": `${businessProfile.website}/#organization` },
  };
}

function Breadcrumbs({ items }: { items: readonly Breadcrumb[] }) {
  return <nav className="public-breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={item.href}>{index === items.length - 1 ? <span aria-current="page">{item.label}</span> : <Link href={item.href}>{item.label}</Link>}</li>)}</ol></nav>;
}

function ReviewDate({ value }: { value: string }) {
  return <p className="public-reviewed">Editorial review: <time dateTime={value}>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))}</time></p>;
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

export function OfficeContactCard({ compact = false }: { compact?: boolean }) {
  return <section className={`public-office-card${compact ? " is-compact" : ""}`} aria-label="MaxTravel office and contact details">
    <span className="public-icon"><TravelIcon name="pin" size={23} /></span>
    <p className="public-eyebrow">A REAL OFFICE. A DIRECT CONTACT.</p>
    <h2>{businessProfile.locationName}</h2>
    {!compact && <address>{businessProfile.address.display}</address>}
    <p className="public-hours"><strong>{businessProfile.hours.display}</strong></p>
    <div className="public-contact-links">
      <a href={businessProfile.phoneHref}><TravelIcon name="user" size={16} />Call {businessProfile.phone}</a>
      <a href={businessProfile.whatsappHref}>Message on WhatsApp <span aria-hidden="true">↗</span></a>
      <a href={businessProfile.emailHref}>{businessProfile.email}</a>
    </div>
    {!compact && <><a className="public-directions" href={officeDirectionsHref}>View our office on Google Maps <span aria-hidden="true">↗</span></a><p className="public-fineprint">Call before your visit if you need specific assistance.</p></>}
    {compact ? <Link className="public-office-link" href="/office">Office address & visit information →</Link> : <div className="public-social">{businessProfile.socialProfiles.map(profile => <a key={profile.href} href={profile.href}>{profile.label} <span aria-hidden="true">↗</span></a>)}</div>}
  </section>;
}

function PlanningNotice() {
  return <aside className="public-notice"><TravelIcon name="shield" size={20} /><p><strong>Planning guidance, not live inventory.</strong> The online platform is currently in TripJack UAT. Test results and checkout are not live travel bookings. Contact MaxTravel about your travel needs.</p></aside>;
}

function RelatedLinks({ links }: { links: readonly PublicLink[] }) {
  return <section className="public-related" aria-label="Related planning resources"><h2>Keep planning</h2><div>{links.map(link => <ContentLink key={link.href} link={link} />)}</div></section>;
}

function Questions({ questions }: { questions: readonly { question: string; answer: string }[] }) {
  return <section className="public-questions" aria-labelledby="questions-heading"><h2 id="questions-heading">Useful questions</h2>{questions.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>;
}

export function RouteGuideCards({ exclude }: { exclude?: string }) {
  return <div className="public-route-grid">{flightGuides.filter(route => route.slug !== exclude).map(route => <Link className="public-route-card" key={route.slug} href={`/flights/${route.slug}`}>
    <span className="public-route-codes">{route.origin.code}<TravelIcon name="arrow" size={16} />{route.destination.code}</span>
    <h3>{route.origin.city} to {route.destination.city}</h3><p>{route.description}</p><span className="public-route-action">Read the planning guide <TravelIcon name="arrow" size={16} /></span>
  </Link>)}</div>;
}

export function PublicPageView({ page }: { page: PublicPage }) {
  const path = `/${page.slug}`;
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: page.slug === "flights" ? "Flights" : page.title.split(" | ")[0], href: path }];
  const schema = [editorialStructuredData(path, page.title, page.description, page.reviewedAt), breadcrumbStructuredData(breadcrumbs), ...(page.businessSchema ? [businessStructuredData()] : [])];
  return <div className="public-site">
    <TravelHeader active={page.slug === "flights" ? "flights" : undefined} />
    <main id="main-content" className="public-main">
      <Breadcrumbs items={breadcrumbs} />
      <header className="public-hero"><p className="public-eyebrow">{page.eyebrow}</p><h1>{page.heading}</h1><p className="public-intro">{page.intro}</p>{page.cta && <Link className="public-button" href={page.cta.href}>{page.cta.label}<TravelIcon name="arrow" size={18} /></Link>}</header>
      <div className="public-layout"><article className="public-article"><PlanningNotice /><ContentSections sections={page.sections} />
        {page.showRoutes && <section className="public-section" aria-labelledby="route-guides-heading"><h2 id="route-guides-heading">Five journeys. Five practical planning guides.</h2><RouteGuideCards /></section>}
        {page.questions && <Questions questions={page.questions} />}<ReviewDate value={page.reviewedAt} />
      </article><aside className="public-rail"><OfficeContactCard compact={!page.contact} /><section className="public-rail-note"><h2>Clarity before checkout</h2><p>Check the full price, inclusions and supplier rules. Payment and supplier confirmation are separate steps.</p><Link href="/pricing-transparency">How pricing works →</Link></section></aside></div>
      <RelatedLinks links={page.related} />
    </main><TravelFooter /><SeoJsonLd id="public-page-schema" data={schema} />
  </div>;
}

export function FlightGuideView({ guide }: { guide: FlightGuide }) {
  const path = `/flights/${guide.slug}`;
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: "Flights", href: "/flights" }, { label: `${guide.origin.city} to ${guide.destination.city}`, href: path }];
  const related = flightGuides.filter(route => guide.relatedSlugs.includes(route.slug)).map(route => ({ label: `${route.origin.city} to ${route.destination.city} guide`, href: `/flights/${route.slug}` }));
  return <div className="public-site"><TravelHeader active="flights" /><main id="main-content" className="public-main">
    <Breadcrumbs items={breadcrumbs} /><header className="public-hero"><p className="public-eyebrow">AIRPORT-PAIR PLANNING GUIDE · {guide.origin.code} → {guide.destination.code}</p><h1>{guide.heading}</h1><p className="public-intro">{guide.intro}</p><Link className="public-button" href={flightGuideSearchHref(guide)}>Plan this route<TravelIcon name="arrow" size={18} /></Link><p className="public-cta-note">Prefills airports only. Choose your own dates. Does not select or reserve a flight.</p></header>
    <div className="public-layout"><article className="public-article"><PlanningNotice />
      <section className="public-section" aria-labelledby="airports-heading"><h2 id="airports-heading">Your airport pair</h2><div className="public-table-wrap"><table className="public-airport-table"><caption>Planning reference—not flight availability</caption><thead><tr><th scope="col">Journey</th><th scope="col">Airport</th><th scope="col">Code</th></tr></thead><tbody><tr><th scope="row">From {guide.origin.city}</th><td>{guide.origin.name}</td><td><strong>{guide.origin.code}</strong></td></tr><tr><th scope="row">To {guide.destination.city}</th><td>{guide.destination.name}</td><td><strong>{guide.destination.code}</strong></td></tr></tbody></table></div><p className="public-fineprint">Airlines, prices, durations, terminals and baggage rules must be checked for the selected dates and fare. This guide does not establish that a flight is offered in MaxTravel inventory.</p></section>
      <ContentSections sections={guide.sections} /><Questions questions={guide.questions} />
      <section className="public-sources" aria-labelledby="sources-heading"><h2 id="sources-heading">Official planning references</h2><p>Use the current airport, airline and government guidance before travelling. External references are not endorsements or evidence of a MaxTravel partnership.</p><ul>{guide.sources.map(source => <li key={source.href}><a href={source.href}>{source.label} <span aria-hidden="true">↗</span></a></li>)}</ul><ReviewDate value={guide.reviewedAt} /></section>
    </article><aside className="public-rail"><OfficeContactCard compact /><section className="public-rail-note"><h2>Compare the same journey</h2><p>Use the same passengers, dates, airports and baggage needs when comparing the full price.</p><Link href="/flight-booking-guide">Follow the booking checklist →</Link></section></aside></div>
    <RelatedLinks links={[...related, { label: "All flight planning guides", href: "/flights" }, { label: "Pricing transparency", href: "/pricing-transparency" }]} />
  </main><TravelFooter /><SeoJsonLd id="route-guide-schema" data={[editorialStructuredData(path, guide.title, guide.description, guide.reviewedAt), breadcrumbStructuredData(breadcrumbs)]} /></div>;
}

/** Rendered by the server and passed through the interactive homepage as children. */
export function HomePublicIntro() {
  return <section className="home-public-intro" aria-labelledby="home-public-heading"><div className="home-public-heading"><div><p className="public-eyebrow">MAXTRAVEL · SECUNDERABAD</p><h2 id="home-public-heading">Competitive travel prices.<br />Real people. A real office.</h2><p>Plan flights and hotels with a human point of contact. Learn what to compare, understand the booking steps and reach our Secunderabad office every day, 9:00 am–9:00 pm India time.</p><p className="public-fineprint">The online platform is currently in UAT. Test searches and checkout are not live travel bookings.</p></div><OfficeContactCard compact /></div><nav className="home-public-links" aria-label="Travel planning and agency information"><Link href="/flights">Flight planning</Link><Link href="/domestic-flights">Domestic flights</Link><Link href="/international-flights">International flights</Link><Link href="/flight-booking-guide">Booking guide</Link><Link href="/pricing-transparency">Pricing transparency</Link><Link href="/about">About MaxTravel</Link></nav><h3 className="home-public-routes-heading">Start with the right airport pair</h3><RouteGuideCards /><SeoJsonLd id="maxtravel-business-schema" data={businessStructuredData()} /></section>;
}
