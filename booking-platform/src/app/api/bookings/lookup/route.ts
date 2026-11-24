import {z} from 'zod';
import {customerEmail} from '@/lib/customer-identity';
import {database} from '@/lib/db';
import {claimGuestBookings,isGuestActor} from '@/lib/guest-checkout';
import {checkoutAccess,shoppingResponse} from '@/lib/guest-shopping';
import {body, failure, HttpError, json, sameOrigin} from '@/lib/http';
import {requestLimit} from '@/lib/request-limit';
import {supplierConfirmation} from '@/lib/supplier-confirmation';
import {unseal} from '@/lib/vault';

const lookupInput = z.union([
  z.object({pnr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/)}).strict(),
  z.object({reference: z.string().trim().toUpperCase().regex(/^MT-[0-9A-F]{8}$/)}).strict(),
]);

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const access = await checkoutAccess(request);
    const {actor,user} = access;
    if (!isGuestActor(actor) && (!user?.emailVerified || !customerEmail(user))) throw new HttpError(403, 'Verify the email address on your booking first.');
    await requestLimit(actor.userId, 'booking-pnr-lookup', 12);
    const input = await body(request, lookupInput);
    await claimGuestBookings(actor, user);
    const reply = (value: unknown) => shoppingResponse(json(value),access);
    if ('reference' in input) {
      const {rows} = await database().query(`
        SELECT id, reference FROM orders
        WHERE user_id=$1 AND company_id IS NOT DISTINCT FROM $2::uuid AND reference=$3
        LIMIT 1`, [actor.userId,actor.companyId,input.reference]);
      return reply({matches:rows,incomplete:false});
    }

    // Decrypt only the orders owned by this verified account or guest browser.
    const matches: {id: string; reference: string}[] = [];
    let cursor: string | null = null;
    let unreadable = false;
    for (let batch = 0; batch < 10; batch++) {
      const {rows}: {rows: {id: string; reference: string; encrypted_payload: string}[]} = await database().query(`
        SELECT o.id, o.reference, p.encrypted_payload
        FROM orders o JOIN supplier_booking_payloads p ON p.order_id=o.id
        WHERE o.product='FLIGHT' AND o.user_id=$1 AND o.company_id IS NOT DISTINCT FROM $2::uuid
          AND ($3::uuid IS NULL OR o.id > $3) AND o.service_kind IS DISTINCT FROM 'ANCILLARY'
        ORDER BY o.id LIMIT 100`, [actor.userId, actor.companyId, cursor]);
      for (const row of rows) {
        try {
          const {pnrs} = supplierConfirmation(unseal(row.encrypted_payload, row.id));
          if (pnrs.some(value => value.trim().toUpperCase() === input.pnr)) matches.push({id: row.id, reference: row.reference});
        } catch {
          unreadable = true;
        }
      }
      if (matches.length >= 10 || rows.length < 100) return reply({matches: matches.slice(0, 10), incomplete: unreadable || matches.length >= 10});
      cursor = rows.at(-1)!.id;
    }
    return reply({matches, incomplete: true});
  } catch (error) { return failure(error); }
}
