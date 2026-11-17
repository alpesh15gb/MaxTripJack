import type { Metadata } from 'next';
import { canonicalUrl,indexingEnabled,SITE_NAME } from './seo';
import { flightRouteIndexEligible,flightRoutePath,routeAirport,type FlightRouteRecord } from './flight-route-catalogue';
import { bookingSearchUrl } from './booking-search-state';

export function flightRouteTitle(route:FlightRouteRecord) {
  return `${routeAirport(route.from)!.city} to ${routeAirport(route.to)!.city} Flights: ${route.from}–${route.to}`;
}
export function flightRouteDescription(route:FlightRouteRecord) {
  const a=routeAirport(route.from)!,b=routeAirport(route.to)!;
  return `Plan ${a.city} to ${b.city} flights with ${route.from} and ${route.to} airport details, time zones and fare-comparison guidance. Choose dates to check current options.`;
}
export function flightRouteSearchHref(route:Pick<FlightRouteRecord,'from'|'to'>) {
  return bookingSearchUrl({product:'FLIGHT',from:route.from,to:route.to})!;
}
export function flightRouteMetadata(route:FlightRouteRecord,hasQuery=false):Metadata {
  const url=canonicalUrl(flightRoutePath(route)),title=flightRouteTitle(route),description=flightRouteDescription(route);
  const index=!hasQuery&&indexingEnabled()&&flightRouteIndexEligible(route);
  return {title,description,alternates:{canonical:url},robots:{index,follow:true},openGraph:{type:'website',title,description,url,siteName:SITE_NAME},twitter:{card:'summary',title,description}};
}
export function flightRouteStructuredData(route:FlightRouteRecord) {
  const path=flightRoutePath(route),url=canonicalUrl(path),origin=routeAirport(route.from)!,destination=routeAirport(route.to)!;
  return [
    {'@context':'https://schema.org','@type':'WebPage','@id':`${url}#webpage`,url,name:flightRouteTitle(route),description:flightRouteDescription(route),dateModified:route.updatedAt,inLanguage:'en-IN',isPartOf:{'@id':`${canonicalUrl('/')}#website`},about:[{'@type':'Airport',name:origin.name,iataCode:origin.code},{'@type':'Airport',name:destination.name,iataCode:destination.code}],breadcrumb:{'@id':`${url}#breadcrumb`}},
    {'@context':'https://schema.org','@type':'BreadcrumbList','@id':`${url}#breadcrumb`,itemListElement:[{name:'Home',path:'/'},{name:'Flight routes',path:'/flights/routes'},{name:`${origin.city} to ${destination.city}`,path}].map((item,index)=>({'@type':'ListItem',position:index+1,name:item.name,item:canonicalUrl(item.path)}))},
  ];
}
