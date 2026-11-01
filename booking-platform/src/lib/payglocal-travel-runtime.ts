import "server-only";
import { buildPayGlocalTravelData } from "./providers/payglocal-travel";
import { searchSchema, type Guests } from "./providers/contracts";
import { hotelContentForSearch } from "./hotel-content";
import { hotelListingId } from "./hotel-listing-id";
import { HttpError } from "./http";

type Quote = { product: "FLIGHT" | "HOTEL"; review: unknown; selection: { hid?: string }; service_kind?: string | null };
type Search = { criteria: unknown; results: { hotels?: unknown[] } };
/** Called only for an owned quote/search, before reserving a new payment. */
export async function payGlocalTravelForQuote(quote: Quote, search: Search, guests: Guests, reservedAt: Date) {
  const criteria = searchSchema.parse(search.criteria);
  if (criteria.product !== quote.product || quote.service_kind) throw new HttpError(503, "Payment mapping for this travel service requires confirmation. No payment was initiated.");
  let hotel;
  if (criteria.product === "HOTEL") {
    const hid = quote.selection.hid;
    if (!hid || !criteria.hotelIds.includes(hid)) throw new HttpError(409, "Hotel is not part of the selected quote.");
    const raw = (search.results.hotels ?? []).find(h => hotelListingId(h) === hid);
    const property = (await hotelContentForSearch([hid], criteria.hotelIds))[hid];
    const name = raw && typeof raw === "object" && "name" in raw ? raw.name : null;
    if (typeof name !== "string" || !property?.city || !property.countryCode || !property.propertyType) throw new HttpError(503, "Hotel payment details could not be verified. No payment was initiated.");
    hotel = { name, city: property.city, countryCode: property.countryCode, propertyType: property.propertyType, starRating: property.starRating };
  }
  return buildPayGlocalTravelData({ criteria, review: quote.review, travellers: guests.travellers, reservedAt, hotel });
}
