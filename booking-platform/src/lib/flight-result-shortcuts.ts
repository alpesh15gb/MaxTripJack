import { flightStops, journeyMinutes, type Flight, type FlightFare } from './booking-presentation';
import { comparableFareEstimate } from './fare-display';

export type FlightShortcut = { priceMinor: number | null; durationMinutes: number | null };
type FlightShortcuts = { lowest: FlightShortcut | null; nonstop: FlightShortcut | null; fastest: FlightShortcut | null };

export function flightResultShortcuts(
  flights: readonly Flight[],
  group: string | undefined,
  isCompatible: (fare: FlightFare) => boolean = () => true,
): FlightShortcuts {
  const shortcuts: FlightShortcuts = { lowest: null, nonstop: null, fastest: null };
  if (!group || group === 'COMBO') return shortcuts;

  for (const flight of flights) {
    if (!flight.sI.length) continue;
    const fares = flight.totalPriceList.filter(isCompatible);
    if (!fares.length) continue;
    const durationMinutes = journeyMinutes(flight, group);
    let priceMinor: number | null = null;
    for (const fare of fares) {
      const estimate = comparableFareEstimate(fare, 'INR');
      if (estimate !== null && (priceMinor === null || estimate < priceMinor)) priceMinor = estimate;
    }

    const option = { priceMinor, durationMinutes };
    if (priceMinor !== null) {
      if (priceMinor < (shortcuts.lowest?.priceMinor ?? Infinity)) shortcuts.lowest = option;
      if (flightStops(flight, group) === 0 && priceMinor < (shortcuts.nonstop?.priceMinor ?? Infinity)) shortcuts.nonstop = option;
    }
    if (durationMinutes !== null && durationMinutes < (shortcuts.fastest?.durationMinutes ?? Infinity)) shortcuts.fastest = option;
  }
  return shortcuts;
}
