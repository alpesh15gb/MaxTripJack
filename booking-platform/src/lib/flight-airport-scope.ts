/** The public search model selects airports, not metropolitan areas. Never relabel supplier airports. */
export type AirportCriteria={from:string;to:string;date:string;returnDate?:string;legs?:{from:string;to:string;date:string}[]};
function object(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function routes(criteria:AirportCriteria){return criteria.legs??[{from:criteria.from,to:criteria.to,date:criteria.date},...(criteria.returnDate?[{from:criteria.to,to:criteria.from,date:criteria.returnDate}]:[])];}
function legEnds(segments:readonly unknown[],legs:{from:string;to:string;date:string}[]):number[]|null{
 if(!segments.length||segments.length>60||!legs.length)return null;
 // Partition complete itineraries at actual requested endpoints, not at every connecting segment.
 const memo=new Map<string,number[]|null>();
 function visit(legIndex:number,start:number):number[]|null{
  if(legIndex===legs.length)return start===segments.length?[]:null;
  const key=`${legIndex}:${start}`;const cached=memo.get(key);if(cached!==undefined)return cached;
  const leg=legs[legIndex],first=object(segments[start]);
  if(object(first.da).code!==leg.from||typeof first.dt!=='string'||first.dt.slice(0,10)!==leg.date)return null;
  for(let end=start;end<segments.length;end++){
   if(object(object(segments[end]).aa).code!==leg.to)continue;
   const rest=visit(legIndex+1,end+1);
   if(rest!==null){const result=[end+1,...rest];memo.set(key,result);return result;}
  }
  memo.set(key,null);return null;
 }
 return visit(0,0);
}

function matches(trip:unknown,legs:{from:string;to:string;date:string}[]):boolean{
 const segments=object(trip).sI;
 return Array.isArray(segments)&&legEnds(segments,legs)!==null;
}

/** Keep the booked journey boundaries even when the supplier sends a combined fare. */
export function splitFlightItinerary<T>(segments:readonly T[],criteria:AirportCriteria):T[][]|null{
 const ends=legEnds(segments,routes(criteria));
 return ends?.map((end,index)=>segments.slice(index===0?0:ends[index-1],end))??null;
}

export function oneWayTrips<T>(trips:readonly T[],criteria:AirportCriteria):T[]{
 return trips.filter(trip=>matches(trip,[criteria]));
}

/** Match both whole-path and sector fare-rule keys on the selected departure. */
export function oneWayRouteKeys(criteria:AirportCriteria,trips:readonly unknown[]):Set<string>{
 const keys=new Set([`${criteria.from}-${criteria.to}`]);
 for(const trip of oneWayTrips(trips,criteria)){
  const segments=object(trip).sI as unknown[];
  for(let start=0;start<segments.length;start++){
   const from=object(object(segments[start]).da).code;
   if(typeof from!=='string')continue;
   const path=[from];
   for(let end=start;end<segments.length&&end<start+7;end++){
    const segment=object(segments[end]);
    const to=object(segment.aa).code;
    if(object(segment.da).code!==path.at(-1)||typeof to!=='string')break;
    path.push(to);
    keys.add(`${from}-${to}`);
    keys.add(path.join('-'));
   }
  }
 }
 return keys;
}
export function exactAirportGroups(value:unknown,criteria:AirportCriteria):Record<string,unknown[]> {
 const groups=object(value),legs=routes(criteria),result:Record<string,unknown[]>={};
 const numeric=Object.keys(groups).filter(key=>/^\d+$/.test(key)).sort((a,b)=>Number(a)-Number(b));
 for(const [group,trips] of Object.entries(groups)){
  if(!Array.isArray(trips))continue;
  const expected=group==='COMBO'?legs:criteria.legs?(numeric.length===legs.length&&numeric.includes(group)?[legs[numeric.indexOf(group)]]:[]):group==='ONWARD'?[legs[0]]:group==='RETURN'&&criteria.returnDate?[legs[1]]:[];
  result[group]=trips.filter(trip=>matches(trip,expected));
 }
 // A surviving individual leg is not a complete selectable return/multi-city journey.
 // COMBO is explicitly a complete itinerary and was validated across every requested boundary.
 if(result.COMBO?.length)return result;
 const required=criteria.legs?numeric:criteria.returnDate?['ONWARD','RETURN']:['ONWARD'];
 const complete=required.length===legs.length&&required.every(group=>Boolean(result[group]?.length));
 return complete?result:Object.fromEntries(Object.keys(result).map(group=>[group,[]]));
}
