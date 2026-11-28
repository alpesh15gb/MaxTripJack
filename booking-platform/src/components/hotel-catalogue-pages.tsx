import Link from 'next/link';
import ReferenceProductNav from './reference-product-nav';
import type { HotelCatalogueRecord } from '@/lib/hotel-catalogue';
import { hotelDirectoryPath, hotelPropertyPath } from '@/lib/hotel-public-path';
import { hotelContactHref, hotelTestAvailabilityHref, HOTEL_DIRECTORY_PAGE_SIZE } from '@/lib/hotel-seo';
import HotelCatalogueGallery from './hotel-catalogue-gallery';
import HotelDirectorySearch from './hotel-directory-search';
import HotelPropertyMedia from './hotel-property-media';
import { TravelIcon } from './travel-shell';
import './hotel-catalogue.css';
import '../app/hotel-detail.css';
import './public-refresh.css';

function CatalogueBreadcrumbs({ hotel }: { hotel?: HotelCatalogueRecord }) {
  return <nav className="catalogue-breadcrumbs" aria-label="Breadcrumb"><ol><li><Link href="/">Home</Link></li><li>{hotel ? <Link href="/hotels">Hotels</Link> : <span aria-current="page">Hotels</span>}</li>{hotel && <li><span aria-current="page">{hotel.name}</span></li>}</ol></nav>;
}

function SearchStaysByDate({ query }: { query: string }) {
  return <section id="stays-by-date" aria-labelledby="stays-by-date-title">
    <h2 id="stays-by-date-title">Search stays by date</h2>
    <p>Choose a destination, travel dates and guests.</p>
    <HotelDirectorySearch key={query} query={query} />
  </section>;
}

function AvailabilityCard({ hotel, emailHref }: { hotel: HotelCatalogueRecord; emailHref: string }) {
  const testHref = hotelTestAvailabilityHref(hotel);
  return <aside className="catalogue-availability" aria-labelledby="hotel-availability-title">
    <span className="catalogue-eyebrow">YOUR STAY STARTS HERE</span><h2 id="hotel-availability-title">Make room for your next trip.</h2>
    <p>{testHref ? 'Choose your dates, rooms, guests and nationality to check this property in our test booking flow.' : 'Share your dates, room preferences and guest details with our team to check this property’s availability.'}</p>
    {testHref ? <Link className="catalogue-button" href={testHref}>Check test availability <TravelIcon name="arrow" size={18} /></Link> : <a className="catalogue-button" href={hotelContactHref(hotel, emailHref)}>Enquire about this hotel <TravelIcon name="arrow" size={18} /></a>}
    <p className="catalogue-fineprint">{testHref ? 'Testing only. This does not reserve a room or make a live booking.' : 'Opens an email with the hotel name. Our team confirms availability and a quote before booking.'}</p>
    <div className="catalogue-availability-note"><TravelIcon name="shield" size={19} /><span>Room prices, meals and cancellation terms depend on your dates and the selected rate.</span></div>
    <Link className="catalogue-text-link" href="/contact">Need help? Contact MaxTravel</Link>
  </aside>;
}

export function HotelPropertyContent({ hotel, emailHref }: { hotel: HotelCatalogueRecord; emailHref: string }) {
  const checked = new Date(hotel.checkedAt);
  const checkedLabel = Number.isFinite(checked.getTime()) ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(checked) : undefined;
  return <main id="main-content" className="catalogue-main catalogue-property public-refresh revamp-discovery">
    <CatalogueBreadcrumbs hotel={hotel} />
    <header className="catalogue-property-heading"><div><span className="catalogue-eyebrow">{hotel.propertyType || 'A PLACE TO STAY'}{hotel.city ? ` · ${hotel.city}` : ''}</span><h1>{hotel.name}</h1>{hotel.starRating && <p className="catalogue-category"><span aria-hidden="true">{'★'.repeat(hotel.starRating)}</span>{hotel.starRating}-star property category</p>}<p className="catalogue-address"><TravelIcon name="pin" size={18} />{hotel.address || [hotel.city, hotel.countryName].filter(Boolean).join(', ')}</p></div><a className="catalogue-outline-button" href={hotelTestAvailabilityHref(hotel) ?? hotelContactHref(hotel,emailHref)}>{hotel.environment === 'uat' ? 'Check test availability' : 'Plan your stay'}<TravelIcon name="arrow" size={17} /></a></header>
    <HotelCatalogueGallery hotel={hotel} />
    <nav className="catalogue-sections" aria-label="Property information"><a href="#about-hotel">About this stay</a><a href="#hotel-amenities">Amenities</a><a href="#hotel-location">Location</a><a href="#hotel-questions">Before you book</a></nav>
    <div className="catalogue-property-layout"><article>
      <section id="about-hotel" className="catalogue-section"><span className="catalogue-eyebrow">GET TO KNOW YOUR STAY</span><h2>About {hotel.name}</h2>{hotel.description && hotel.descriptionHeadline && hotel.descriptionHeadline!==hotel.description && <h3>{hotel.descriptionHeadline}</h3>}{hotel.description || hotel.descriptionHeadline ? <p className="catalogue-description">{hotel.description ?? hotel.descriptionHeadline}</p> : <p>The supplier has not provided a detailed property description. Check the location and listed amenities below, or contact our team.</p>}{checkedLabel && <p className="catalogue-fineprint">Property data checked <time dateTime={hotel.checkedAt}>{checkedLabel}</time>. Property information is supplied separately from room availability.</p>}</section>
      <section id="hotel-amenities" className="catalogue-section"><h2>Property amenities</h2>{hotel.amenities.length ? <ul className="catalogue-amenities">{hotel.amenities.map(amenity => <li key={amenity}><TravelIcon name="check" size={17} />{amenity}</li>)}</ul> : <p>Amenities have not been supplied for this property. Confirm any essential facility before booking.</p>}<p className="catalogue-fineprint">Some facilities may carry an extra charge or have limited hours. Check essential requirements with the property or our team.</p></section>
      <section id="hotel-location" className="catalogue-section"><h2>Where you’ll stay</h2><div className="catalogue-location"><TravelIcon name="pin" size={24} /><div><h3>{hotel.name}</h3><address>{hotel.address || [hotel.city, hotel.countryName].filter(Boolean).join(', ')}</address>{hotel.address && <a className="catalogue-text-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotel.name} ${hotel.address}`)}`} target="_blank" rel="noopener noreferrer">Search this address on Google Maps ↗</a>}</div></div></section>
      <section id="hotel-questions" className="catalogue-section catalogue-questions"><h2>Before you book</h2>{hotel.address && <details><summary>Where is {hotel.name}?</summary><p>The supplied address is {hotel.address}.</p></details>}<details><summary>How can I check room prices and availability?</summary><p>{hotel.environment === 'uat' ? 'Use Check test availability to choose dates, rooms, guest ages and nationality. The current online booking environment is for testing; it does not confirm a live hotel booking.' : `Use Enquire about this hotel to contact MaxTravel about ${hotel.name}. Include your check-in and check-out dates, the number of rooms, and all guest ages so our team can check the right options.`}</p></details><details><summary>Is breakfast included, and can I cancel?</summary><p>Meal inclusions and cancellation conditions belong to the individual room rate. Property amenities alone do not establish that breakfast is included or that cancellation is free. Review the selected rate’s full terms before booking.</p></details><details><summary>What should I confirm before travelling?</summary><p>Confirm check-in and check-out times, accepted identification, occupancy and child policies, and any charges payable at the property. Ask about any accessibility or facility requirements that are essential to your stay.</p></details></section>
    </article><AvailabilityCard hotel={hotel} emailHref={emailHref} /></div>
    <section className="catalogue-discover-more"><div><span className="catalogue-eyebrow">KEEP EXPLORING</span><h2>A different stay in mind?</h2><p>Explore more hotel photos, locations and property details.</p></div><Link href="/hotels" className="catalogue-outline-button">Browse hotels <TravelIcon name="arrow" size={18} /></Link></section>
  </main>;
}

export function HotelCatalogueUnavailable({ property = false, query = '' }: { property?: boolean; query?: string }) {
  return <main id="main-content" className="catalogue-main public-refresh revamp-discovery reference-catalogue-page">
    {property ? <div className="reference-content"><CatalogueBreadcrumbs/><section className="catalogue-empty">
      <TravelIcon name="hotel" size={36}/>
      <h1>Property details are temporarily unavailable</h1>
      <p>Try searching by destination and date, or ask our team for help with your stay.</p>
      <div><Link href="/book?product=HOTEL" className="catalogue-button">Search stays</Link><Link href="/contact" className="catalogue-outline-button">Contact our team</Link></div>
    </section></div> : <>
      <header className="reference-editorial-hero reference-editorial-hero--catalogue"><div className="reference-content">
        <CatalogueBreadcrumbs/>
        <h1>Explore your next hotel stay</h1>
        <p>The hotel directory is temporarily unavailable. Search room availability by destination and date.</p>
      </div></header>
      <div className="reference-content reference-catalogue-content"><section className="reference-product-panel" aria-label="Search travel"><ReferenceProductNav active="hotels"/><div className="discovery-hotel-tools is-single"><SearchStaysByDate query={query} /></div></section>
      <Link href="/contact" className="catalogue-outline-button">Contact our team</Link></div>
    </>}
  </main>;
}

function HotelCatalogueCard({hotel}: {hotel:HotelCatalogueRecord}) {
  const href = hotelPropertyPath(hotel.slug);
  return <article className="catalogue-hotel-card">
    <Link className="catalogue-card-photo" href={href} aria-label={`View ${hotel.name}`}>
      <HotelPropertyMedia name={hotel.name} photos={hotel.photos}/>
    </Link>
    <div className="catalogue-card-copy">
      <p className="catalogue-card-place">{[hotel.city,hotel.countryName].filter(Boolean).join(' · ')}</p>
      <h3><Link href={href}>{hotel.name}</Link></h3>
      {hotel.starRating && <p className="catalogue-card-category">
        <span aria-hidden="true">{'★'.repeat(hotel.starRating)}</span> {hotel.starRating}-star property category
      </p>}
      {hotel.address && <p className="catalogue-card-address"><TravelIcon name="pin" size={15}/>{hotel.address}</p>}
      {hotel.amenities.length > 0 && <ul className="catalogue-card-amenities">
        {hotel.amenities.slice(0,3).map(amenity=><li key={amenity}>{amenity}</li>)}
      </ul>}
      <Link className="catalogue-card-action" href={href}>Explore this stay <TravelIcon name="arrow" size={18}/></Link>
    </div>
  </article>;
}

export function HotelDirectoryContent({ hotels, total, page, query }: { hotels: HotelCatalogueRecord[]; total: number; page: number; query: string }) {
  const totalPages = Math.max(1, Math.ceil(total / HOTEL_DIRECTORY_PAGE_SIZE));
  const href = (number: number) => hotelDirectoryPath(number) + (query ? `?${new URLSearchParams({ q: query })}` : '');
  const pageLinks = [...new Set([1, page - 1, page, page + 1, totalPages])].filter(number => number >= 1 && number <= totalPages).sort((a, b) => a - b);
  return <main id="main-content" className="catalogue-main public-refresh revamp-discovery reference-catalogue-page">
    <header className="reference-editorial-hero reference-editorial-hero--catalogue">
      <div className="reference-content">
        <CatalogueBreadcrumbs />
        <h1>{query ? 'Find a stay that feels right.' : 'Good stays. Great beginnings.'}</h1>
        <p>Get to know a property through its photos, location and amenities, then check rooms for your dates.</p>
        <form action="/hotels" method="get" className="reference-search-pill" role="search" aria-label="Hotel directory">
          <TravelIcon name="search" size={20}/>
          <input name="q" type="search" aria-label="Hotel name, city or area" defaultValue={query} placeholder="Hotel name, city or area" maxLength={80}/>
          <button type="submit">Find hotels</button>
        </form>
      </div>
    </header>
    <div className="reference-content reference-catalogue-content">
    <section className="reference-product-panel" aria-label="Search travel">
      <ReferenceProductNav active="hotels"/>
      <div className="discovery-hotel-tools is-single"><SearchStaysByDate query={query} /></div>
    </section>
    <div className="catalogue-results-heading"><h2>{query ? `Hotels matching “${query}”` : 'Explore the hotel directory'}</h2><p>{total.toLocaleString('en-IN')} {total === 1 ? 'property' : 'properties'}{total > 0 ? ` · Page ${page} of ${totalPages}` : ''}</p>{query && <Link className="catalogue-text-link" href="/hotels">Clear search</Link>}</div>
    {hotels.length ? <div className="catalogue-grid">{hotels.map(hotel => <HotelCatalogueCard key={hotel.hotelId} hotel={hotel}/>)}</div> : <section className="catalogue-empty"><TravelIcon name="search" size={32} /><h2>{query ? 'No matching hotels in the directory yet' : 'Your next stay is worth exploring'}</h2><p>{query ? 'Try a shorter hotel name, a nearby city or a different spelling. Directory coverage can differ from date-based availability.' : 'Hotel details will appear here as the supplier catalogue is prepared. You can search available stays in the meantime.'}</p><Link className="catalogue-button" href="/book?product=HOTEL">Search stays</Link></section>}
    {totalPages > 1 && <nav className="catalogue-pagination" aria-label="Hotel directory pages">{page > 1 && <Link href={href(page - 1)}>← Previous</Link>}{pageLinks.map((number, index) => <span key={number}>{index > 0 && number - pageLinks[index - 1] > 1 && <span className="catalogue-page-gap" aria-hidden="true">…</span>}<Link href={href(number)} aria-current={number === page ? 'page' : undefined} aria-label={`Hotel directory page ${number}`}>{number}</Link></span>)}{page < totalPages && <Link href={href(page + 1)}>Next →</Link>}</nav>}
    </div>
  </main>;
}
