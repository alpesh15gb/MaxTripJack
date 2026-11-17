import {notFound,permanentRedirect} from 'next/navigation';
import FlightRouteDirectory,{flightDirectoryPath} from '@/components/flight-route-directory';
import {canonicalUrl,indexingEnabled} from '@/lib/seo';
const parse=(value:string)=>{if(!/^[1-9]\d{0,5}$/.test(value)||Number(value)>100000)notFound();if(value==='1')permanentRedirect('/flights/routes');return Number(value);};
export async function generateMetadata({params,searchParams}:{params:Promise<{page:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const page=parse((await params).page);return {title:`Flight routes · Page ${page}`,description:'Explore more flight route planning pages and airport details with MaxTravel.',alternates:{canonical:canonicalUrl(flightDirectoryPath(page))},robots:{index:indexingEnabled()&&Object.keys(await searchParams).length===0,follow:true}};
}
export default async function Page({params,searchParams}:{params:Promise<{page:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const page=parse((await params).page),q=(await searchParams).q;return <FlightRouteDirectory page={page} query={typeof q==='string'?q:''}/>;
}
