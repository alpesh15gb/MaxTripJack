import { z } from 'zod';
import { checkoutAccess, shoppingResponse } from '@/lib/guest-shopping';
import { database, transaction } from '@/lib/db';
import { body, failure, HttpError, json, sameOrigin } from '@/lib/http';
import { assertFresh } from '@/lib/supplier-flow';
import { promoDiscount } from '@/lib/promo-calculation';
import { requestLimit } from '@/lib/request-limit';
import { checkoutPromoOffers, type DiscoverablePromoRule } from '@/lib/promo-offers';

export async function GET(request: Request) {
 try {
  const access = await checkoutAccess(request), actor = access.actor;
  const quoteId = z.string().uuid().parse(new URL(request.url).searchParams.get('quoteId'));
  await requestLimit(actor.userId, 'promo-offers', 20);
  const db = database();
  const {rows: [quote]} = await db.query(`
   SELECT q.product, q.expires_at, q.service_kind, q.total_minor, q.undiscounted_minor, q.supplier_minor,
    EXISTS(SELECT 1 FROM orders WHERE quote_id=q.id) AS payment_started
   FROM supplier_quotes q WHERE q.id=$1 AND q.user_id=$2 AND q.company_id IS NOT DISTINCT FROM $3::uuid
  `, [quoteId, actor.userId, actor.companyId]);
  if (!quote) throw new HttpError(404, 'Quote not found.');
  assertFresh(quote.expires_at);
  if (quote.payment_started) throw new HttpError(409, 'Payment has already started.');
  if (quote.service_kind || !['FLIGHT', 'HOTEL'].includes(quote.product)) return json({offers: []});
  const original = Number(quote.undiscounted_minor ?? quote.total_minor);
  const result = await db.query<DiscoverablePromoRule>(`
   SELECT code, discoverable, product, active, expires_at, discount_minor, discount_basis_points, minimum_minor, maximum_discount_minor
   FROM promo_codes WHERE discoverable=true AND active=true AND expires_at>now()
    AND (product='ALL' OR product=$1) AND minimum_minor<=$2
  `, [quote.product, original]);
  return shoppingResponse(json({offers: checkoutPromoOffers(result.rows, quote.product, original, Number(quote.supplier_minor))}), access);
 } catch (error) { return failure(error); }
}

export async function POST(request:Request){try{
 sameOrigin(request);const access=await checkoutAccess(request),actor=access.actor;
 await requestLimit(actor.userId,'promo-apply',20);
 const input=await body(request,z.object({quoteId:z.string().uuid(),code:z.string().trim().max(32)}).strict());
 const result=await transaction(async tx=>{
  const found=await tx.query('SELECT * FROM supplier_quotes WHERE id=$1 AND user_id=$2 AND company_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE',[input.quoteId,actor.userId,actor.companyId]);const quote=found.rows[0];
  if(!quote)throw new HttpError(404,'Quote not found.');assertFresh(quote.expires_at);
  if(quote.service_kind)throw new HttpError(400,'Promo codes apply to new flight and hotel bookings only.');
  const order=await tx.query('SELECT id FROM orders WHERE quote_id=$1',[quote.id]);if(order.rowCount)throw new HttpError(409,'Payment has already started. The promo code cannot be changed.');
  const original=Number(quote.undiscounted_minor??quote.total_minor);let discount=0,promo=null;
  if(input.code){const foundPromo=await tx.query('SELECT * FROM promo_codes WHERE code=$1 FOR SHARE',[input.code.toUpperCase()]);promo=foundPromo.rows[0];if(!promo)throw new HttpError(400,'Promo code not found.');
   try{discount=promoDiscount(promo,quote.product,original,Number(quote.supplier_minor));}catch(e){throw new HttpError(400,e instanceof Error?e.message:'Promo code is unavailable.');}}
  await tx.query('UPDATE supplier_quotes SET promo_code_id=$2,undiscounted_minor=$3,discount_minor=$4,total_minor=$5 WHERE id=$1',[quote.id,promo?.id??null,promo?original:null,discount,original-discount]);
  return {quoteId:quote.id,totalMinor:original-discount,discountMinor:discount,originalTotalMinor:original,code:promo?.code??null};
 });return shoppingResponse(json(result),access);
}catch(e){return failure(e);}}
