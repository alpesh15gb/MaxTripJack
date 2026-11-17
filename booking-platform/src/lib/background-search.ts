import type {Search} from './providers/contracts';

type Intent={key:string;token:string;createdAt:number};
let intent:Intent|null=null;
let pending:Promise<void>|null=null;
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
export function warmBackgroundSearch(input:Search):{started:boolean;finished:Promise<void>;busy?:boolean}{
 if(!backgroundSearchAllowed())return {started:false,finished:Promise.resolve()};
 const requestKey=key(input);
 if(intent?.key===requestKey&&Date.now()-intent.createdAt<lifetime)return {started:false,finished:pending??Promise.resolve()};
 if(pending)return {started:false,finished:pending,busy:true};
 if(typeof globalThis.crypto?.randomUUID!=='function'||typeof globalThis.AbortSignal?.timeout!=='function')return {started:false,finished:Promise.resolve()};
 const next={key:requestKey,token:crypto.randomUUID(),createdAt:Date.now()};intent=next;
 let work:Promise<void>;
 try{work=fetch('/api/travel/search/warm',{method:'POST',headers:{'Content-Type':'application/json','X-Search-Intent':next.token},body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(20_000)}).then(()=>{},()=>{});}
 catch{intent=null;return {started:false,finished:Promise.resolve()};}
 pending=work;
 void work.finally(()=>{if(pending===work)pending=null;});
 return {started:true,finished:work};
}
/** Submission never waits on warming. A nonmatching/expired intent falls back. */
export function takeBackgroundSearchHeaders(input:Search):Record<string,string>{
 const current=intent;intent=null;
 return current?.key===key(input)&&Date.now()-current.createdAt<lifetime?{'X-Search-Intent':current.token}:{};
}
