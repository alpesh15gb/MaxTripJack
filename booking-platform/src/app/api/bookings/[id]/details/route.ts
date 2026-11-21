import { z } from "zod";
import { checkoutAccess, shoppingResponse } from "@/lib/guest-shopping";
import { claimGuestBookings } from "@/lib/guest-checkout";
import { owned } from "@/lib/supplier-flow";
import { database } from "@/lib/db";
import { unseal } from "@/lib/vault";
import { json, failure } from "@/lib/http";
import {isBookingConfirmed} from "@/lib/booking-status";
import {readStoredHotelProperties} from "@/lib/hotel-content";
import {hotelObject, hotelPropertyDetails, hotelRoomInfo, hotelStringList, hotelText} from "@/lib/hotel-presentation";
import {mergeHotelPropertyDetails} from "@/lib/hotel-property-merge";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    // A guest sees its own booking for the session; a verified account first claims
    // guest bookings made with the same email.
    const access = await checkoutAccess(request), actor = access.actor;
    await claimGuestBookings(actor, access.user);
    const id = z.string().uuid().parse((await context.params).id);
    // Establish ownership before reading payment, traveller or supplier data.
    const order = await owned("orders", id, actor);
    const [payload, payments, refunds] = await Promise.all([
      database().query("SELECT encrypted_payload FROM supplier_booking_payloads WHERE order_id=$1", [id]),
      database().query("SELECT status FROM payments WHERE order_id=$1 AND amount_minor=$2 AND currency=$3 ORDER BY (status='CAPTURED') DESC,created_at DESC LIMIT 1", [id, order.total_minor, order.currency]),
      database().query('SELECT r.id,r.amount_minor::text AS "amountMinor",r.status FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1 ORDER BY r.created_at', [id]),
    ]);
    const source = payload.rows[0] ? unseal(payload.rows[0].encrypted_payload, id) : {};
    const passengers: { name: string; pnrs: string[]; tickets: string[]; roomIndex?: number }[] = [];
    function visit(value: unknown) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const obj = value as Record<string, unknown>;
      if (obj.pnrDetails || obj.ticketNumberDetails) {
        const strings = (v: unknown) => v && typeof v === "object" ? Object.values(v).filter((x): x is string => typeof x === "string") : [];
        passengers.push({ name: [obj.fN, obj.lN].filter(x => typeof x === "string").join(" "), pnrs: strings(obj.pnrDetails), tickets: strings(obj.ticketNumberDetails) });
      }
      Object.values(obj).forEach(visit);
    }
    visit(source);
    // Hotel guests do not have airline PNR/ticket fields. Project only their
    // names and saved room assignment, after the same order ownership check.
    if (order.product === "HOTEL" && passengers.length === 0) {
      // Guest enrichment is optional for legacy records; it must not hide the
      // authoritative payment/booking state if an old payload cannot be opened.
      const saved = (() => { try { return order.guests_encrypted ? unseal(order.guests_encrypted, id) : null; } catch { return null; } })();
      const roomCount = Array.isArray(order.itinerary_summary?.rooms) ? order.itinerary_summary.rooms.length : 0;
      for (const guest of Array.isArray(saved?.travellers) ? saved.travellers : []) {
        if (!guest || typeof guest !== "object" || Array.isArray(guest)) continue;
        const name = [guest.fN, guest.lN].filter((part): part is string => typeof part === "string").map(part => part.trim()).filter(Boolean).join(" ");
        passengers.push({ name, pnrs: [], tickets: [], ...(Number.isInteger(guest.roomIndex) && guest.roomIndex >= 0 && guest.roomIndex < roomCount ? { roomIndex: guest.roomIndex } : {}) });
      }
    }
    const service = order.service_kind ? (await database().query("SELECT service_payload FROM supplier_quotes WHERE id=$1", [order.quote_id])).rows[0]?.service_payload : null;
    let stay;
    if (order.product === 'HOTEL' && isBookingConfirmed(order.product, order.status)) {
      // The confirmed record remains available when optional quote or catalogue metadata is missing.
      const quote = (await database().query("SELECT review->'option' AS option, selection->>'hid' AS hid FROM supplier_quotes WHERE id=$1", [order.quote_id]).catch(() => ({rows: []}))).rows[0];
      const option = hotelObject(quote?.option);
      const recordProperty = hotelPropertyDetails(source.itemInfos?.HOTEL?.hInfo);
      const cached = quote?.hid ? await readStoredHotelProperties([quote.hid]).then(properties => properties[quote.hid]).catch(() => undefined) : undefined;
      stay = {
        property: mergeHotelPropertyDetails(recordProperty, cached),
        rooms: hotelRoomInfo(option.roomInfo).map(room => room.name),
        meal: hotelText(option.mealBasis)?.replaceAll('_', ' '),
        inclusions: hotelStringList(option.inclusions),
        bookingNotes: hotelText(option.bookingNotes, 1000),
      };
    }
    return shoppingResponse(json({
      id, reference: order.reference, product: order.product, status: order.status,
      currency: order.currency, totalMinor: String(order.total_minor),
      createdAt: order.created_at, itinerary: order.itinerary_summary ?? {},
      paymentStatus: payments.rows[0]?.status ?? null, refunds: refunds.rows,
      supplierBookingId: service?.oldBookingId ?? order.supplier_booking_id,
      serviceKind: order.service_kind,
      extras: service?.summary ?? (order.itinerary_summary?.checkoutExtras ?? []).map((extra: { travellerIndex: number; segment: string; kind: string; label: string }) => {
        const guest = unseal(order.guests_encrypted, id).travellers[extra.travellerIndex];
        return { ...extra, passenger: guest ? guest.fN + " " + guest.lN : "Traveller " + (extra.travellerIndex + 1) };
      }),
      passengers, hotelName: source.itemInfos?.HOTEL?.hInfo?.name ?? null, ...(stay && {stay}),
    }), access);
  } catch (error) { return failure(error); }
}
