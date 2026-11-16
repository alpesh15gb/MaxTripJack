"use client";
import { useId, useRef, useState } from 'react';
import { displayMoney } from '@/lib/display-money';
import type { CheckoutPromoOffer } from '@/lib/promo-offers';
import '@/app/checkout-promo.css';
export type PromoResult={quoteId:string;totalMinor:number;discountMinor:number;originalTotalMinor:number;code:string|null};
const expiryFormat = new Intl.DateTimeFormat('en-IN', {dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Kolkata'});

function isCheckoutOffer(value: unknown): value is CheckoutPromoOffer {
 if (!value || typeof value !== 'object') return false;
 const {code, discountMinor, minimumMinor, expiresAt} = value as Partial<CheckoutPromoOffer>;
 return typeof code === 'string' && /^[A-Z0-9_-]{3,32}$/.test(code)
  && typeof discountMinor === 'number' && Number.isSafeInteger(discountMinor) && discountMinor > 0
  && typeof minimumMinor === 'number' && Number.isSafeInteger(minimumMinor) && minimumMinor >= 0
  && typeof expiresAt === 'string' && expiresAt.length <= 40 && Number.isFinite(Date.parse(expiresAt));
}

export default function CheckoutPromo({quoteId,disabled,needsConfirmation=false,onUpdate,onBusy,onUncertain}:{quoteId:string;disabled:boolean;needsConfirmation?:boolean;onUpdate:(result:PromoResult)=>void;onBusy:(busy:boolean)=>void;onUncertain:(uncertain:boolean)=>void}){
 const [code,setCode]=useState(''),[applied,setApplied]=useState<PromoResult|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [uncertain,setUncertain]=useState(false);
 const locked=useRef(false);
 const [offersOpen, setOffersOpen] = useState(false);
 const [offers, setOffers] = useState<CheckoutPromoOffer[]>([]);
 const [offersLoading, setOffersLoading] = useState(false);
 const [offersError, setOffersError] = useState('');
 const offersId = useId();
 const codeId = useId();

 async function loadOffers() {
  setOffersLoading(true);
  setOffersError('');
  setOffers([]);
  try {
   const search = new URLSearchParams({quoteId});
   const response = await fetch(`/api/travel/promo?${search}`, {signal:AbortSignal.timeout(10000)});
   const data: unknown = await response.json();
   const payload = data && typeof data === 'object' ? data as {offers?: unknown; error?: unknown} : {};
   if (!response.ok && typeof payload.error === 'string' && payload.error.length <= 240) throw Error(payload.error);
   if (!response.ok || !Array.isArray(payload.offers) || payload.offers.length > 8 || !payload.offers.every(isCheckoutOffer)) {
    throw Error('Available offers could not be loaded.');
   }
   setOffers(payload.offers);
  } catch (error) {
   setOffersError(error instanceof Error && error.name === 'Error' ? error.message : 'Available offers could not be loaded.');
  } finally {
   setOffersLoading(false);
  }
 }
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
   setApplied(data);setCode(data.code??'');onUpdate(data);setUncertain(false);onUncertain(false);
   setMessage(data.code?`${data.code} applied. You save ₹${(data.discountMinor/100).toFixed(2)}.`:'Promo code removed.');
  }catch(e){
   if(!rejected){setUncertain(true);onUncertain(true);}
   setMessage((controller.signal.aborted?'The promo request timed out.':e instanceof Error?e.message:'Could not apply promo code.')+(rejected&&!uncertain&&!needsConfirmation?' Try another code or continue without this discount.':' Payment is paused until you apply or remove the code successfully to confirm the total.'));
  }finally{clearTimeout(timer);locked.current=false;setBusy(false);onBusy(false);}
 }

 return <section aria-label="Promo code" className="white-card checkout-promo">
  <div className="checkout-promo-heading">
   <label htmlFor={codeId}>Promo code</label>
   <button type="button" className="secondary checkout-offers-toggle" aria-expanded={offersOpen} aria-controls={offersId}
    disabled={!offersOpen && (disabled || busy || offersLoading)} onClick={()=>{
     setOffersOpen(!offersOpen);
     if (!offersOpen) void loadOffers();
    }}>{offersOpen ? 'Hide available offers' : 'Available offers'}</button>
  </div>
  <div className="checkout-promo-entry">
   <input id={codeId} value={code} maxLength={32} autoComplete="off" placeholder="Enter code" disabled={disabled||busy} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(code.trim())void apply(code);}}}/>
   <button type="button" className="secondary" disabled={disabled||busy||!code.trim()} onClick={()=>void apply(code)}>Apply code</button>
  </div>
  <div id={offersId} className="checkout-promo-offers" hidden={!offersOpen}>
   {offersLoading && <p role="status">Checking available offers…</p>}
   {offersError && <p role="status">{offersError} You can still enter a promo code.</p>}
   {!offersLoading && !offersError && (offers.length ? <ul>{offers.map(offer=>{
    const selected = applied?.code === offer.code;
    return <li key={offer.code}>
     <div>
      <strong>{offer.code} · Save {displayMoney(offer.discountMinor)}</strong>
      <small>{offer.minimumMinor > 0 ? `Minimum booking ${displayMoney(offer.minimumMinor)} · ` : ''}Expires {expiryFormat.format(new Date(offer.expiresAt))} IST</small>
     </div>
     <button type="button" className="secondary" disabled={disabled || busy || selected} onClick={()=>void apply(offer.code)}>{selected ? 'Applied' : `Apply ${offer.code}`}</button>
    </li>;
   })}</ul> : <p role="status">No public offers are available for this booking.</p>)}
  </div>
  {(applied?.code || needsConfirmation || uncertain)&&<div className="checkout-promo-applied">
   {applied?.code&&<p>Before discount: {displayMoney(applied.originalTotalMinor)} · Discount: {displayMoney(applied.discountMinor)}</p>}
   <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void apply('')}>Remove code</button>
  </div>}
  {message&&<p role="status">{message}</p>}
  <small>One code per booking. Changing extras or reviewing a new price clears the discount.</small>
 </section>;
}
