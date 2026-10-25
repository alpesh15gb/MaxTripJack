import 'server-only';
import { owned, assertFresh, pricingRule, type Actor } from './supplier-flow';
import { requestLimit } from './request-limit';
import { HttpError } from './http';
import { searchSchema } from './providers/contracts';
import { bookingSearchPrefill } from './booking-search-state';
import { customerHotelResults } from './customer-pricing';
import { hotelContentForSearch } from './hotel-content';

/** Recover an owned browsing session, never create a search or reserve inventory.
 * The response is a fresh customer projection of the saved search, not raw provider
 * data. Cached listing prices remain estimates; room selection still uses detail
 * and review to obtain current availability, pricing and supplier conditions. */
export async function customerHotelSearchSnapshot(searchId: string, actor: Actor) {
  await requestLimit(actor.userId, 'hotel-search-snapshot', 30);
  const search = await owned('supplier_searches', searchId, actor);
  const expiry = new Date(search.expires_at).getTime();
  if (!Number.isFinite(expiry)) throw new HttpError(409, 'This search is no longer available. Search again to continue.');
  assertFresh(search.expires_at);
  if (search.product !== 'HOTEL' || search.service_kind) throw new HttpError(400, 'A hotel search is required.');
  const parsed = searchSchema.safeParse(search.criteria);
  if (!parsed.success || parsed.data.product !== 'HOTEL') throw new HttpError(409, 'This search is no longer available. Search again to continue.');
  const input = parsed.data;
  const rooms = input.rooms ?? [{adults: input.adults, children: input.childrenAges.length, childAge: input.childrenAges}];
  const criteria = bookingSearchPrefill({
    product: 'HOTEL', hotelIds: input.hotelIds.join(','), date: input.checkIn,
    end: input.checkOut, adults: String(rooms[0].adults),
    rooms: JSON.stringify(rooms.map(({adults, childAge}) => ({adults, childAge}))),
    nationality: input.nationality,
  });
  if (criteria.searchInvalid) throw new HttpError(409, 'This search is no longer available. Search again to continue.');
  const rule = await pricingRule('HOTEL', actor);
  const hotels = customerHotelResults(search.results, rule).hotels.filter(hotel => input.hotelIds.includes(hotel.tjHotelId));
  const ids = hotels.map(hotel => hotel.tjHotelId);
  const properties = hotelContentForSearch.peek(ids, input.hotelIds);
  const statuses = hotelContentForSearch.statuses(ids, input.hotelIds);
  return {
    searchId, expiresAt: new Date(expiry).toISOString(), criteria,
    propertyContentPending: Object.values(statuses).includes('pending'),
    propertyContentUnavailable: Object.values(statuses).includes('unavailable'),
    results: {hotels: hotels.map(hotel => ({...hotel, propertyContentStatus: statuses[hotel.tjHotelId], property: properties[hotel.tjHotelId] ?? hotel.property}))},
  };
}
