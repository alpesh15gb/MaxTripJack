import { notFound,permanentRedirect } from "next/navigation";
import {cache} from 'react';
import { FlightGuideView } from "@/components/public-content";
import { flightGuides, getFlightGuide } from "@/lib/flight-guides";
import { pageMetadata } from "@/lib/seo";
import {routePairFromSlug,authoredRoutePath,flightRoutePath} from '@/lib/flight-route-catalogue';
import {getFlightRoute} from '@/lib/flight-route-store';
import {flightRouteMetadata} from '@/lib/flight-route-seo';
import FlightRoutePage from '@/components/flight-route-page';

// Authored guides plus evidenced catalogue entries; never airport Cartesian permutations.
export const dynamicParams = true;
export function generateStaticParams() {
  return flightGuides.map(guide => ({ slug: guide.slug }));
}

const resolve=cache(async(slug:string)=>{
  const guide=getFlightGuide(slug);if(guide)return {guide};
  const pair=routePairFromSlug(slug);if(!pair)notFound();
  const authored=authoredRoutePath(pair.from,pair.to);if(authored)permanentRedirect(authored);
  const route=await getFlightRoute(pair.from,pair.to);if(!route)notFound();
  const path=flightRoutePath(route);if(path!==`/flights/${slug}`)permanentRedirect(path);
  return {route};
});

export async function generateMetadata({ params,searchParams }: { params: Promise<{ slug: string }>;searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  const resolved=await resolve((await params).slug);
  if(resolved.guide)return pageMetadata(`/flights/${resolved.guide.slug}`,resolved.guide.title,resolved.guide.description);
  return flightRouteMetadata(resolved.route!,Object.keys(await searchParams).length>0);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const resolved=await resolve((await params).slug);
  return resolved.guide?<FlightGuideView guide={resolved.guide}/>:<FlightRoutePage route={resolved.route!}/>;
}
