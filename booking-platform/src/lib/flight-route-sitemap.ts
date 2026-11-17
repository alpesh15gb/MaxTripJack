import {canonicalUrl} from './seo';
import {flightRoutePath,type FlightRouteRecord} from './flight-route-catalogue';
const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function flightSitemapIndex(shards:number) {
  if(!Number.isSafeInteger(shards)||shards<0||shards>100000)throw Error('Invalid sitemap size.');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({length:shards},(_,id)=>`<sitemap><loc>${xml(canonicalUrl(`/flight-route-sitemap-${id}.xml`))}</loc></sitemap>`).join('')}</sitemapindex>`;
}
export function flightSitemapXml(routes:FlightRouteRecord[]) {
  if(routes.length>10000)throw Error('Sitemap shard exceeds limit.');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route=>`<url><loc>${xml(canonicalUrl(flightRoutePath(route)))}</loc><lastmod>${xml(route.updatedAt)}</lastmod></url>`).join('')}</urlset>`;
}
