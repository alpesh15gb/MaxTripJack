import type {FlightSegment} from './booking-presentation';
import {suppliedMinutes} from './supplier-time';
import {flightInstant} from './flight-instant';
export function segmentDurationLabel(value:unknown):string {
  const minutes=suppliedMinutes(value);
  return minutes===null?'Duration not supplied':`${Math.floor(minutes/60)}h ${minutes%60}m`;
}
/** cT is deliberately unused: its adjacent-connection association is unverified. */
export function connectionLabel(current:FlightSegment,next:FlightSegment,group?:string):string {
  if(group==='COMBO'||Boolean(next.isRs)!==Boolean(current.isRs))return 'Connection duration not supplied';
  if(!current.aa.code||!next.da.code)return 'Connection duration not supplied';
  if(current.aa.code!==next.da.code)return `Transfer between ${current.aa.code} and ${next.da.code} · transfer time not supplied`;
  const arrival=flightInstant(current.at,current.aa),departure=flightInstant(next.dt,next.da);
  if(arrival===null||departure===null||departure<arrival)return `Connection at ${current.aa.code} · duration not supplied`;
  const minutes=(departure-arrival)/60000;
  if(!Number.isSafeInteger(minutes))return `Connection at ${current.aa.code} · duration not supplied`;
  return `Connection at ${current.aa.code} · ${Math.floor(minutes/60)}h ${minutes%60}m`;
}
