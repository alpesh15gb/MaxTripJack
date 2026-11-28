// Search snapshots may be reused for longer than an inventory signal.
export const FLIGHT_SEAT_INVENTORY_TTL_MS = 60_000;

export function flightSeatCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function flightSeatInventoryExpiry(fetchedSince: number | undefined, now: number): number | undefined {
  if (fetchedSince === undefined || !Number.isSafeInteger(fetchedSince) || fetchedSince > now) return;
  const expiresAt = fetchedSince + FLIGHT_SEAT_INVENTORY_TTL_MS;
  return now < expiresAt ? expiresAt : undefined;
}
