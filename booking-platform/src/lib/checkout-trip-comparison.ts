/** Only server-owned quote/search records belong here. Client search fields,
 * prices, fare IDs and traveller counts cannot prove that a payment is distinct. */
export type CheckoutTripRecord = {
  product: unknown;
  search_product: unknown;
  criteria: unknown;
  selection: unknown;
  service_kind?: unknown;
  search_service_kind?: unknown;
  parent_order_id?: unknown;
};
export const MAX_INTERRUPTED_CHECKOUTS = 20;
export type CheckoutTripComparison = 'distinct' | 'conflict' | 'unverified';
type Leg = { from: string; to: string; date: string };
type Trip = { parentOrderId: string | null } & (
  | { product: 'FLIGHT'; legs: Leg[] }
  | { product: 'HOTEL'; hotelId: string; checkIn: string; checkOut: string }
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function day(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function leg(value: unknown): Leg | null {
  const row = object(value);
  return typeof row.from === 'string' && /^[A-Z]{3}$/.test(row.from)
    && typeof row.to === 'string' && /^[A-Z]{3}$/.test(row.to) && row.from !== row.to && day(row.date)
    ? { from: row.from, to: row.to, date: row.date } : null;
}
function hotelId(value: unknown): string | null {
  // The supplier request turns IDs into numbers. Leading zeros cannot establish
  // that two selected properties are different.
  if (typeof value !== 'string' || !/^\d{1,64}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}
function trip(source: CheckoutTripRecord): Trip | null {
  const criteria = object(source.criteria), product = source.product;
  if (!['FLIGHT', 'HOTEL'].includes(product as string) || source.search_product !== product || criteria.product !== product) return null;
  const kind = source.service_kind ?? null, searchKind = source.search_service_kind ?? null;
  if (kind !== searchKind) return null;
  let parentOrderId: string | null = null;
  if (kind !== null) {
    if (product !== 'FLIGHT' || !['ANCILLARY', 'REISSUE'].includes(kind as string)
      || typeof source.parent_order_id !== 'string' || !uuid.test(source.parent_order_id)) return null;
    parentOrderId = source.parent_order_id.toLowerCase();
  } else if (source.parent_order_id != null) return null;
  if (product === 'FLIGHT') {
    const first = leg(criteria);
    if (!first) return null;
    let legs: Leg[];
    if (criteria.legs !== undefined) {
      if (!Array.isArray(criteria.legs) || criteria.legs.length < 2 || criteria.legs.length > 6 || criteria.returnDate !== undefined) return null;
      const parsed = criteria.legs.map(leg);
      if (!parsed.every((value): value is Leg => value !== null)) return null;
      if (parsed[0].from !== first.from || parsed[0].to !== first.to || parsed[0].date !== first.date
        || parsed.some((value, index) => index > 0 && value.date < parsed[index - 1].date)) return null;
      legs = parsed;
    } else {
      legs = [first];
      if (criteria.returnDate !== undefined) {
        if (!day(criteria.returnDate) || criteria.returnDate < first.date) return null;
        legs.push({ from: first.to, to: first.from, date: criteria.returnDate });
      }
    }
    return { product, legs, parentOrderId };
  }
  const chosenHotel = hotelId(object(source.selection).hid);
  const candidateIds = criteria.hotelIds;
  if (!chosenHotel || !Array.isArray(candidateIds) || !candidateIds.length || candidateIds.length > 100) return null;
  const candidates = candidateIds.map(hotelId);
  if (candidates.some(value => value === null) || !candidates.includes(chosenHotel)
    || !day(criteria.checkIn) || !day(criteria.checkOut) || criteria.checkOut <= criteria.checkIn) return null;
  return { product: 'HOTEL', hotelId: chosenHotel, checkIn: criteria.checkIn, checkOut: criteria.checkOut, parentOrderId };
}

/** Conservative trip overlap, not a claim about whether either payment ran.
 * Search/quote refreshes and different fares never create a new trip identity. */
export function compareCheckoutTrips(current: CheckoutTripRecord, interrupted: CheckoutTripRecord): CheckoutTripComparison {
  const a = trip(current), b = trip(interrupted);
  if (!a || !b) return 'unverified';
  if (a.product !== b.product) return 'distinct';
  if (a.parentOrderId && a.parentOrderId === b.parentOrderId) return 'conflict';
  if (a.product === 'FLIGHT' && b.product === 'FLIGHT') {
    return a.legs.some(left => b.legs.some(right => left.from === right.from && left.to === right.to && left.date === right.date)) ? 'conflict' : 'distinct';
  }
  if (a.product === 'HOTEL' && b.product === 'HOTEL') {
    return a.hotelId === b.hotelId && a.checkIn < b.checkOut && b.checkIn < a.checkOut ? 'conflict' : 'distinct';
  }
  return 'unverified';
}
