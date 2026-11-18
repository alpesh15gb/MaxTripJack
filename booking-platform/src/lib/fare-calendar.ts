import 'server-only';
import {database} from './db';
import {flightSearch,searchSchema} from './providers/contracts';
import {tripjack,paths} from './providers/tripjack';
import {cachedFlightSearch} from './flight-search-cache';
import {customerFlightResults} from './customer-pricing';
import type {PricingRule} from './customer-pricing';
import {requestLimit} from './request-limit';
import {validateSearchCriteria} from './search-validation';
import {addDays,bandFares,lowestAdultFareMinor,staleDates,type Cabin,type FareDay} from './fare-calendar-core';

// Matches supplier_searches provenance: the provider host is currently UAT.
const ENVIRONMENT='uat';
const MAX_REFRESH_DATES=7,REFRESH_CONCURRENCY=2;
const shared=globalThis as unknown as {maxtravelFareCalendarRefresh?:Map<string,Promise<void>>};
const refreshing=shared.maxtravelFareCalendarRefresh??=new Map<string,Promise<void>>();

type Route={from:string;to:string;cabin:Cabin};

export async function recordFareObservation(route:Route,date:string,minor:number){
 await database().query(`INSERT INTO flight_fare_calendar(origin_code,destination_code,cabin,departure_date,lowest_adult_minor,provider_environment,observed_at)
  VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(origin_code,destination_code,cabin,departure_date,provider_environment)
  DO UPDATE SET lowest_adult_minor=EXCLUDED.lowest_adult_minor,observed_at=EXCLUDED.observed_at`,[route.from,route.to,route.cabin,date,String(minor),ENVIRONMENT]);
}

/** Called after a public search was priced; corporate rules never feed the calendar. */
export function observeSearchFare(criteria:{product:string;from?:string;to?:string;date?:string;cabin?:string;adults?:number;children?:number;infants?:number;returnDate?:string;legs?:unknown},customerResults:unknown,companyId:string|null){
 if(companyId||criteria.product!=='FLIGHT'||!criteria.from||!criteria.to||!criteria.date||!criteria.adults)return;
 const minor=lowestAdultFareMinor(customerResults,{adults:criteria.adults,children:criteria.children,infants:criteria.infants,returnDate:criteria.returnDate,legs:criteria.legs});
 if(minor===null)return;
 void recordFareObservation({from:criteria.from,to:criteria.to,cabin:(criteria.cabin??'ECONOMY') as Cabin},criteria.date,minor).catch(()=>{});
}

async function observed(route:Route,start:string,days:number):Promise<FareDay[]>{
 const result=await database().query<{departure_date:string;lowest_adult_minor:string;observed_at:Date}>(
  `SELECT to_char(departure_date,'YYYY-MM-DD') AS departure_date,lowest_adult_minor,observed_at FROM flight_fare_calendar
   WHERE origin_code=$1 AND destination_code=$2 AND cabin=$3 AND provider_environment=$4 AND departure_date BETWEEN $5::date AND $6::date`,
  [route.from,route.to,route.cabin,ENVIRONMENT,start,addDays(start,days-1)]);
 return result.rows.map(row=>({date:row.departure_date,minor:Number(row.lowest_adult_minor),observedAt:new Date(row.observed_at).getTime()}));
}

export async function readFareCalendar(route:Route,start:string,days:number){
 const now=Date.now();
 return {days:bandFares(await observed(route,start,days),now)};
}

// Same selection as supplier-flow pricingRule for a non-corporate actor (kept local to avoid an import cycle).
async function publicFlightRule(){const rules=await database().query<PricingRule>("SELECT * FROM pricing_rules WHERE active=true AND product='FLIGHT' AND company_id IS NULL ORDER BY created_at DESC LIMIT 1");return rules.rows[0];}

async function refreshDate(route:Route,date:string){
 const criteria=searchSchema.parse({product:'FLIGHT',from:route.from,to:route.to,date,adults:1,children:0,infants:0,cabin:route.cabin});
 if(criteria.product!=='FLIGHT')return;
 validateSearchCriteria(criteria);
 const payload=flightSearch(criteria);
 // Shares the five-minute listing cache: a later real search for this day is instant.
 const [data,rule]=await Promise.all([cachedFlightSearch(payload,()=>tripjack('FLIGHT',paths.FLIGHT.search,payload)),publicFlightRule()]);
 observeSearchFare(criteria,customerFlightResults(data,criteria,rule),null);
}

/** Refresh stale days around a departure in the background. Bounded per route,
 * per process and globally; never throws to the caller. */
export function refreshFareCalendar(route:Route,dates:string[],peer:string){
 const key=`${route.from}-${route.to}-${route.cabin}`;
 const running=refreshing.get(key);
 if(running)return running;
 const work=(async()=>{
  const have=await observed(route,dates[0],Math.max(1,Math.round((Date.parse(dates.at(-1)!)-Date.parse(dates[0]))/86_400_000)+1));
  const todo=staleDates(dates,have,Date.now()).slice(0,MAX_REFRESH_DATES);
  if(!todo.length)return;
  await requestLimit('fare-calendar:global','fare-calendar-warm',40);
  await requestLimit(`fare-calendar:peer:${peer}`,'fare-calendar-warm',12);
  const queue=[...todo];
  await Promise.all(Array.from({length:REFRESH_CONCURRENCY},async()=>{for(let date=queue.shift();date;date=queue.shift())await refreshDate(route,date).catch(()=>{});}));
 })().catch(()=>{}).finally(()=>refreshing.delete(key));
 refreshing.set(key,work);
 return work;
}
