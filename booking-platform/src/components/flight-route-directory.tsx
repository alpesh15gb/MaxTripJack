import Link from 'next/link';
import {notFound} from 'next/navigation';
import {TravelHeader,TravelFooter,TravelIcon} from './travel-shell';
import {flightGuides} from '@/lib/flight-guides';
import {listFlightRoutes} from '@/lib/flight-route-store';
import {flightRoutePath,routeAirport} from '@/lib/flight-route-catalogue';
import './public-content.css';
import './flight-route-catalogue.css';

export const FLIGHT_DIRECTORY_PAGE_SIZE=24;
export function flightDirectoryPath(page:number){return page===1?'/flights/routes':`/flights/routes/page/${page}`;}
export default async function FlightRouteDirectory({page=1,query=''}:{page?:number;query?:string}) {
  if(!Number.isSafeInteger(page)||page<1||page>100000)notFound();
  const q=query.trim().slice(0,80);
  const catalogue=await listFlightRoutes({page,pageSize:FLIGHT_DIRECTORY_PAGE_SIZE,query:q}).then(value=>({...value,available:true})).catch(()=>({routes:[],total:0,available:false}));
  const available=catalogue.available;
  if(available&&page>1&&(page-1)*FLIGHT_DIRECTORY_PAGE_SIZE>=catalogue.total)notFound();
  const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  const guides=page===1?flightGuides.filter(g=>words.every(word=>`${g.origin.city} ${g.origin.code} ${g.destination.city} ${g.destination.code}`.toLowerCase().includes(word))):[];
  const querySuffix=q?`?q=${encodeURIComponent(q)}`:'';
  return <div className="public-site route-directory"><TravelHeader active="flights"/><main id="main-content" className="public-main">
    <nav className="public-breadcrumbs" aria-label="Breadcrumb"><ol><li><Link href="/">Home</Link></li><li><Link href="/flights">Flights</Link></li><li aria-current="page">Route directory{page>1?` · Page ${page}`:''}</li></ol></nav>
    <header className="public-hero public-hero--editorial"><div className="public-hero-copy"><p className="public-eyebrow">FROM YOUR CITY TO YOUR NEXT CHAPTER</p><h1>Explore flight routes{page>1?` · Page ${page}`:''}</h1><p className="public-intro">Find the right airports, plan the onward journey and compare fares for your own dates. Start with a city or airport code.</p><Link className="public-button" href="/book?product=FLIGHT">Search flights <TravelIcon name="arrow" size={18}/></Link></div></header>
    <form className="route-directory-search" method="get" action="/flights/routes"><label>City or airport code<input type="search" name="q" defaultValue={q} maxLength={80} placeholder="Lucknow, Hyderabad, LKO…"/></label><button type="submit">Find a route</button>{q&&<Link href="/flights/routes">Clear search</Link>}</form>
    {!available&&<p className="route-catalogue-notice" role="status">The extended route directory is temporarily unavailable. You can still use the planning guides below or search your dates.</p>}
    {guides.length>0&&<section aria-label="Airport and route planning guides"><h2>Airport and route planning guides</h2><div className="public-route-grid">{guides.map(guide=><Link className="public-route-card" href={`/flights/${guide.slug}`} key={guide.slug}><span className="public-route-codes">{guide.origin.code}<TravelIcon name="arrow" size={16}/>{guide.destination.code}</span><h3>{guide.origin.city} to {guide.destination.city}</h3><p>{guide.description}</p><span className="public-route-action">Plan this journey →</span></Link>)}</div></section>}
    {catalogue.routes.length>0&&<section aria-label="More flight routes"><h2>More routes to explore</h2><div className="public-route-grid">{catalogue.routes.map(route=><Link className="public-route-card" href={flightRoutePath(route)} key={route.slug}><span className="public-route-codes">{route.from}<TravelIcon name="arrow" size={16}/>{route.to}</span><h3>{routeAirport(route.from)!.city} to {routeAirport(route.to)!.city}</h3><p>Airport details, local time zones and a checklist for comparing your flight options.</p><span className="public-route-action">Plan this journey →</span></Link>)}</div></section>}
    {!guides.length&&!catalogue.routes.length&&available&&<section className="route-catalogue-notice"><h2>No matching published route guide</h2><p>You can still search flights for your dates. A missing guide does not establish whether a flight is available.</p><Link href="/book?product=FLIGHT">Choose airports and search →</Link></section>}
    <nav className="route-directory-pagination" aria-label="Route directory pages">{page>1&&<Link href={flightDirectoryPath(page-1)+querySuffix}>← Previous page</Link>}<span>Page {page}</span>{page*FLIGHT_DIRECTORY_PAGE_SIZE<catalogue.total&&<Link href={flightDirectoryPath(page+1)+querySuffix}>Next page →</Link>}</nav>
    <p className="public-fineprint">Planning information is separate from live flight availability. Choose dates and travellers to check current prices and conditions.</p>
  </main><TravelFooter/></div>;
}
