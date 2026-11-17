import {indexingEnabled} from '@/lib/seo';
import {listFlightRoutes} from '@/lib/flight-route-store';
import {flightSitemapIndex} from '@/lib/flight-route-sitemap';
import {FLIGHT_ROUTE_SITEMAP_SIZE} from '@/lib/flight-route-paths';
export const dynamic='force-dynamic';
export async function GET() {
  if(!indexingEnabled())return new Response(flightSitemapIndex(0),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
  try {const {total}=await listFlightRoutes({pageSize:1});return new Response(flightSitemapIndex(Math.ceil(total/FLIGHT_ROUTE_SITEMAP_SIZE)),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=900'}});}
  catch{return new Response('Route sitemap temporarily unavailable',{status:503,headers:{'Retry-After':'300','Cache-Control':'no-store'}});}
}
