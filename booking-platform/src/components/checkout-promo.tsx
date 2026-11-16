"use client";
import { useRef, useState } from 'react';
export type PromoResult={quoteId:string;totalMinor:number;discountMinor:number;originalTotalMinor:number;code:string|null};
export default function CheckoutPromo({quoteId,disabled,onUpdate,onBusy,onUncertain}:{quoteId:string;disabled:boolean;onUpdate:(result:PromoResult)=>void;onBusy:(busy:boolean)=>void;onUncertain:(uncertain:boolean)=>void}){
 const [code,setCode]=useState(''),[applied,setApplied]=useState<PromoResult|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const locked=useRef(false),uncertain=useRef(false);
 async function apply(value:string){
  if(locked.current||disabled)return;
  locked.current=true;setBusy(true);onBusy(true);setMessage('');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let rejected=false;
  try{
   const response=await fetch('/api/travel/promo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quoteId,code:value}),signal:controller.signal});
   rejected=response.status>=400&&response.status<500&&response.status!==408;
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Could not apply promo code.');
   if(data.quoteId!==quoteId||!Number.isSafeInteger(data.totalMinor)||data.totalMinor<0||!Number.isSafeInteger(data.discountMinor)||data.discountMinor<0)throw Error('Could not confirm the updated total.');
   setApplied(data);setCode(data.code??'');onUpdate(data);uncertain.current=false;onUncertain(false);
   setMessage(data.code?`${data.code} applied. You save ₹${(data.discountMinor/100).toFixed(2)}.`:'Promo code removed.');
  }catch(e){
   if(!rejected){uncertain.current=true;onUncertain(true);}
   setMessage((controller.signal.aborted?'The promo request timed out.':e instanceof Error?e.message:'Could not apply promo code.')+(rejected&&!uncertain.current?' Try another code or continue without this discount.':' Payment is paused until you apply or remove the code successfully to confirm the total.'));
  }finally{clearTimeout(timer);locked.current=false;setBusy(false);onBusy(false);}
 }

 return <section aria-label="Promo code" className="white-card" style={{margin:'16px 0'}}><h3>Have a promo code?</h3><label>Promo code<input value={code} maxLength={32} autoComplete="off" disabled={disabled||busy} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(code.trim())void apply(code);}}}/></label><button type="button" className="secondary" disabled={disabled||busy||!code.trim()} onClick={()=>void apply(code)}>Apply code</button><button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void apply('')}>Remove code</button>{applied?.code&&<p>Before discount: ₹{(applied.originalTotalMinor/100).toFixed(2)} · Discount: ₹{(applied.discountMinor/100).toFixed(2)}</p>}{message&&<p role="status">{message}</p>}<small>One code per booking. Changing extras or reviewing a new price clears the discount; apply it again afterward.</small></section>;
}
