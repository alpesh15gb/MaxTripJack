import {readSearchWarmScope} from '@/lib/search-warm-identity';
import {body,sameOrigin,json} from '@/lib/http';
import {searchSchema} from '@/lib/providers/contracts';
import {validSearchIntent} from '@/lib/search-warm-cache';
import {warmSupplierSearch} from '@/lib/search-warm';

/** Optional listing preparation only. Never emits an identity cookie, search ID,
 * supplier payload, price, booking, payment or CRM side effect. */
export async function POST(request:Request){
 try{
  sameOrigin(request);const intent=request.headers.get('X-Search-Intent');
  if(!validSearchIntent(intent)||process.env.SEARCH_PREWARM_ENABLED==='false')return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store'}});
  const criteria=await body(request,searchSchema);
  return json({status:await warmSupplierSearch(criteria,readSearchWarmScope(request),intent)});
 }catch{return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store'}});}
}
