import {indexingEnabled} from '@/lib/seo';
import {listFlightSitemapRoutes} from '@/lib/flight-route-store';
import {flightSitemapXml} from '@/lib/flight-route-sitemap';
import {FLIGHT_ROUTE_SITEMAP_SIZE} from '@/lib/flight-route-paths';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{shard:string}>}) {
  const {shard}=await params;if(!/^(?:0|[1-9]\d{0,5})$/.test(shard)||Number(shard)>100000||!indexingEnabled())return new Response('Not found',{status:404});
  try {const result=await listFlightSitemapRoutes(Number(shard));if(Number(shard)*FLIGHT_ROUTE_SITEMAP_SIZE>=result.total)return new Response('Not found',{status:404});return new Response(flightSitemapXml(result.routes),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=900'}});}
  catch{return new Response('Route sitemap temporarily unavailable',{status:503,headers:{'Retry-After':'300','Cache-Control':'no-store'}});}
}
