import { z } from "zod";
import airports from "@/data/airports.json";
import { HttpError } from "../http";
import { airportInstant } from "../airport-instant";
import { day, type Guests, type Search } from "./contracts";

const text = z.string().trim().min(1).max(200).refine(s => !/[\u0000-\u001f\u007f]/.test(s));
const country = z.string().regex(/^[A-Z]{2}$/);
const instant = z.string().datetime();
const compactDate = z.string().regex(/^\d{8}$/).refine(v => day.safeParse(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6)}`).success);
const legSchema = z.object({ routeId: z.string().regex(/^[1-9]\d?$/), legId: z.string().regex(/^[1-9]\d?$/), flightNumber: text, departureAirportCode: z.string().regex(/^[A-Z]{3}$/), departureCity: text, departureCountry: country, departureDate: instant, arrivalAirportCode: z.string().regex(/^[A-Z]{3}$/), arrivalCity: text, arrivalCountry: country, arrivalDate: instant, carrierCode: z.string().regex(/^[A-Z0-9]{2,3}$/), airlineServiceClass: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]) }).strict();
export const payGlocalTravelSchema = z.discriminatedUnion("product", [
  z.object({ product: z.literal("FLIGHT"), riskData: z.object({ flightData: z.array(z.object({ journeyType: z.enum(["ONEWAY", "RETURN"]), reservationDate: compactDate, legData: z.array(legSchema).min(1).max(36), passengerData: z.array(z.object({ firstName: text, lastName: text }).strict()).min(1).max(18) }).strict()).length(1) }).strict() }).strict(),
  z.object({ product: z.literal("HOTEL"), riskData: z.object({ lodgingData: z.array(z.object({ checkInDate: compactDate, checkOutDate: compactDate, city: text, country, lodgingType: text, lodgingName: text, rating: z.string().regex(/^[1-5]$/).optional() }).strict()).length(1) }).strict() }).strict(),
]);
export type PayGlocalTravelData = z.infer<typeof payGlocalTravelSchema>;
type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const airportIndex = new Map(airports.map(a => [a.code, a]));
const unavailable = () => new HttpError(503, "Travel payment details could not be verified. No payment was initiated.");
export type PayGlocalTravelSource = {
  criteria: Search; review: unknown; travellers: Pick<Guests["travellers"][number], "fN" | "lN">[];
  reservedAt: Date;
  hotel?: { name: string; city: string; countryCode: string; propertyType: string; starRating?: number };
};

/** Unsigned preparation from owned, server-stored quote/guest data only.
 * No fake ticket numbers or invented supplier-to-gateway cancellation codes.
 * Merchant confirmation of those omissions is enforced by the checkout gate. */
export function buildPayGlocalTravelData(source: PayGlocalTravelSource): PayGlocalTravelData {
  const criteria = source.criteria;
  if (criteria.product === "HOTEL") {
    if (!source.hotel || !day.safeParse(criteria.checkIn).success || !day.safeParse(criteria.checkOut).success || criteria.checkOut <= criteria.checkIn) throw unavailable();
    const h = source.hotel;
    return payGlocalTravelSchema.parse({ product: "HOTEL", riskData: { lodgingData: [{ checkInDate: criteria.checkIn.replaceAll("-", ""), checkOutDate: criteria.checkOut.replaceAll("-", ""), city: h.city, country: h.countryCode, lodgingType: h.propertyType, lodgingName: h.name, ...(h.starRating ? { rating: String(h.starRating) } : {}) }] } });
  }
  // No published multi-city journey enum/representation is assumed.
  if (criteria.legs) throw new HttpError(503, "Multi-city payment mapping requires PayGlocal confirmation. No payment was initiated.");
  if (!Number.isFinite(source.reservedAt.getTime()) || !source.travellers.length || source.travellers.length !== criteria.adults + criteria.children + criteria.infants) throw unavailable();
  const routes = [{ from: criteria.from, to: criteria.to, date: criteria.date }, ...(criteria.returnDate ? [{ from: criteria.to, to: criteria.from, date: criteria.returnDate }] : [])];
  const trips = obj(source.review).tripInfos;
  if (!Array.isArray(trips) || !trips.length || trips.length > 12) throw unavailable();
  const segments = trips.flatMap(raw => {
    const trip = obj(raw), fares = Array.isArray(trip.totalPriceList) ? trip.totalPriceList : [];
    if (!Array.isArray(trip.sI) || !trip.sI.length) throw unavailable();
    const cabin = obj(obj(obj(fares[0]).fD).ADULT).cc;
    return trip.sI.map(segment => ({ segment: obj(segment), cabin }));
  });
  if (segments.length > 36) throw unavailable();
  let routeIndex = 0, connection = routes[0].from, routeLeg = 0, previousArrival = -Infinity;
  const legData = segments.map(({ segment: s, cabin }) => {
    const route = routes[routeIndex];
    const departure = airportIndex.get(String(obj(s.da).code)), arrival = airportIndex.get(String(obj(s.aa).code));
    if (!route || !departure || !arrival || departure.code !== connection || departure.code === arrival.code) throw unavailable();
    if (routeLeg === 0 && (departure.code !== route.from || String(s.dt).slice(0, 10) !== route.date)) throw unavailable();
    const dt = airportInstant(s.dt, departure.code, departure.country), at = airportInstant(s.at, arrival.code, arrival.country);
    if (!dt || !at || Date.parse(at) <= Date.parse(dt) || Date.parse(dt) < previousArrival) throw unavailable();
    previousArrival = Date.parse(at); routeLeg++;
    const fd = obj(s.fD), airline = obj(fd.aI);
    const leg = { routeId: String(routeIndex + 1), legId: String(routeLeg), flightNumber: fd.fN, departureAirportCode: departure.code, departureCity: departure.city, departureCountry: departure.country, departureDate: dt, arrivalAirportCode: arrival.code, arrivalCity: arrival.city, arrivalCountry: arrival.country, arrivalDate: at, carrierCode: airline.code, airlineServiceClass: cabin };
    connection = arrival.code;
    if (connection === route.to) { routeIndex++; routeLeg = 0; connection = routes[routeIndex]?.from ?? connection; }
    return leg;
  });
  if (routeIndex !== routes.length || routeLeg !== 0) throw unavailable();
  return payGlocalTravelSchema.parse({ product: "FLIGHT", riskData: { flightData: [{ journeyType: criteria.returnDate ? "RETURN" : "ONEWAY", reservationDate: source.reservedAt.toISOString().slice(0, 10).replaceAll("-", ""), legData, passengerData: source.travellers.map(t => ({ firstName: t.fN, lastName: t.lN })) }] } });
}
