import type {Search} from './providers/contracts';

type Intent={key:string;token:string;createdAt:number};
type Pending={key:string;work:Promise<void>};
let intent:Intent|null=null;
let pending:Pending|null=null;
let preload:Pending|null=null;
let identity:string|undefined;
const lifetime=45_000;
const key=(input:Search)=>JSON.stringify(input);

/** Per-document memory only; this module survives Home → /book client navigation. */
export function syncBackgroundSearchIdentity(next:string){
 if(identity!==undefined&&identity!==next)intent=null;
 identity=next;
}
export function invalidateBackgroundSearch(){intent=null;}
export function backgroundSearchAllowed(){
 return typeof document!=='undefined'&&document.visibilityState==='visible'&&navigator.onLine!==false&&!(navigator as Navigator&{connection?:{saveData?:boolean}}).connection?.saveData;
}
export function warmBackgroundSearch(input:Search,onLoad=false):{started:boolean;finished:Promise<void>;busy?:boolean}{
 if(!backgroundSearchAllowed())return {started:false,finished:Promise.resolve()};
 const requestKey=key(input);
 const matching=pending?.key===requestKey?pending:preload?.key===requestKey?preload:null;
 if(matching||intent?.key===requestKey&&Date.now()-intent.createdAt<lifetime)return {started:false,finished:matching?.work??Promise.resolve()};
 const occupied=onLoad?preload:pending;
 if(occupied)return {started:false,finished:occupied.work,busy:true};
 if(typeof globalThis.crypto?.randomUUID!=='function'||typeof globalThis.AbortSignal?.timeout!=='function')return {started:false,finished:Promise.resolve()};
 const next={key:requestKey,token:crypto.randomUUID(),createdAt:Date.now()};intent=next;
 let work:Promise<void>;
 try{work=fetch('/api/travel/search/warm',{method:'POST',headers:{'Content-Type':'application/json','X-Search-Intent':next.token,...(onLoad?{'X-Search-Preload':'1'}:{})},body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(20_000)}).then(()=>{},()=>{});}
 catch{intent=null;return {started:false,finished:Promise.resolve()};}
 const item={key:requestKey,work};
 if(onLoad)preload=item;
 else pending=item;
 void work.finally(()=>{if(pending===item)pending=null;if(preload===item)preload=null;});
 return {started:true,finished:work};
}
/** Submission never waits on warming. A nonmatching/expired intent falls back. */
export function takeBackgroundSearchHeaders(input:Search):Record<string,string>{
 const current=intent;intent=null;
 return current?.key===key(input)&&Date.now()-current.createdAt<lifetime?{'X-Search-Intent':current.token}:{};
}
