import {refundLabel, type FlightFare, type FlightSegment} from './booking-presentation';
import {comparableFareEstimate, haveComparableCurrency} from './fare-display';
/** Public supplier labels only; no airport lookup or inferred nearby-airport identity. */
export function airportDecisionLabel(airport:FlightSegment['da']|undefined){
 if(!airport)return 'Airport not supplied';
 return [airport.code,airport.name,airport.city,airport.country].filter((value,index,values)=>Boolean(value)&&values.indexOf(value)===index).join(' · ')||'Airport not supplied';
}
const fareNames = new Map([
 ['PUBLISHED', 'Standard fare'],
 ['STANDARD', 'Standard fare'],
 ['FLEXIBLE', 'Flexible fare'],
 ['FLEX', 'Flexible fare'],
 ['FLEXI', 'Flexi'],
 ['FLEXI_PLUS', 'Flexi Plus'],
 ['CORPORATE', 'Corporate fare'],
 ['SPECIAL_RETURN', 'Special return fare'],
 ['STUDENT', 'Student fare'],
 ['SENIOR_CITIZEN', 'Senior citizen fare'],
 ['ARMED_FORCES', 'Armed forces fare'],
 ['SPICESAVER', 'SpiceSaver'],
 ['SPICEFLEX', 'SpiceFlex'],
 ['STRETCH', 'Stretch'],
 ['STRETCH_PLUS', 'Stretch Plus'],
 ['SUPER_6E', 'Super 6E'],
 ['LITE', 'Lite'],
 ['NDC_VALUE', 'Value'],
 ['NDC_XPRESS_VALUE', 'Xpress Value'],
 ['NDC_CORPORATE_VALUE', 'Corporate Value'],
 ['SAVER', 'Saver fare'],
 ['SME', 'SME fare'],
]);
const readableFareWords = /^(?:economy|business|first|premium|value|basic|lite|plus|smart|flex|saver|comfort|classic|standard|priority)(?:[ _]+(?:economy|business|class|premium|value|basic|lite|plus|smart|flex|saver|comfort|classic|standard|priority)){1,3}$/i;

export function fareDecisionName(fare: FlightFare) {
 const identifier = typeof fare.fareIdentifier === 'string' ? fare.fareIdentifier.trim() : '';
 const name = fareNames.get(identifier.toUpperCase().replace(/[\s-]+/g, '_'));
 if (name) return name;
 return readableFareWords.test(identifier) ? identifier.toLowerCase().replace(/[_ ]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Fare option';
}

/** Keep distinct offers with the same displayed name separately selectable. */
export function fareDecisionLabel(fare: FlightFare, offers: readonly FlightFare[]) {
 const name = fareDecisionName(fare);
 const price = comparableFareEstimate(fare,'INR');
 const same = offers.filter(item => fareDecisionName(item) === name && comparableFareEstimate(item,'INR') === price);
 if (same.length < 2) return name;
 const position = same.findIndex(item => item.id === fare.id) + 1;
 return name === 'Fare option' ? `${name} ${position}` : `${name} · Option ${position}`;
}
/** Bare supplier quantities are not kilograms or pieces. Preserve the supplied
 * text, adding a qualification only where it contains quantities but no unit. */
export function baggageDecisionLabel(value:unknown):string{
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?`${value} (unit not supplied)`:'Not supplied';
 if(typeof value!=='string'||!value.trim())return 'Not supplied';
 const text=value.trim();
 return /\d/.test(text)&&/^[\d\s.,/+×x-]+$/.test(text)?`${text} (unit not supplied)`:text;
}

/** Only known INR estimates for selectable offers may anchor price differences. */
export function lowestComparableFare(offers: readonly FlightFare[], isCompatible: (fare: FlightFare) => boolean) {
 if (!haveComparableCurrency(offers, 'INR')) return undefined;
 let lowest: FlightFare | undefined;
 let lowestPrice = Infinity;
 for (const offer of offers) {
  const price = comparableFareEstimate(offer, 'INR');
  if (price !== null && price < lowestPrice && isCompatible(offer)) {
   lowest = offer;
   lowestPrice = price;
  }
 }
 return lowest;
}

export function fareDecisionDetails(fare: FlightFare, baseline?: FlightFare) {
 const detail = fare.fD.ADULT;
 const base = baseline?.fD.ADULT;
 const cabin = (value?: string) => value?.replaceAll('_', ' ').trim() || 'Not supplied';
 const cancellation = refundLabel(detail?.rT);
 const baseCancellation = refundLabel(base?.rT);
 const rows = [
  { label: 'Cabin', value: cabin(detail?.cc), baseValue: cabin(base?.cc) },
  { label: 'Cabin baggage', value: baggageDecisionLabel(detail?.bI?.cB), baseValue: baggageDecisionLabel(base?.bI?.cB) },
  { label: 'Checked baggage', value: baggageDecisionLabel(detail?.bI?.iB), baseValue: baggageDecisionLabel(base?.bI?.iB) },
  { label: 'Cancellation', value: cancellation, baseValue: baseCancellation },
 ];
 const known = (value: string) => value !== 'Not supplied' && value !== 'Cancellation terms at review' && !value.endsWith('(unit not supplied)');
 return rows.map(({label, value, baseValue}) => ({
  label,
  value,
  differs: known(value) && known(baseValue) && value.toLowerCase() !== baseValue.toLowerCase(),
 }));
}
