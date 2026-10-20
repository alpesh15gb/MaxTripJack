import { z } from "zod";
import { isPublicSeoPath, type PUBLIC_SEO_PAGES } from "./seo-registry";

/** Preparation only: this module does not load tags, persist identifiers or send data. */
export type AnalyticsConsent = "denied" | "granted";
export const DEFAULT_ANALYTICS_CONSENT: AnalyticsConsent = "denied";
export function analyticsConsent(value: unknown): AnalyticsConsent {
  return value === "granted" ? "granted" : DEFAULT_ANALYTICS_CONSENT;
}

type PublicPath = typeof PUBLIC_SEO_PAGES[number]["path"];
const publicPath = z.custom<PublicPath>(value => typeof value === "string" && isPublicSeoPath(value));
const product = z.enum(["FLIGHT", "HOTEL"]);

// Reject unknown fields rather than forwarding accidental PII. Never pass browser
// location, query strings, DOM text, search criteria or provider responses here.
export const clientAnalyticsEventSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("landing_view"), publicPath }).strict(),
  z.object({
    name: z.literal("flight_search_submitted"), product: z.literal("FLIGHT"),
    journeyType: z.enum(["ONE_WAY", "RETURN", "MULTI_CITY"]),
    routeGroup: z.enum(["DOMESTIC", "INTERNATIONAL", "UNKNOWN"]),
  }).strict(),
  z.object({
    name: z.literal("hotel_search_submitted"), product: z.literal("HOTEL"),
    routeGroup: z.enum(["DOMESTIC", "INTERNATIONAL", "UNKNOWN"]),
  }).strict(),
  z.object({ name: z.literal("fare_selected"), product }).strict(),
  z.object({ name: z.literal("checkout_started"), product, currency: z.literal("INR") }).strict(),
]);
export type ClientAnalyticsEvent = z.infer<typeof clientAnalyticsEventSchema>;

/** Returns a safe in-memory event, never emits it. Consent withdrawal takes effect immediately. */
export function prepareClientAnalyticsEvent(input: unknown, consent: unknown = DEFAULT_ANALYTICS_CONSENT): ClientAnalyticsEvent | null {
  if (analyticsConsent(consent) !== "granted") return null;
  const result = clientAnalyticsEventSchema.safeParse(input);
  return result.success ? result.data : null;
}

export const ANALYTICS_FUNNEL = [
  { name: "landing_view", label: "Public landing", authority: "consented_client", conversion: false },
  { name: "flight_search_submitted", alternative: "hotel_search_submitted", label: "Flight or hotel search", authority: "consented_client", conversion: false },
  { name: "fare_selected", label: "Fare selected", authority: "consented_client", conversion: false },
  { name: "checkout_started", label: "Begin checkout", authority: "consented_client", conversion: false },
  { name: "payment_captured", label: "Payment captured", authority: "verified_server", conversion: false },
  { name: "booking_confirmed", label: "Booking confirmed", authority: "booking.confirmed_outbox", conversion: true },
] as const;

const purchaseEvidenceSchema = z.object({
  eventType: z.literal("booking.confirmed"),
  product,
  status: z.enum(["TICKETED", "CONFIRMED"]),
  paymentStatus: z.literal("CAPTURED"),
  bookingTotalMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  capturedAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal("INR"),
  serviceKind: z.null(),
  hasParentOrder: z.literal(false),
  environment: z.literal("production"),
  analyticsConsent: z.literal("granted"),
}).strict();
export type PurchaseRelayEvidence = z.infer<typeof purchaseEvidenceSchema>;

/**
 * Policy check for a FUTURE server relay, not proof of authority or deduplication.
 * Evidence must come from trusted database rows, never browser/request input.
 * A separate durable dispatch ledger and consent linkage are required before use.
 */
export function isPurchaseRelayEligible(input: unknown): boolean {
  const parsed = purchaseEvidenceSchema.safeParse(input);
  if (!parsed.success) return false;
  const evidence = parsed.data;
  return evidence.bookingTotalMinor === evidence.capturedAmountMinor
    && (evidence.product === "FLIGHT" ? evidence.status === "TICKETED" : evidence.status === "CONFIRMED");
}
