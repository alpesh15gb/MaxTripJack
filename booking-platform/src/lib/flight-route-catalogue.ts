import { z } from 'zod';
import airports from '@/data/airports.json';
import zones from '@/data/airport-timezones.json';
import { flightGuides } from './flight-guides';
import {exactAirportGroups,type AirportCriteria} from './flight-airport-scope';

export type RouteAirport = {code:string;name:string;city:string;country:string;timezone?:string};
export type FlightRouteRecord = {
  from:string;to:string;slug:string;sourceUrl:string;environment:'uat'|'production';
  sourceKind:'manifest'|'observed';verifiedAt:string;notes:string;active:boolean;updatedAt:string;
};
const airportMap = new Map(airports.filter(a=>a.city.trim()&&a.name.trim()).map(a=>[a.code,a]));
export function routeAirport(code:string):RouteAirport|undefined {
  const airport=airportMap.get(code);if(!airport)return undefined;
  const timezone=(zones as Record<string,string>)[code]??(airport.country==='IN'?'Asia/Kolkata':undefined);
  return {...airport,...(timezone?{timezone}:{})};
}
const segment=(value:string)=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65).replace(/-$/,'')||'airport';
export function routeSlug(from:string,to:string) {
  const origin=routeAirport(from),destination=routeAirport(to);
  if(!origin||!destination||from===to)throw Error('Choose two different airports from the airport catalogue.');
  return `${segment(origin.city)}-${from.toLowerCase()}-to-${segment(destination.city)}-${to.toLowerCase()}`;
}
export function routePairFromSlug(slug:string):{from:string;to:string}|null {
  if(slug.length>180)return null;
  const match=/^[a-z0-9]+(?:-[a-z0-9]+)*-([a-z]{3})-to-[a-z0-9]+(?:-[a-z0-9]+)*-([a-z]{3})$/.exec(slug);
  if(!match)return null;
  const from=match[1].toUpperCase(),to=match[2].toUpperCase();
  return from!==to&&routeAirport(from)&&routeAirport(to)?{from,to}:null;
}
export function authoredRoutePath(from:string,to:string) {
  const guide=flightGuides.find(g=>g.origin.code===from&&g.destination.code===to);
  return guide?`/flights/${guide.slug}`:undefined;
}
export function flightRoutePath(route:Pick<FlightRouteRecord,'from'|'to'|'slug'>) {
  return authoredRoutePath(route.from,route.to)??`/flights/${route.slug}`;
}
export function safeRouteSourceUrl(value:string) {
  try {const url=new URL(value);return value.length<=1000&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&!/[\\\s]/.test(value)&&url.hostname.includes('.')&&!/\.(?:localhost|local|internal|test|invalid|example)$/.test(url.hostname)&&! /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)&&!/^\d+(?:\.\d+){3}$/.test(url.hostname);}
  catch{return false;}
}
export const routeManifestRow=z.object({
  from:z.string().regex(/^[A-Z]{3}$/),to:z.string().regex(/^[A-Z]{3}$/),
  sourceUrl:z.string().refine(safeRouteSourceUrl,'Use a public HTTPS provenance URL without credentials or query strings.'),
  verifiedAt:z.string().datetime({offset:true}),environment:z.enum(['uat','production']),
  notes:z.string().trim().min(80).max(4000).refine(value=>!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),'Use plain text route planning notes.'),
  active:z.boolean().default(true),
}).strict().superRefine((row,ctx)=>{if(row.from===row.to||!routeAirport(row.from)||!routeAirport(row.to))ctx.addIssue({code:'custom',message:'Route endpoints must be different known airports.'});});
export function parseRouteManifestRow(value:unknown,now=Date.now()):FlightRouteRecord {
  const row=routeManifestRow.parse(value);if(Date.parse(row.verifiedAt)>now+300000)throw Error('Route verification cannot be in the future.');
  return {...row,slug:routeSlug(row.from,row.to),sourceKind:'manifest',updatedAt:row.verifiedAt};
}
/** Actual production evidence, complete identities and recent verification are all required. */
export function flightRouteIndexEligible(route:FlightRouteRecord,now=Date.now()) {
  const verified=Date.parse(route.verifiedAt);
  return route.active&&route.environment==='production'&&Number.isFinite(verified)&&verified<=now+300000&&now-verified<=180*86400000
    &&flightRouteContentReady(route);
}
export function flightRouteContentReady(route:Pick<FlightRouteRecord,'from'|'to'|'notes'|'sourceUrl'>) {
  const a=routeAirport(route.from),b=routeAirport(route.to);
  return route.from!==route.to&&Boolean(a?.timezone&&b?.timezone)&&route.notes.trim().length>=80&&safeRouteSourceUrl(route.sourceUrl);
}
/** Extract actual itinerary endpoints only; no fares, passengers or contact data retained. */
export function observedFlightPairs(results:unknown,criteria?:AirportCriteria):{from:string;to:string}[] {
  const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
  const groups=obj(obj(results).searchResult).tripInfos;const pairs=new Map<string,{from:string;to:string}>();
  if(criteria) {
    const matched=exactAirportGroups(groups,criteria);
    if(!Object.values(matched).some(group=>Array.isArray(group)&&group.length>0))return [];
    const legs=criteria.legs??[{from:criteria.from,to:criteria.to},...(criteria.returnDate?[{from:criteria.to,to:criteria.from}]:[])];
    return legs.filter(leg=>leg.from!==leg.to&&routeAirport(leg.from)&&routeAirport(leg.to)).filter((leg,index,all)=>all.findIndex(row=>row.from===leg.from&&row.to===leg.to)===index).slice(0,6).map(({from,to})=>({from,to}));
  }
  for(const group of Object.values(obj(groups)).slice(0,10)) {
    for(const item of (Array.isArray(group)?group:[]).slice(0,100)) {
      const segments=obj(item).sI;if(!Array.isArray(segments)||!segments.length||segments.length>60)continue;
      const from=obj(obj(segments[0]).da).code,to=obj(obj(segments.at(-1)).aa).code;
      if(typeof from==='string'&&typeof to==='string'&&from!==to&&routeAirport(from)&&routeAirport(to))pairs.set(`${from}-${to}`,{from,to});
      if(pairs.size>=20)return [...pairs.values()];
    }
  }
  return [...pairs.values()];
}
export function observedRouteNotes(from:string,to:string) {
  const a=routeAirport(from),b=routeAirport(to);if(!a||!b)throw Error('Unknown route airports.');
  return `Plan travel from ${a.name} (${a.code}) in ${a.city}, ${a.country}, to ${b.name} (${b.code}) in ${b.city}, ${b.country}. This airport pair was returned in a supplier search; availability must be checked again for your dates. Compare the complete journey, including connections and arrival dates, before choosing a fare. ${a.timezone&&a.timezone===b.timezone?'Both airport time zones match; an overnight journey can still arrive on a later day.':'Read each airport’s local time and the dates on your selected itinerary.'}`;
}
export function flightDiscoveryLimit(args:string[]) {
  if(args.length===0)return 500;
  if(args.length!==2||args[0]!=='--limit'||! /^(?:[1-9]\d{0,2}|1000)$/.test(args[1]))throw Error('Usage: sync-flight-routes.mjs [--limit 1..1000]');
  return Number(args[1]);
}
