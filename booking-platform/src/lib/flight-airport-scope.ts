/** The public search model selects airports, not metropolitan areas. Never relabel supplier airports. */
export type AirportCriteria={from:string;to:string;date:string;returnDate?:string;legs?:{from:string;to:string;date:string}[]};
function object(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function routes(criteria:AirportCriteria){return criteria.legs??[{from:criteria.from,to:criteria.to,date:criteria.date},...(criteria.returnDate?[{from:criteria.to,to:criteria.from,date:criteria.returnDate}]:[])];}
function matches(trip:unknown,legs:{from:string;to:string;date:string}[]):boolean{
 const rawSegments=object(trip).sI;if(!Array.isArray(rawSegments)||!rawSegments.length||rawSegments.length>60||!legs.length)return false;
 const segments:unknown[]=rawSegments;
 // Partition complete itineraries at actual requested endpoints, not at every connecting segment.
 const memo=new Map<string,boolean>();
 function visit(legIndex:number,start:number):boolean{
  if(legIndex===legs.length)return start===segments.length;
  const key=`${legIndex}:${start}`;if(memo.has(key))return memo.get(key)!;
  const leg=legs[legIndex],first=object(segments[start]);
  if(object(first.da).code!==leg.from||typeof first.dt!=='string'||first.dt.slice(0,10)!==leg.date)return false;
  for(let end=start;end<segments.length;end++)if(object(object(segments[end]).aa).code===leg.to&&visit(legIndex+1,end+1)){memo.set(key,true);return true;}
  memo.set(key,false);return false;
 }
 return visit(0,0);
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
