/** Pure helpers for the indicative fare calendar (no I/O, unit-tested). */
export const FARE_CALENDAR_FRESH_MS = 5 * 60_000;
export const FARE_CALENDAR_SHOW_MS = 12 * 60 * 60_000;
export const FARE_CALENDAR_MAX_DAYS = 62;
export const FARE_CALENDAR_TIMELINE_DAYS = 15;
export const CABINS = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;
export type Cabin = typeof CABINS[number];
export type FareDay = {date: string; minor: number | null; observedAt: number};
export type FareCalendarDay = {minor: number; band: 'low' | 'mid' | 'high'};

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const day = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !day.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function fareCalendarDates(start: string, days: number) {
  return Array.from({length: days}, (_, offset) => addDays(start, offset));
}

/** Center the adult fare strip on departure, keeping every visible day searchable. */
export function fareCalendarWindow(anchor: string, today: string) {
  const first = addDays(anchor, -Math.floor(FARE_CALENDAR_TIMELINE_DAYS / 2));
  return fareCalendarDates(first < today ? today : first, FARE_CALENDAR_TIMELINE_DAYS);
}

const restrictedFares = new Set(['ARMED_FORCES','CORPORATE','SENIOR_CITIZEN','SME','SPECIAL_RETURN','STUDENT']);

/** Lowest selectable estimate for a public one-way search for exactly one adult. */
export function lowestAdultFareMinor(customerResults: unknown, party: {adults: number; cabin?: string; children?: number; infants?: number; returnDate?: string; legs?: unknown}) {
  if (party.legs || party.returnDate || (party.children ?? 0) > 0 || (party.infants ?? 0) > 0 || party.adults !== 1) return null;
  const onward = object(object(object(customerResults).searchResult).tripInfos).ONWARD;
  if (!Array.isArray(onward)) return null;
  let lowest = Infinity;
  for (const trip of onward) for (const price of (Array.isArray(object(trip).totalPriceList) ? object(trip).totalPriceList as unknown[] : [])) {
    const fare = object(price);
    if (typeof fare.id !== 'string' || !fare.id.trim()) continue;
    if (typeof fare.fareIdentifier === 'string' && restrictedFares.has(fare.fareIdentifier.trim().toUpperCase().replace(/\s+/g, '_'))) continue;
    const cabin = object(object(fare.fD).ADULT).cc;
    if (party.cabin && typeof cabin === 'string' && cabin.trim() && cabin.trim().toUpperCase().replace(/\s+/g, '_') !== party.cabin) continue;
    const estimate = fare.customerEstimateMinor;
    if (typeof estimate === 'number' && Number.isSafeInteger(estimate) && estimate > 0 && estimate <= 1_000_000_000) lowest = Math.min(lowest, estimate);
  }
  return Number.isFinite(lowest) ? lowest : null;
}

/** Colour bands relative to the visible window, like the OTAs' green/red days. */
export function bandFares(days: FareDay[], now: number): Record<string, FareCalendarDay> {
  const visible = days.filter((item): item is FareDay & {minor: number} => item.minor !== null && item.minor > 0 && now - item.observedAt < FARE_CALENDAR_SHOW_MS);
  if (!visible.length) return {};
  const sorted = [...new Set(visible.map(item => item.minor))].sort((a, b) => a - b);
  const low = sorted[Math.floor((sorted.length - 1) * 0.33)], high = sorted[Math.floor((sorted.length - 1) * 0.75)];
  const comparable = visible.length >= 3 && sorted.length > 1;
  return Object.fromEntries(visible.map(item => [item.date, {minor: item.minor, band: !comparable ? 'mid' : item.minor <= low ? 'low' : item.minor > high ? 'high' : 'mid'}]));
}

/** Dates in the window whose observation is missing or older than five minutes. */
export function staleDates(dates: string[], observed: FareDay[], now: number) {
  const fresh = new Set(observed.filter(item => now - item.observedAt < FARE_CALENDAR_FRESH_MS).map(item => item.date));
  return dates.filter(date => !fresh.has(date));
}

export function compactRupees(minor: number) {
  const rupees = Math.round(minor / 100);
  return rupees >= 100_000 ? `${(rupees / 100_000).toFixed(rupees >= 1_000_000 ? 0 : 1)}L` : rupees.toLocaleString('en-IN');
}
