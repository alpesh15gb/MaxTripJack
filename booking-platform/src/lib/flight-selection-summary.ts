import type { Flight, FlightFare } from './booking-presentation';
import { comparableFareEstimate } from './fare-display';

export type FlightSelectionGroup = { group: string; flight?: Flight; fare?: FlightFare & { currency?: string } };
/** Search estimates only: no pricing, provider calls, or mutation. Missing
 * currency uses the existing public INR search contract; explicit other/unknown
 * currency fails closed. A COMBO fare already covers the complete itinerary. */
export function selectedJourneyEstimate(groups: readonly FlightSelectionGroup[]): number | null {
  if (!groups.length || (groups.some(item => item.group === 'COMBO') && groups.length !== 1)) return null;
  const groupIds = new Set<string>(), fareIds = new Set<string>();
  let total = 0;
  for (const { group, flight, fare } of groups) {
    if (!group || groupIds.has(group) || !flight?.sI.length || !fare?.id || fareIds.has(fare.id)) return null;
    if (!flight.totalPriceList.some(option => option.id === fare.id)) return null;
    const price = comparableFareEstimate(fare, 'INR');
    if (price === null || !Number.isSafeInteger(total + price)) return null;
    groupIds.add(group); fareIds.add(fare.id); total += price;
  }
  return total;
}

