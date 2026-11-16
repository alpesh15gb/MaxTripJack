import { z } from 'zod';
import { principal } from '@/lib/access';
import { transaction } from '@/lib/db';
import { body, failure, HttpError, json, sameOrigin } from '@/lib/http';
import { assertFresh } from '@/lib/supplier-flow';
import { promoDiscount } from '@/lib/promo-calculation';
import { requestLimit } from '@/lib/request-limit';
export async function POST(request:Request){try{
 sameOrigin(request);const actor=await principal(request);
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
 });return json(result);
}catch(e){return failure(e);}}
