/** Pure customer-facing presentation helpers. Never infer a supplier promise. */
export type FlightSegment = {
  dt: string; at: string; duration?: number; isRs?: boolean;
  fD: { aI: { name: string; code?: string }; fN: string };
  da: { code: string; city?: string }; aa: { code: string; city?: string };
};
export type FlightFare = {
  id: string; fareIdentifier: string; customerEstimateMinor?: number | null;
  sri?: string; msri?: string | string[];
  fD: Record<string, { cc?: string; rT?: number; bI?: { iB?: string; cB?: string } }>;
};
export type Flight = { sI: FlightSegment[]; totalPriceList: FlightFare[] };

export function initialAdults(value?: string, product: 'FLIGHT' | 'HOTEL' = 'FLIGHT') {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= (product === 'HOTEL' ? 4 : 9) ? count : 1;
}
export function parseHotelIds(value = '') {
  const ids = value.split(',').filter(Boolean);
  return ids.length > 0 && ids.length <= 100 && ids.every(id => /^\d+$/.test(id)) ? [...new Set(ids)] : [];
}
export function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function estimatedFare(flight: Flight) {
  const prices = flight.totalPriceList.map(fare => fare.customerEstimateMinor).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}
/** Return/multicity COMBO contains several journeys, not connecting stops. */
export function flightStops(flight: Flight, group: string): number | null {
  if (group === 'COMBO') return null;
  return Math.max(0, flight.sI.length - 1);
}
/** Local airport timestamps have no common timezone. Use supplier duration for a
 * nonstop segment; only subtract timestamps when they carry explicit offsets. */
export function journeyMinutes(flight: Flight, group?: string): number | null {
  if (group === 'COMBO' || !flight.sI.length) return null;
  if (flight.sI.length === 1 && Number.isFinite(flight.sI[0].duration) && Number(flight.sI[0].duration) > 0) return Number(flight.sI[0].duration);
  const start = flight.sI[0].dt, end = flight.sI.at(-1)!.at;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(start) || !/(Z|[+-]\d{2}:?\d{2})$/.test(end)) return null;
  const minutes = (Date.parse(end) - Date.parse(start)) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null;
}
export function durationLabel(minutes: number | null) {
  return minutes === null ? 'Times shown in local airport time' : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function groupLabel(group: string) {
  if (group === 'ONWARD') return 'Outbound';
  if (group === 'RETURN') return 'Return';
  if (group === 'COMBO') return 'Complete journey';
  return /^\d+$/.test(group) ? `Flight group ${group}` : 'Journey';
}
export function orderedGroups(groups: Record<string, Flight[]>) {
  const values = Object.keys(groups).filter(group => groups[group]?.length);
  if (values.includes('COMBO')) return ['COMBO'];
  return values.sort((a, b) => {
    if (a === 'ONWARD') return -1;
    if (b === 'ONWARD') return 1;
    if (a === 'RETURN') return -1;
    if (b === 'RETURN') return 1;
    return Number(a) - Number(b);
  });
}
export function refundLabel(value: unknown) {
  // TripJack official Flights API v2.0 Search/FAQ (tripjack.com/page/api-doc):
  // rT: 0 non-refundable, 1 refundable, 2 partial refundable.
  // Rules at review always take precedence over this search-level indicator.
  if (value === 0) return 'Non-refundable';
  if (value === 1) return 'Refundable · charges may apply';
  if (value === 2) return 'Partially refundable';
  return 'Cancellation terms at review';
}
export function compatibleReturnPair(onward: FlightFare, back: FlightFare) {
  if (onward.fareIdentifier !== 'SPECIAL_RETURN' && back.fareIdentifier !== 'SPECIAL_RETURN') return true;
  return onward.fareIdentifier === 'SPECIAL_RETURN' && back.fareIdentifier === 'SPECIAL_RETURN' && Boolean(onward.sri && (Array.isArray(back.msri) ? back.msri.includes(onward.sri) : back.msri === onward.sri));
}
export function quoteRemaining(expiresAt: string, now: number) {
  const seconds = Math.ceil((Date.parse(expiresAt) - now) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/** Unknown intent/provider conflicts must never unlock a second payment path.
 * Only these known pre-intent validation failures can safely return to review. */
export function paymentFailureAction(status: number | undefined, message: string, code?: string): 'unavailable' | 'edit' | 'refresh' | 'status' {
  if (status === 503 && code === 'PAYMENT_PROVIDER_UNAVAILABLE') return 'unavailable';
  if (status !== undefined && [400,401,403,422].includes(status)) return 'edit';
  if (status === 409 && (
    message === 'Price changed. Accept the latest review.' ||
    message === 'Extras changed. Accept the updated total before paying.' ||
    message === 'This quote or search expired. Search and review again.' ||
    message.startsWith('This fare validation cannot be repeated safely. Review a new quote before paying;')
  )) return 'refresh';
  return 'status';
}
