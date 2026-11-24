import { displayMoney } from "./display-money";
import type {HotelPropertyDetails} from "./hotel-presentation";
export type BookingItinerary = {
  from?: string; to?: string; date?: string; returnDate?: string;
  legs?: { from: string; to: string; date: string }[];
  hotelName?: string; city?: string; checkIn?: string; checkOut?: string;
  adults?: number; children?: number; infants?: number;
  rooms?: { adults: number; children?: number; childAge?: number[] }[];
};

export type BookingStatusDetails = {
  id: string;
  reference: string;
  product: string;
  status: string;
  currency: string;
  totalMinor: string;
  priceLines?: [string, number][];
  paymentStatus: string | null;
  createdAt: string;
  itinerary: BookingItinerary;
  serviceKind?: string | null;
  supplierBookingId?: string | null;
  hotelName?: string | null;
  stay?: {
    property: HotelPropertyDetails;
    rooms: string[];
    meal?: string;
    bookingNotes?: string;
    inclusions: string[];
  };
  passengers: { name: string; pnrs: string[]; tickets: string[]; roomIndex?: number }[];
  refunds: { id: string; amountMinor: string; status: string }[];
};

type StatusInput = Pick<BookingStatusDetails, "product" | "status" | "paymentStatus" | "totalMinor" | "serviceKind"> & Partial<Pick<BookingStatusDetails, "passengers">>;
type StatusView = {
  title: string;
  description: string;
  tone: "confirmed" | "pending" | "attention" | "neutral";
  confirmed: boolean;
  documentReady: boolean;
  paymentReceived: boolean;
  paymentRequired: boolean;
  supplierStarted: boolean;
  poll: boolean;
};

export function isBookingConfirmed(product: string, status: string, serviceKind?: string | null): boolean {
  if (product === "HOTEL") return status === "CONFIRMED";
  return product === "FLIGHT" && (status === "TICKETED" || serviceKind === "ANCILLARY" && status === "CONFIRMED");
}

export function supplierTicketReferences(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return [...new Set(Object.values(value).flatMap(part => {
    if (typeof part !== "string") return [];
    const reference = part.trim();
    return reference && !/^(?:N\/?A|NONE|NULL|PENDING|NOT ISSUED|-+)$/i.test(reference) ? [reference] : [];
  }))];
}

/** Only persisted provider/supplier states establish success, never a return URL. */
export function bookingStatusView(booking: StatusInput): StatusView {
  const paymentReceived = booking.paymentStatus === "CAPTURED";
  const paymentRequired = booking.totalMinor !== "0";
  const confirmed = isBookingConfirmed(booking.product, booking.status, booking.serviceKind);
  const awaitingTicket = confirmed && booking.product === "FLIGHT" && booking.serviceKind !== "ANCILLARY"
    && (!booking.passengers?.length || booking.passengers.some(passenger => !supplierTicketReferences(passenger.tickets).length));
  const documentReady = confirmed && !awaitingTicket;
  const supplierStarted = confirmed || ["BOOKING_PENDING", "CONFIRMED"].includes(booking.status);
  const base = { confirmed, documentReady, paymentReceived, paymentRequired, supplierStarted };
  if (awaitingTicket) return { ...base, title: "Your flight booking is confirmed.", description: "The airline booking is confirmed. A ticket number hasn’t been supplied yet. Keep your booking reference and check for updates before travelling.", tone: "pending", poll: false };
  if (confirmed) return { ...base, title: booking.serviceKind === "ANCILLARY" ? "Your flight extras are confirmed." : booking.serviceKind === "REISSUE" ? "Your replacement flight is ticketed." : booking.product === "HOTEL" ? "Your stay is confirmed." : "Your flight is ticketed.", description: "The supplier has confirmed this booking. Use the confirmation document for your travel details.", tone: "confirmed", poll: false };
  if (booking.status === "CANCELLED") return { ...base, title: "Your booking is cancelled.", description: "The supplier has confirmed cancellation. Any refund is tracked separately below.", tone: "neutral", poll: false };
  if (booking.status === "CLOSED") return { ...base, title: "This booking is closed.", description: "Check your booking records or contact support for details. Closure does not establish a refund.", tone: "neutral", poll: false };
  if (booking.status === "BOOKING_FAILED") return { ...base, title: "Your booking could not be confirmed.", description: "We could not complete your booking. Check the payment and refund updates below, or contact support before making another payment.", tone: "attention", poll: true };
  if (booking.status === "MANUAL_REVIEW") return { ...base, title: "We need to check your booking.", description: "Your trip is not confirmed yet. Our team needs to verify the outcome. Keep this reference and do not pay again while it is being checked.", tone: "attention", poll: true };
  if (["PAID", "BOOKING_PENDING", "CONFIRMED"].includes(booking.status)) return { ...base, title: booking.status === "CONFIRMED" && booking.product === "FLIGHT" ? "We’re waiting for your ticket." : "We’re confirming your booking.", description: paymentReceived ? "Payment received. Your trip is not confirmed yet; we’re waiting for the supplier. You can safely leave this page and return through My trips." : "Your supplier confirmation is still in progress. Check the separate payment update below. You can return to this page through My trips.", tone: "pending", poll: true };
  if (booking.status === "PAYMENT_PENDING") return { ...base, title: paymentReceived ? "We’re checking your booking." : booking.paymentStatus === "FAILED" ? "Your payment needs a status check." : "We’re checking your payment.", description: paymentReceived ? "Payment is recorded as received, but the booking is still being checked. Do not pay again." : "Your trip is not confirmed. An interrupted or unsuccessful payment needs a status check before another attempt. Do not pay again while this is being checked.", tone: "pending", poll: true };
  if (["DRAFT", "QUOTED"].includes(booking.status)) return { ...base, title: "Your trip is not booked yet.", description: "This record has not reached supplier confirmation. Contact support if you have already attempted payment.", tone: "neutral", poll: false };
  return { ...base, title: "Your booking status needs checking.", description: "We cannot establish the outcome from this update. Contact support with your reference and do not pay again while it is being checked.", tone: "attention", poll: true };
}

export function bookingStatusTitle(booking: Pick<BookingStatusDetails, "product" | "itinerary" | "hotelName" | "serviceKind">) {
  if (booking.serviceKind === "ANCILLARY") return "Flight extras";
  if (booking.product === "HOTEL") return booking.hotelName || booking.itinerary.hotelName || (booking.itinerary.city ? `Your stay in ${booking.itinerary.city}` : "Your hotel stay");
  const legs = booking.itinerary.legs;
  if (legs?.length) return `${legs[0].from} → ${legs[legs.length - 1].to}`;
  return booking.itinerary.from && booking.itinerary.to ? `${booking.itinerary.from} → ${booking.itinerary.to}` : "Your flight booking";
}

export function bookingStatusDate(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date) : "Date unavailable";
}

export function bookingStatusMoney(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) return "Amount unavailable";
  if (currency === "INR") return displayMoney(amount);
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount / 100); }
  catch { return "Amount unavailable"; }
}
