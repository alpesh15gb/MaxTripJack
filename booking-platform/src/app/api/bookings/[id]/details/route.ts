import { z } from "zod";
import { checkoutAccess, shoppingResponse } from "@/lib/guest-shopping";
import { claimGuestBookings } from "@/lib/guest-checkout";
import { owned } from "@/lib/supplier-flow";
import { database } from "@/lib/db";
import { unseal } from "@/lib/vault";
import { json, failure } from "@/lib/http";

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
    const passengers: { name: string; pnrs: string[]; tickets: string[] }[] = [];
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
    const service = order.service_kind ? (await database().query("SELECT service_payload FROM supplier_quotes WHERE id=$1", [order.quote_id])).rows[0]?.service_payload : null;
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
      passengers, hotelName: source.itemInfos?.HOTEL?.hInfo?.name ?? null,
    }), access);
  } catch (error) { return failure(error); }
}
