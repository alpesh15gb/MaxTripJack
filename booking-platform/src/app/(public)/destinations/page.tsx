import Form from 'next/form';
import Image from 'next/image';
import Link from 'next/link';
import {TravelFooter,TravelHeader,TravelIcon} from '@/components/travel-shell';
import {destinations,destinationThemes} from '@/lib/featured-destinations';
import {pageMetadata} from '@/lib/seo';
import './destinations.css';

const path='/destinations';
export const metadata=pageMetadata(path,'Explore Travel Destinations','Plan your flights, stays and activities in featured destinations with Max Travel.');

function filterHref(theme:string,query:string) {
  const params=new URLSearchParams();
  if(theme!=='All')params.set('theme',theme);
  if(query)params.set('q',query);
  return params.size?`${path}?${params}`:path;
}

export default async function DestinationsPage({searchParams}:PageProps<'/destinations'>) {
  const {q,theme:requestedTheme}=await searchParams;
  const query=typeof q==='string'?q.trim().slice(0,80):'';
  const theme=destinationThemes.find(value=>value===requestedTheme)??'All';
  const matches=destinations.filter(place=>(theme==='All'||place.themes.includes(theme)) &&
    `${place.name} ${place.location} ${place.airports}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <TravelHeader/>
    <main id="main-content" className="destination-directory">
      <header className="destination-directory-hero">
        <div className="destination-directory-width">
          <nav aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true"> / </span><span aria-current="page">Destinations</span></nav>
          <h1>Explore destinations</h1>
          <p>Find a place to go and plan your flights, stay or activities.</p>
          <Form action={path} prefetch={false} role="search" aria-label="Search destinations">
            {theme!=='All'&&<input type="hidden" name="theme" value={theme}/>}
            <input key={query} type="search" name="q" aria-label="Destination or country" defaultValue={query} maxLength={80} placeholder="Destination, country or airport"/>
            <button type="submit" className="primary"><TravelIcon name="search" size={17}/>Search</button>
          </Form>
        </div>
      </header>
      <section className="destination-directory-width destination-directory-list" aria-labelledby="featured-destinations">
        <nav aria-label="Destination themes">
          {destinationThemes.map(value=><Link key={value} href={filterHref(value,query)} aria-current={theme===value?'page':undefined}>{value}</Link>)}
        </nav>
        <h2 id="featured-destinations">{query?`Destinations matching “${query}”`:theme==='All'?'Featured destinations':theme}</h2>
        {matches.length?<div className="destination-directory-grid">
          {matches.map(place=><article key={place.slug} aria-label={place.name}>
            <div className="destination-directory-photo"><Image src={`/travel/stitch/desktop-${place.slug}.webp`} alt="" fill sizes="(max-width: 560px) 100vw, (max-width: 960px) 50vw, 380px"/></div>
            <div className="destination-directory-card">
              <h3>{place.name}</h3><p>{place.location} · {place.airports}</p>
              <div>
                <Link href={{pathname:'/book',query:{product:'FLIGHT',to:place.airport}}}>Flights</Link>
                <Link href={{pathname:'/book',query:{product:'HOTEL',city:place.city}}}>Stays</Link>
                <Link href={{pathname:'/contact',query:{topic:'activity',destination:place.city},hash:'office-enquiry'}}>Ask about activities</Link>
              </div>
            </div>
          </article>)}
        </div>:<p className="destination-directory-empty">No destinations match. <Link href={path}>Clear filters</Link></p>}
      </section>
    </main>
    <TravelFooter/>
  </>;
}
