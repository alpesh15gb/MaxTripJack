import 'server-only';
import { database } from './db';
import { authoredRoutePath,flightRouteIndexEligible,flightRouteContentReady,routeAirport,type FlightRouteRecord } from './flight-route-catalogue';
import { INDEXABLE_FLIGHT_ROUTE_WHERE,UPSERT_FLIGHT_ROUTE_SQL } from './flight-route-store-sql';
import { FLIGHT_ROUTE_SITEMAP_SIZE } from './flight-route-paths';
import { flightGuides } from './flight-guides';

type StoredRoute={origin_code:string;destination_code:string;canonical_slug:string;source_url:string;source_environment:'uat'|'production';source_kind:'manifest'|'observed';verified_at:Date|string;notes:string;active:boolean;updated_at:Date|string};
const iso=(value:Date|string)=>new Date(value).toISOString();
const project=(row:StoredRoute):FlightRouteRecord=>({from:row.origin_code,to:row.destination_code,slug:row.canonical_slug,sourceUrl:row.source_url,environment:row.source_environment,sourceKind:row.source_kind,verifiedAt:iso(row.verified_at),notes:row.notes,active:row.active,updatedAt:iso(row.updated_at)});
const authoredPairs=flightGuides.map(g=>`${g.origin.code}-${g.destination.code}`);
export async function getFlightRoute(from:string,to:string):Promise<FlightRouteRecord|null> {
  if(!routeAirport(from)||!routeAirport(to)||from===to)return null;
  const result=await database().query<StoredRoute>('SELECT * FROM flight_route_catalogue WHERE origin_code=$1 AND destination_code=$2 AND active=true',[from,to]);
  return result.rows[0]?project(result.rows[0]):null;
}
export async function upsertFlightRoute(route:FlightRouteRecord) {
  return database().query(UPSERT_FLIGHT_ROUTE_SQL,[route.from,route.to,route.slug,route.sourceUrl,route.environment,route.sourceKind,route.verifiedAt,route.notes,route.active,flightRouteContentReady(route)]);
}
export async function listFlightRoutes({page=1,pageSize=24,query=''}:{page?:number;pageSize?:number;query?:string}={}) {
  if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isInteger(pageSize)||pageSize<1||pageSize>10000)throw Error('Invalid route catalogue page.');
  const text=query.trim().slice(0,80).split(/\s+/).map(word=>word.replace(/[\\%_]/g,'\\$&')).join('%');
  const where=`${INDEXABLE_FLIGHT_ROUTE_WHERE} AND NOT(origin_code||'-'||destination_code=ANY($1::text[])) AND ($2='' OR canonical_slug ILIKE '%'||$2||'%' OR origin_code ILIKE '%'||$2||'%' OR destination_code ILIKE '%'||$2||'%')`;
  const [count,rows]=await Promise.all([
    database().query<{count:string}>(`SELECT count(*) FROM flight_route_catalogue WHERE ${where}`,[authoredPairs,text]),
    database().query<StoredRoute>(`SELECT * FROM flight_route_catalogue WHERE ${where} ORDER BY origin_code,destination_code LIMIT $3 OFFSET $4`,[authoredPairs,text,pageSize,(page-1)*pageSize]),
  ]);
  return {routes:rows.rows.map(project).filter(route=>flightRouteIndexEligible(route)),total:Number(count.rows[0].count)};
}
export async function getFlightRouteCatalogueStats() {
  const result=await database().query<{total:string;active:string;eligible:string;uat:string}>(`SELECT count(*) total,count(*) FILTER(WHERE active) active,count(*) FILTER(WHERE ${INDEXABLE_FLIGHT_ROUTE_WHERE}) eligible,count(*) FILTER(WHERE source_environment='uat') uat FROM flight_route_catalogue`);
  return Object.fromEntries(Object.entries(result.rows[0]).map(([key,value])=>[key,Number(value)])) as {total:number;active:number;eligible:number;uat:number};
}
export async function listFlightSitemapRoutes(shard:number) {
  if(!Number.isSafeInteger(shard)||shard<0||shard>100000)throw Error('Invalid sitemap shard.');
  const result=await listFlightRoutes({page:shard+1,pageSize:FLIGHT_ROUTE_SITEMAP_SIZE});
  return {...result,routes:result.routes.filter(route=>!authoredRoutePath(route.from,route.to))};
}
