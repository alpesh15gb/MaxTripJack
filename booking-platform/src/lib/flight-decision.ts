import type {FlightFare,FlightSegment} from './booking-presentation';
/** Public supplier labels only; no airport lookup or inferred nearby-airport identity. */
export function airportDecisionLabel(airport:FlightSegment['da']|undefined){
 if(!airport)return 'Airport not supplied';
 return [airport.code,airport.name,airport.city,airport.country].filter((value,index,values)=>Boolean(value)&&values.indexOf(value)===index).join(' · ')||'Airport not supplied';
}
/** Similar supplier labels are not proof of identical entitlements. Keep IDs separate. */
export function fareDecisionLabel(fare:FlightFare,offers:readonly FlightFare[]){
 const label=fare.fareIdentifier.replaceAll('_',' ');
 const same=offers.filter(item=>item.fareIdentifier===fare.fareIdentifier);
 return same.length>1?`${label} · Option ${same.findIndex(item=>item.id===fare.id)+1}`:label;
}
/** Bare supplier quantities are not kilograms or pieces. Preserve the supplied
 * text, adding a qualification only where it contains quantities but no unit. */
export function baggageDecisionLabel(value:unknown):string{
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?`${value} (unit not supplied)`:'Not supplied';
 if(typeof value!=='string'||!value.trim())return 'Not supplied';
 const text=value.trim();
 return /\d/.test(text)&&/^[\d\s.,/+×x-]+$/.test(text)?`${text} (unit not supplied)`:text;
}
