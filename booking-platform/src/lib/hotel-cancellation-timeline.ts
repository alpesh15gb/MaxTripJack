import {hotelCancellation,hotelObject,hotelCancellationScheduleIsUnambiguous} from './hotel-presentation';
import {supplierInstant} from './supplier-time';
export type CancellationWindow={from:string;until:string;charge:string;chargeKnown:boolean};
/** Hotel v3 policy timestamps use Kolkata time. Monetary units/scope are not inferred. */
export function hotelCancellationTimeline(source:unknown):CancellationWindow[]|null {
  const raw=hotelObject(source),policy=hotelCancellation(source);
  if(!Array.isArray(raw.penalties)||!raw.penalties.length||policy.penalties.length!==raw.penalties.length||!hotelCancellationScheduleIsUnambiguous(policy))return null;
  const sorted=policy.penalties.map(row=>({...row,start:supplierInstant(row.from,'+05:30')!,end:supplierInstant(row.to,'+05:30')!})).sort((a,b)=>a.start-b.start);
  if(sorted.some(row=>row.amount===0&&policy.isRefundable===false))return null;
  return sorted.map(row=>({from:hotelPolicyDateTime(row.start),until:hotelPolicyDateTime(row.end),chargeKnown:row.amount===0,charge:row.amount===0?'No supplier cancellation charge in this window':'Cancellation charges apply. The exact charge cannot be confirmed: the supplier has not specified the currency, units or calculation basis.'}));
}

export const hotelPolicyDateTime=(instant:number)=>new Intl.DateTimeFormat('en-IN',{
    timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
    // Do not hide a nonzero second/millisecond at an exclusive policy boundary.
    ...(instant%60000!==0?{second:'2-digit' as const}:{}),
    ...(instant%1000!==0?{fractionalSecondDigits:3 as const}:{}),
  }).format(instant);
