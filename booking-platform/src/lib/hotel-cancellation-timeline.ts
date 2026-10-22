import {hotelCancellation,hotelObject,hotelCancellationScheduleIsUnambiguous} from './hotel-presentation';
import {supplierInstant} from './supplier-time';
export type CancellationWindow={from:string;until:string;charge:string};
/** Hotel v3 policy timestamps use Kolkata time. Monetary units/scope are not inferred. */
export function hotelCancellationTimeline(source:unknown):CancellationWindow[]|null {
  const raw=hotelObject(source),policy=hotelCancellation(source);
  if(!Array.isArray(raw.penalties)||!raw.penalties.length||policy.penalties.length!==raw.penalties.length||!hotelCancellationScheduleIsUnambiguous(policy))return null;
  const sorted=policy.penalties.map(row=>({...row,start:supplierInstant(row.from,'+05:30')!,end:supplierInstant(row.to,'+05:30')!})).sort((a,b)=>a.start-b.start);
  if(sorted.some(row=>row.amount===0&&policy.isRefundable===false))return null;
  const date=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return sorted.map(row=>({from:date.format(row.start),until:date.format(row.end),charge:row.amount===0?'No supplier cancellation charge in this window':`Supplier cancellation charge applies. Reported amount: ${row.amount}. Currency, units and calculation basis are not specified.`}));
}
