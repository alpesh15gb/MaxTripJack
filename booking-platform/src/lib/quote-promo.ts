import 'server-only';
import type { PoolClient } from 'pg';
import { promoDiscount } from './promo-calculation';
import { HttpError } from '@/lib/http';
export class PromoReviewRequired extends HttpError {constructor(message:string){super(409,message);}}
export async function validateQuotePromo(tx:PoolClient,quote:Record<string,unknown>){
 if(!quote.promo_code_id)return null;
 const result=await tx.query('SELECT * FROM promo_codes WHERE id=$1 FOR SHARE',[quote.promo_code_id]);const rule=result.rows[0];
 if(!rule)throw new PromoReviewRequired('Promo code is unavailable. Remove it or apply another code before paying.');
 let discount:number;
 try{discount=promoDiscount(rule,String(quote.product),Number(quote.undiscounted_minor),Number(quote.supplier_minor));}
 catch(e){throw new PromoReviewRequired(e instanceof Error?e.message:'Promo code is unavailable.');}
 if(discount!==Number(quote.discount_minor)||Number(quote.total_minor)!==Number(quote.undiscounted_minor)-discount)throw new PromoReviewRequired('Promo terms changed. Apply the code again and review the new total.');
 return {code:rule.code,discountMinor:discount,originalTotalMinor:Number(quote.undiscounted_minor)};
}
