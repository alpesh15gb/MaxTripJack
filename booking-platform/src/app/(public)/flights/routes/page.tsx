import FlightRouteDirectory from '@/components/flight-route-directory';
import {canonicalUrl,indexingEnabled} from '@/lib/seo';
export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const hasQuery=Object.keys(await searchParams).length>0;
  return {title:'Flight routes: airport guides and fare search',description:'Explore flight routes by city or airport code. Plan your airports, local times and onward journey, then search fares for your own dates.',alternates:{canonical:canonicalUrl('/flights/routes')},robots:{index:indexingEnabled()&&!hasQuery,follow:true}};
}
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const q=(await searchParams).q;return <FlightRouteDirectory query={typeof q==='string'?q:''}/>;
}
