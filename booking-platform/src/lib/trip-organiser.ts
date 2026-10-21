export type TripGroup = "UPCOMING" | "PAST" | "CANCELLED" | "OTHER";
type Trip = { status: string; created_at: string; itinerary_summary?: { date?: string; returnDate?: string; legs?: { date: string }[]; checkIn?: string; checkOut?: string } | null };
export const tripGroups: { value: TripGroup; label: string; description: string }[] = [
  { value: "UPCOMING", label: "Upcoming & current", description: "Supplier-confirmed travel, ordered by departure or check-in date." },
  { value: "OTHER", label: "Booking updates & undated trips", description: "Unconfirmed bookings and records without a verified travel date. Check each booking’s status before travelling." },
  { value: "PAST", label: "Past travel", description: "Confirmed journeys whose last travel date has passed. This does not verify that travel was completed." },
  { value: "CANCELLED", label: "Cancelled trips", description: "Supplier-confirmed cancellations. Refund progress is tracked separately." },
];
function day(value?: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const date = value.slice(0, 10);
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
export function tripDates(trip: Trip): { start: string | null; end: string | null } {
  const itinerary = trip.itinerary_summary;
  if (!itinerary) return { start: null, end: null };
  const values = [itinerary.date, itinerary.returnDate, itinerary.checkIn, itinerary.checkOut, ...(itinerary.legs ?? []).map(leg => leg.date)].map(day).filter((value): value is string => !!value).sort();
  return { start: values[0] ?? null, end: values.at(-1) ?? null };
}
export function travelCalendarDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function tripGroup(trip: Trip, today = travelCalendarDay()): TripGroup {
  if (trip.status === "CANCELLED") return "CANCELLED";
  if (!["CONFIRMED", "TICKETED"].includes(trip.status)) return "OTHER";
  const { end } = tripDates(trip);
  return !end ? "OTHER" : end < today ? "PAST" : "UPCOMING";
}
export function sortTrips<T extends Trip>(trips: T[], group: TripGroup): T[] {
  return [...trips].sort((a, b) => {
    const left = tripDates(a), right = tripDates(b);
    const order = group === "UPCOMING" ? (left.start ?? "9999").localeCompare(right.start ?? "9999") : (right.end ?? "").localeCompare(left.end ?? "");
    return order || b.created_at.localeCompare(a.created_at);
  });
}
const refundStages: Record<string, { label: string; description: string }> = {
  REQUESTED: { label: "Refund requested", description: "The request is recorded and awaits review. This is not confirmation that money has been returned." },
  APPROVED: { label: "Refund approved", description: "Approved for processing. The payment provider has not yet confirmed completion." },
  PROCESSING: { label: "Refund processing", description: "Processing or awaiting payment-provider confirmation. Completion is not yet confirmed." },
  COMPLETED: { label: "Refund completed", description: "The payment provider reports this refund as processed. Contact support if you cannot identify it on your payment statement." },
  FAILED: { label: "Refund needs attention", description: "The payment provider reported a failed refund. Contact support with your booking reference for a status check." },
};
export function refundStage(status: string) { return refundStages[status] ?? { label: "Refund status needs checking", description: "A recognisable refund stage is not available. Contact support with your booking reference." }; }
