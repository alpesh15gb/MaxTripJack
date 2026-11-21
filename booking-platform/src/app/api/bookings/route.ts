import { z } from "zod";
import { principal } from "@/lib/access";
import { claimGuestBookings } from "@/lib/guest-checkout";
import { database } from "@/lib/db";
import { readStoredHotelProperties } from "@/lib/hotel-content";
import { hotelRoomInfo, hotelStringList, hotelText, type HotelPropertyDetails } from "@/lib/hotel-presentation";
import { isBookingConfirmed } from "@/lib/booking-status";
import { json, failure } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const actor = await principal(request);
    await claimGuestBookings(actor, actor.session.user);
    const page=z.coerce.number().int().min(1).max(100000).parse(new URL(request.url).searchParams.get("page")||1);
    const result = await database().query(`
      SELECT o.id, o.reference, o.parent_order_id, o.service_kind, o.product, o.status,
             o.currency, o.total_minor::text, o.itinerary_summary, o.created_at,
             q.selection->>'hid' AS catalogue_hotel_id,
             q.review#>'{option,roomInfo}' AS reviewed_rooms,
             q.review#>>'{option,mealBasis}' AS reviewed_meal,
             q.review#>'{option,inclusions}' AS reviewed_inclusions,
             (SELECT h->>'name'
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.results->'hotels') = 'array'
                     THEN s.results->'hotels' ELSE '[]'::jsonb END) AS h
               WHERE COALESCE(h->>'hotelId', h->>'tjHotelId') = q.selection->>'hid'
                 AND (NOT h ? 'hotelId' OR NOT h ? 'tjHotelId' OR h->>'hotelId' = h->>'tjHotelId')
               LIMIT 1) AS selected_hotel_name,
             COALESCE((
               SELECT json_agg(json_build_object('id', child.id, 'reference', child.reference,
                        'kind', child.service_kind, 'status', child.status))
               FROM orders child WHERE child.parent_order_id = o.id
             ), '[]'::json) AS linked_services,
             COALESCE((
               SELECT json_agg(json_build_object('id', r.id, 'amountMinor', r.amount_minor::text,
                        'status', r.status))
               FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE p.order_id = o.id
             ), '[]'::json) AS refunds
      FROM orders o
      LEFT JOIN supplier_quotes q ON o.product = 'HOTEL' AND q.id = o.quote_id
      LEFT JOIN supplier_searches s ON s.id = q.search_id
      WHERE (o.company_id = $1 AND $1::uuid IS NOT NULL)
         OR (o.company_id IS NULL AND o.user_id = $2 AND $1::uuid IS NULL)
      ORDER BY o.created_at DESC LIMIT 51 OFFSET $3
    `, [actor.companyId, actor.userId, (page-1)*50]);
    const rows = result.rows.slice(0,50);
    const hotelIds = [...new Set(rows.map(row => row.catalogue_hotel_id).filter((id): id is string => typeof id === "string" && /^\d{1,30}$/.test(id)))];
    const properties: Record<string,HotelPropertyDetails> = await readStoredHotelProperties(hotelIds).catch(() => ({}));
    const bookings = rows.map(({catalogue_hotel_id, selected_hotel_name, reviewed_rooms, reviewed_meal, reviewed_inclusions, ...booking}) => {
      if (booking.product !== "HOTEL") return booking;
      const confirmed = isBookingConfirmed(booking.product, booking.status);
      return {
        ...booking,
        hotelPhotos: properties[catalogue_hotel_id]?.photos?.slice(0,1),
        hotelStay: {
          name: hotelText(selected_hotel_name),
          rooms: confirmed ? hotelRoomInfo(reviewed_rooms).map(room => room.name) : [],
          meal: confirmed ? hotelText(reviewed_meal)?.replaceAll('_', ' ') : undefined,
          inclusions: confirmed ? hotelStringList(reviewed_inclusions) : [],
        },
      };
    });
    return json({ bookings,page,hasMore:result.rows.length>50 });
  } catch (e) { return failure(e); }
}
