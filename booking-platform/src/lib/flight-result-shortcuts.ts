import { journeyMinutes, type Flight, type FlightFare } from './booking-presentation';
import { comparableFareEstimate } from './fare-display';
import { travelTimeLabel } from './travel-date';

export const flightSortChoices = [
  ['best', 'Best'], ['price', 'Cheapest'], ['duration', 'Shortest'], ['departure', 'Earliest departure'], ['arrival', 'Earliest arrival'],
] as const;
export type FlightSort = typeof flightSortChoices[number][0];
export type FlightShortcut = { priceMinor: number | null; durationMinutes: number | null; departureLabel: string | null };
type FlightShortcuts = { best: FlightShortcut | null; lowest: FlightShortcut | null; fastest: FlightShortcut | null; earliest: FlightShortcut | null };

/** "Best" balances price against journey time and stops (lower is better).
 * Price relative to the cheapest, plus 0.6 x duration relative to the fastest,
 * plus a small penalty per stop. Unknown values rank after known ones. */
export function bestFlightScore(priceMinor: number | null, durationMinutes: number | null, stops: number, lowestPrice: number, shortestDuration: number) {
  if (priceMinor === null || !Number.isFinite(lowestPrice) || lowestPrice <= 0) return Number.MAX_SAFE_INTEGER;
  const priceRatio = priceMinor / lowestPrice;
  const durationRatio = durationMinutes !== null && Number.isFinite(shortestDuration) && shortestDuration > 0 ? durationMinutes / shortestDuration : 2;
  return priceRatio + 0.6 * durationRatio + 0.08 * Math.max(0, stops);
}

/** Match the airport-local date and time used by the flight list and its sort. */
export function flightDepartureKey(flight: Flight) {
  const departure = flight.sI[0]?.dt;
  return departure && travelTimeLabel(departure) !== 'Time unavailable' ? departure.slice(0, 16) : null;
}

export function flightArrivalKey(flight: Flight) {
  const arrival = flight.sI.at(-1)?.at;
  return arrival && travelTimeLabel(arrival) !== 'Time unavailable' ? arrival.slice(0, 16) : null;
}

export function flightResultShortcuts(
  flights: readonly Flight[],
  group: string | undefined,
  isCompatible: (fare: FlightFare) => boolean = () => true,
): FlightShortcuts {
  const shortcuts: FlightShortcuts = { best: null, lowest: null, fastest: null, earliest: null };
  if (!group) return shortcuts;
  let earliestDeparture: string | null = null;
  const options: (FlightShortcut & { stops: number })[] = [];

  for (const flight of flights) {
    if (!flight.sI.length) continue;
    const fares = flight.totalPriceList.filter(isCompatible);
    if (!fares.length) continue;
    const durationMinutes = journeyMinutes(flight, group);
    const departure = flightDepartureKey(flight);
    let priceMinor: number | null = null;
    for (const fare of fares) {
      const estimate = comparableFareEstimate(fare, 'INR');
      if (estimate !== null && (priceMinor === null || estimate < priceMinor)) priceMinor = estimate;
    }

    const option = { priceMinor, durationMinutes, departureLabel: departure?.slice(11) ?? null };
    options.push({ ...option, stops: Math.max(0, flight.sI.length - 1) });
    if (priceMinor !== null) {
      if (priceMinor < (shortcuts.lowest?.priceMinor ?? Infinity)) shortcuts.lowest = option;
    }
    if (durationMinutes !== null && durationMinutes < (shortcuts.fastest?.durationMinutes ?? Infinity)) shortcuts.fastest = option;
    if (departure && (!earliestDeparture || departure < earliestDeparture)) {
      earliestDeparture = departure;
      shortcuts.earliest = option;
    }
  }
  const lowestPrice = shortcuts.lowest?.priceMinor ?? Infinity, shortestDuration = shortcuts.fastest?.durationMinutes ?? Infinity;
  let bestScore = Infinity;
  for (const { stops, ...option } of options) {
    const score = bestFlightScore(option.priceMinor, option.durationMinutes, stops, lowestPrice, shortestDuration);
    if (score < bestScore && score < Number.MAX_SAFE_INTEGER) { bestScore = score; shortcuts.best = option; }
  }
  return shortcuts;
}
