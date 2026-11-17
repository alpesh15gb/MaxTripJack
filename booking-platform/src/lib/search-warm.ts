import 'server-only';
import {randomUUID} from 'node:crypto';
import {flightSearch,hotelSearch,type Search} from './providers/contracts';
import {tripjack,paths} from './providers/tripjack';
import {cachedFlightSearch,flightSearchCacheTtl} from './flight-search-cache';
import {requestLimit} from './request-limit';
import {searchWarmCache,type WarmScope} from './search-warm-cache';
import {validateSearchCriteria} from './search-validation';

export async function warmSupplierSearch(criteria:Search,scope:WarmScope,intent:string){
 if(process.env.SEARCH_PREWARM_ENABLED==='false')return 'skipped';
 if(criteria.product==='FLIGHT'&&flightSearchCacheTtl()===0)return 'skipped';
 validateSearchCriteria(criteria);
 return searchWarmCache.warm(intent,criteria,scope,async()=>{
  // These are separate from normal search limits. Reserving cache capacity before
  // awaiting limits also caps concurrent speculative DB/provider work.
  await requestLimit('search-warm:global','search-warm',12);
  await requestLimit(`search-warm:peer:${scope.peer}`,'search-warm',6);
  await requestLimit(scope.sessionFingerprint?`search-warm:session:${scope.sessionFingerprint}`:scope.actor?.userId??`search-warm:anonymous:${scope.peer}`,'search-warm',3);
  const correlationId=randomUUID();
  const payload=criteria.product==='FLIGHT'?flightSearch(criteria):hotelSearch(criteria,correlationId);
  const load=()=>tripjack(criteria.product,paths[criteria.product].search,payload);
  let freshUntil:number|undefined;
  const data=criteria.product==='FLIGHT'?await cachedFlightSearch(payload,load,undefined,undefined,(_status,until)=>{freshUntil=until;}):await load();
  return {data,correlationId,...(freshUntil!==undefined?{freshUntil}:{})};
 });
}
