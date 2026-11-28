import {estimatedFare,flightStops,type Flight} from './booking-presentation';
/** AI carrier preferences apply to every included segment, including returns. */
export function matchesFlightAirlineQuery(flight:Flight,query=''):boolean{
 const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
 const needle=normalize(query.trim());
 return !needle||(flight.sI.length>0&&flight.sI.every(segment=>normalize(`${segment.fD.aI.name} ${segment.fD.aI.code??''}`).includes(needle)));
}
/** COMBO is several journeys; do not invent a single connection count. */
export function matchesFlightStops(flight:Flight,group:string,stops:string):boolean{
 return stops==='ALL'||group==='COMBO'||String(flightStops(flight,group))===stops;
}
/** Calendar dates are local to their airports. This is not an elapsed-time calculation. */
export function arrivalDayLabel(departure:string,arrival:string):string|null{
 const day=(value:string)=>{const text=value.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const time=Date.parse(text+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===text?time:null;};
 const start=day(departure),end=day(arrival);if(start===null||end===null)return null;
 const offset=(end-start)/86400000;if(!offset)return null;
 return `${offset>0?'+':''}${offset} calendar day${Math.abs(offset)===1?'':'s'}`;
}
export const flightDepartureWindows = ['EARLY','MORNING','AFTERNOON','EVENING'] as const;
export type FlightDepartureWindow = typeof flightDepartureWindows[number];
const departureWindowEndHour: Record<FlightDepartureWindow, number> = {EARLY:5,MORNING:12,AFTERNOON:18,EVENING:24};

export function matchesFlightRefinements(flight:Flight,group:string,departure:string|readonly FlightDepartureWindow[],budget:string):boolean{
 if(budget.trim()){const limit=Number(budget),price=estimatedFare(flight);if(!Number.isFinite(limit)||limit<0||!Number.isFinite(price)||price>limit*100)return false;}
 const windows=typeof departure==='string'?(departure==='ALL'?[]:[departure]):departure;
 if(group==='COMBO'||!windows.length)return true;
 const time=flight.sI[0]?.dt.slice(11,16);if(!time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return false;
 const hour=Number(time.slice(0,2));
 const window=flightDepartureWindows.find(value=>hour<departureWindowEndHour[value]);
 return windows.some(selected=>selected===window);
}

export function flightConnectionAirports(flight:Flight,group:string):Flight['sI'][number]['aa'][] {
 if(group==='COMBO')return [];
 return flight.sI.slice(0,-1).flatMap((segment,index)=>{
  const next=flight.sI[index+1];
  return /^[A-Z]{3}$/.test(segment.aa.code)&&segment.aa.code===next.da.code&&Boolean(segment.isRs)===Boolean(next.isRs)?[segment.aa]:[];
 });
}

/** Combine identical segment payloads, retaining every distinct supplier fare. */
export function groupIdenticalFlights(flights:Flight[]):Flight[]{
 const result:Flight[]=[],index=new Map<string,Flight>();
 for(const flight of flights){
  const key=JSON.stringify(flight.sI),previous=index.get(key);
  if(!previous){const copy={...flight,totalPriceList:[...flight.totalPriceList]};index.set(key,copy);result.push(copy);continue;}
  const conflict=flight.totalPriceList.some(fare=>previous.totalPriceList.some(old=>old.id===fare.id&&JSON.stringify(old)!==JSON.stringify(fare)));
  if(conflict){result.push(flight);continue;}
  for(const fare of flight.totalPriceList)if(!previous.totalPriceList.some(old=>old.id===fare.id))previous.totalPriceList.push(fare);
 }
 return result;
}

/** Arrival time windows use the final segment's airport-local arrival time. */
export function matchesArrivalWindows(flight:Flight,group:string,windows:readonly FlightDepartureWindow[]):boolean{
 if(group==='COMBO'||!windows.length)return true;
 const time=flight.sI.at(-1)?.at.slice(11,16);if(!time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return false;
 const hour=Number(time.slice(0,2));
 const window=flightDepartureWindows.find(value=>hour<departureWindowEndHour[value]);
 return windows.some(selected=>selected===window);
}

/** True when the fare's adult allowance clearly includes checked baggage
 * (a non-zero weight or piece count). Unknown or "0" allowances do not count. */
export function fareIncludesCheckedBag(fare:Flight['totalPriceList'][number]):boolean{
 const value=fare.fD?.ADULT?.bI?.iB;
 if(typeof value!=='string')return false;
 const text=value.trim().toLowerCase();
 if(!text||/\b(no|nil|none|not included)\b/.test(text))return false;
 const amount=text.match(/\d+(?:\.\d+)?/);
 return amount!==null&&Number(amount[0])>0;
}
export function flightHasCheckedBag(flight:Flight,isCompatible:(fare:Flight['totalPriceList'][number])=>boolean=()=>true):boolean{
 return flight.totalPriceList.some(fare=>isCompatible(fare)&&fareIncludesCheckedBag(fare));
}

/** Layovers between consecutive segments of one journey. Both times are local
 * to the same connecting airport, so their difference is the wait (minutes).
 * Returns null when a time is missing. */
export function flightLayovers(flight:Flight):({airport:string;minutes:number;overnight:boolean;airportChange:boolean}|null)[]{
 return flight.sI.slice(0,-1).map((segment,index)=>{
  const next=flight.sI[index+1];
  const arrive=Date.parse(`${segment.at?.slice(0,16)}:00Z`),leave=Date.parse(`${next.dt?.slice(0,16)}:00Z`);
  if(!Number.isFinite(arrive)||!Number.isFinite(leave)||leave<arrive)return null;
  return {airport:segment.aa.code,minutes:Math.round((leave-arrive)/60000),overnight:segment.at.slice(0,10)!==next.dt.slice(0,10),airportChange:segment.aa.code!==next.da.code};
 });
}
/** Maximum single connection, in hours ('' = any). Non-stop flights always match. */
export function matchesMaxConnection(flight:Flight,group:string,maxHours:string):boolean{
 if(!maxHours||group==='COMBO')return true;
 const limit=Number(maxHours)*60;
 if(!Number.isFinite(limit))return true;
 return flightLayovers(flight).every(layover=>layover!==null&&layover.minutes<=limit);
}
