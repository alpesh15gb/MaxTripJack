import { journeyMinutes, type Flight, type FlightFare } from './booking-presentation';
import { comparableFareEstimate } from './fare-display';
import { travelTimeLabel } from './travel-date';

export const flightSortChoices = [
  ['price', 'Cheapest'], ['duration', 'Shortest'], ['departure', 'Earliest departure'], ['arrival', 'Earliest arrival'],
] as const;
export type FlightSort = typeof flightSortChoices[number][0];
export type FlightShortcut = { priceMinor: number | null; durationMinutes: number | null; departureLabel: string | null };
type FlightShortcuts = { lowest: FlightShortcut | null; fastest: FlightShortcut | null; earliest: FlightShortcut | null };

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
  const shortcuts: FlightShortcuts = { lowest: null, fastest: null, earliest: null };
  if (!group) return shortcuts;
  let earliestDeparture: string | null = null;

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
    if (priceMinor !== null) {
      if (priceMinor < (shortcuts.lowest?.priceMinor ?? Infinity)) shortcuts.lowest = option;
    }
    if (durationMinutes !== null && durationMinutes < (shortcuts.fastest?.durationMinutes ?? Infinity)) shortcuts.fastest = option;
    if (departure && (!earliestDeparture || departure < earliestDeparture)) {
      earliestDeparture = departure;
      shortcuts.earliest = option;
    }
  }
  return shortcuts;
}
