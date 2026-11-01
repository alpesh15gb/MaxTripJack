import type { PayGlocalTravelSource } from "../../src/lib/providers/payglocal-travel";
export function flightTravelSource(): PayGlocalTravelSource {
  return { criteria: { product: "FLIGHT", from: "BOM", to: "DEL", date: "2027-01-10", adults: 1, children: 0, infants: 0, cabin: "ECONOMY" }, reservedAt: new Date("2026-11-01T10:00:00Z"), travellers: [{ fN: "Test", lN: "Traveller" }], review: { tripInfos: [{ sI: [{ da: { code: "BOM" }, aa: { code: "DEL" }, dt: "2027-01-10T10:00:00", at: "2027-01-10T12:00:00", fD: { aI: { code: "6E" }, fN: "123" } }], totalPriceList: [{ fD: { ADULT: { cc: "ECONOMY" } } }] }] } };
}
export function hotelTravelSource(): PayGlocalTravelSource {
  return { criteria: { product: "HOTEL", hotelIds: ["123"], checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 2, childrenAges: [], nationality: "106" }, reservedAt: new Date("2026-11-01T10:00:00Z"), travellers: [{ fN: "Test", lN: "Guest" }], review: {}, hotel: { name: "Fixture Hotel", city: "Panaji", countryCode: "IN", propertyType: "Hotel", starRating: 4 } };
}
