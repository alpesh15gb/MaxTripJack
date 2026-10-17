import { z } from "zod";
export const cancellationSelection=z.array(z.object({tripIndex:z.number().int().min(0).max(5),travellerIndexes:z.array(z.number().int().min(0).max(17)).min(1).max(18)}).strict()).min(1).max(6);
export type CancellationScope={units:string[];trips:{src:string;dest:string;departureDate:string;travellers:{fn:string;ln:string}[]}[]};
export type CancellationOptions={trips:{src:string;dest:string;departureDate:string}[];travellers:{fn:string;ln:string}[]};
/** Names and routes come from the booked quote, never from cancellation form text. */
export function cancellationOptions(review:unknown,guests:unknown,criteria?:{from?:string;to?:string;date?:string;returnDate?:string;legs?:{from:string;to:string;date:string}[]}):CancellationOptions {
 const r=review as {tripInfos?:{sI?:{da?:{code?:string};aa?:{code?:string};dt?:string}[]}[]};
 const g=guests as {travellers?:{fN:string;lN:string}[]};
 const searched=criteria?.legs??(criteria?.from&&criteria.to&&criteria.date?[{from:criteria.from,to:criteria.to,date:criteria.date},...(criteria.returnDate?[{from:criteria.to,to:criteria.from,date:criteria.returnDate}]:[])]:null);
 const trips=searched?searched.map(leg=>({src:leg.from,dest:leg.to,departureDate:leg.date})):(r?.tripInfos??[]).map(trip=>({src:trip.sI?.[0]?.da?.code??"",dest:trip.sI?.at(-1)?.aa?.code??"",departureDate:trip.sI?.[0]?.dt?.slice(0,10)??""}));
 if(!trips.length||trips.length>6||trips.some(t=>!/^\w{3}$/.test(t.src)||!/^\w{3}$/.test(t.dest)||!/^\d{4}-\d{2}-\d{2}$/.test(t.departureDate)))return {trips:[],travellers:[]};
 const travellers=(g?.travellers??[]).map(t=>({fn:t.fN,ln:t.lN}));
 // Supplier partial amendments identify passengers by name. Ambiguous names need manual handling.
 if(new Set(travellers.map(t=>`${t.fn.toLowerCase()}:${t.ln.toLowerCase()}`)).size!==travellers.length)return {trips:[],travellers:[]};
 return {trips,travellers};
}
export function selectCancellationScope(options:CancellationOptions,selection:z.infer<typeof cancellationSelection>|undefined,previous:(CancellationScope|null)[]):{scope:CancellationScope|null;isPartial:boolean} {
 if(!selection&&!previous.length)return {scope:null,isPartial:false};
 if(!options.trips.length||!options.travellers.length)throw Error("Partial cancellation requires a complete supplier itinerary and distinct passenger names. Contact support.");
 if(previous.some(s=>s===null))throw Error("The booking has already been cancelled.");
 const removed=new Set(previous.flatMap(s=>s!.units));
 const available=options.trips.flatMap((_,i)=>options.travellers.map((_,j)=>`${i}:${j}`)).filter(unit=>!removed.has(unit));
 const units=selection?selection.flatMap(s=>s.travellerIndexes.map(j=>`${s.tripIndex}:${j}`)):available;
 if(!units.length||new Set(units).size!==units.length||units.some(unit=>!available.includes(unit)))throw Error("Select available passengers and trips only; repeated selections are not allowed.");
 const trips=options.trips.flatMap((trip,i)=>{const travellers=options.travellers.filter((_,j)=>units.includes(`${i}:${j}`));return travellers.length?[{...trip,travellers}]:[];});
 return {scope:{units,trips},isPartial:units.length<available.length};
}
export function cancellationBody(row:{supplier_booking_id:string;review_note?:string;reason:string;scope?:CancellationScope|null}) {return {bookingId:row.supplier_booking_id,type:"CANCELLATION",remarks:row.review_note||row.reason,...(row.scope?{trips:row.scope.trips}:{})};}
