import {createHash} from 'node:crypto';
import type {Search} from './providers/contracts';
export type WarmActor={userId:string;companyId:string|null};
export type WarmScope={actor:WarmActor|null;peer:string;sessionFingerprint?:string};
export type WarmSupplierResult={data:unknown;correlationId:string;freshUntil?:number};
export type WarmAdoptionStatus='miss'|'hit'|'joined';
const TTL=45_000,MAX_ENTRIES=20,MAX_ACTIVE=4,MAX_BYTES=12*1024*1024,MAX_RESULT_BYTES=4*1024*1024;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
 return JSON.stringify(value);
}
export const validSearchIntent=(value:string|null|undefined):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const actorKey=(actor:WarmActor)=>digest(JSON.stringify([actor.userId,actor.companyId]));
type Entry={criteria:string;scope:WarmScope;started:number;expires:number;pending:boolean;claimed:boolean;bytes:number;work:Promise<WarmSupplierResult|null>};

/** Raw, unpriced supplier listings only. A UUID is a one-use anonymous listing
 * capability, never an account identity or authorization to book. */
export function createSearchWarmCache(now:()=>number=Date.now){
 const entries=new Map<string,Entry>(),consumed=new Map<string,number>(),active=new Set<string>();
 let bytes=0;
 const remove=(key:string,entry:Entry)=>{if(entries.get(key)===entry){entries.delete(key);bytes-=entry.bytes;}};
 const prune=()=>{
  for(const [key,entry]of entries)if(now()>=entry.expires)remove(key,entry);
  for(const [key,until]of consumed)if(until<=now())consumed.delete(key);
 };
 const sameOwner=(owner:WarmScope,consumer:WarmScope)=>owner.sessionFingerprint
  ?owner.sessionFingerprint===consumer.sessionFingerprint&&Boolean(consumer.actor&&!consumer.actor.userId.startsWith('guest:'))
  :owner.actor?Boolean(consumer.actor&&!consumer.sessionFingerprint&&actorKey(owner.actor)===actorKey(consumer.actor))
  :!consumer.sessionFingerprint&&(!consumer.actor||consumer.actor.userId.startsWith('guest:'))&&owner.peer===consumer.peer;
 const markConsumed=(key:string)=>{consumed.delete(key);consumed.set(key,now()+90_000);while(consumed.size>256)consumed.delete(consumed.keys().next().value!);};
 return {
  async warm(intent:string,criteria:Search,scope:WarmScope,load:()=>Promise<WarmSupplierResult>,onLoad=false):Promise<'ready'|'skipped'>{
   if(!validSearchIntent(intent))return 'skipped';prune();
   const key=digest(intent),criteriaKey=digest(canonical(criteria));
   if(consumed.has(key))return 'skipped';
   const previous=entries.get(key);
   if(previous)return previous.criteria===criteriaKey&&canonical(previous.scope)===canonical(scope)&&(await previous.work)?'ready':'skipped';
   const scopeKey=scope.sessionFingerprint?`session:${scope.sessionFingerprint}`:scope.actor?actorKey(scope.actor):`anonymous:${scope.peer}`;
   const owner=onLoad?`preload:${scopeKey}`:scopeKey;
   // Keep capacity for edited searches during a burst of automatic page loads.
   if(active.has(owner)||active.size>=(onLoad?MAX_ACTIVE-1:MAX_ACTIVE))return 'skipped';
   while(entries.size>=MAX_ENTRIES){const old=[...entries].find(([,value])=>!value.pending);if(!old)return 'skipped';remove(...old);}
   active.add(owner);
   const entry:Entry={criteria:criteriaKey,scope:structuredClone(scope),started:now(),expires:now()+TTL,pending:true,claimed:false,bytes:0,work:Promise.resolve(null)};
   entry.work=Promise.resolve().then(load).then(result=>{
    if(result.freshUntil!==undefined){if(!Number.isFinite(result.freshUntil))return null;entry.expires=Math.min(entry.expires,result.freshUntil);}
    if(now()>=entry.expires)return null;
    // Once an explicit search owns the pending work, this is ordinary response
    // data, not retained speculative cache. Do not repeat a large supplier call.
    if(entry.claimed)return result;
    const size=Buffer.byteLength(JSON.stringify(result));if(size>MAX_RESULT_BYTES)return null;
    if(entries.get(key)===entry){
     while(bytes+size>MAX_BYTES){const old=[...entries].find(([other,value])=>other!==key&&!value.pending);if(!old){remove(key,entry);return null;}remove(...old);}
     entry.bytes=size;bytes+=size;
    }
    return result;
   }).catch(()=>null).finally(()=>{entry.pending=false;active.delete(owner);if(now()>=entry.expires)remove(key,entry);});
   entries.set(key,entry);
   const result=await entry.work;if(!result)remove(key,entry);
   return result?'ready':'skipped';
  },
  take(intent:string|undefined,criteria:Search,scope:WarmScope):{status:WarmAdoptionStatus;result:Promise<WarmSupplierResult|null>}{
   if(!validSearchIntent(intent))return {status:'miss',result:Promise.resolve(null)};
   prune();const key=digest(intent),entry=entries.get(key);markConsumed(key);
   if(!entry||entry.criteria!==digest(canonical(criteria))||!sameOwner(entry.scope,scope))return {status:'miss',result:Promise.resolve(null)};
   entry.claimed=true;
   remove(key,entry);
   return {status:entry.pending?'joined':'hit',result:entry.work.then(result=>result&&now()<entry.expires?structuredClone(result):null)};
  },
 };
}
// Next can bundle warm and normal Route Handlers separately. Their promises and
// one-use markers must live in this process-wide singleton, not module instances.
const shared=globalThis as unknown as {maxtravelSearchWarmV1?:ReturnType<typeof createSearchWarmCache>};
export const searchWarmCache=shared.maxtravelSearchWarmV1??=createSearchWarmCache();
