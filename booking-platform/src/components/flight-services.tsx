"use client";
import { useEffect,useRef,useState } from "react";
import Script from "next/script";
import { serviceConditions } from "@/lib/service-conditions";
import {CHECKOUT_RECOVERY_KEY,clearCheckoutMarker,parseCheckoutMarker,parseCheckoutRecoveryStatus,isResolvedCheckout,isResumableCheckout,isResumableHostedCheckout,saveCheckoutMarker,type CheckoutMarker} from "@/lib/checkout-recovery";
import Link from "next/link";
import useCheckoutRecovery from "./use-checkout-recovery";
type ServicePayment={bookingId:string;free?:boolean;provider?:"RAZORPAY";orderId:string;keyId:string;amount:number;currency:string}|{bookingId:string;free?:false;provider:"PAYGLOCAL";checkoutUrl:string;amount:number;currency:"INR"};
type Options={trips:{src:string;dest:string;departureDate:string}[];travellers:{fn:string;ln:string}[];cancelledUnits:string[];reissued:boolean};
type Segment={id:string;label:string;pax:{id:string;name:string;type:string;blockedKinds?:string[]}[];options:{kind:"MEAL"|"BAGGAGE"|"SEAT";code:string;label:string;amountMinor:number}[]};
type Fare={sI:{da:{code:string};aa:{code:string};dt:string;at:string;fD:{aI:{name:string}}}[];totalPriceList:{id:string;fareIdentifier:string;customerEstimateMinor:number|null}[]};
type Search={searchId:string;kind:string;results:{segments?:Segment[];searchResult?:{tripInfos:Record<string,Fare[]>}}};
type Quote={quoteId:string;kind:string;parentReference:string;totalMinor:number;expiresAt:string;review:unknown};
const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(n/100);
async function request<T>(path:string,body?:unknown):Promise<T>{const r=await fetch(path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});const data=await r.json();if(!r.ok)throw Error(data.error||"Request failed.");return data;}
export default function FlightServices({bookingId,onUpdate}:{bookingId:string;onUpdate:()=>void}){
 const [kind,setKind]=useState<"ANCILLARY"|"REISSUE"|null>(null),[options,setOptions]=useState<Options|null>(null),[search,setSearch]=useState<Search|null>(null),[quote,setQuote]=useState<Quote|null>(null),[tripIndex,setTripIndex]=useState(0),[passengers,setPassengers]=useState<number[]>([]),[choices,setChoices]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const recovery=useCheckoutRecovery();
 const mounted=useRef(false),attempt=useRef<CheckoutMarker|null>(null);
 const [started,setStarted]=useState(false),[now,setNow]=useState(0);
 useEffect(()=>{mounted.current=true;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{mounted.current=false;clearInterval(timer);};},[]);
 const expired=Boolean(quote&&(!Number.isFinite(Date.parse(quote.expiresAt))||!now||Date.parse(quote.expiresAt)<=now));
 const locked=started||recovery.blocked;
 const conditions=quote?serviceConditions(quote.review):null;
 const busyRef=useRef(false),checkoutOpen=useRef(false),verificationStarted=useRef(false);
 // Reconciliation can finish a previously uncertain write without re-running its
 // create/verify call. Retire the consumed quote, never unlock its old pay form.
 useEffect(()=>{
  const status=recovery.status;
  if(!started||!status||!isResolvedCheckout(status))return;
  const timer=setTimeout(()=>{
   const marker=attempt.current;
   if(!mounted.current||!marker||(marker.bookingId&&marker.bookingId!==status.bookingId))return;
   clearCheckoutMarker(marker);attempt.current=null;setStarted(false);setQuote(null);setSearch(null);setKind(null);setOptions(null);setChoices({});setPassengers([]);
   onUpdate();setMessage("The previous checkout is resolved. Check the linked booking for supplier confirmation before requesting further changes.");
  },0);
  return()=>clearTimeout(timer);
 },[started,recovery.status,onUpdate]);
 function releaseCheckout(){checkoutOpen.current=false;busyRef.current=false;if(mounted.current)setBusy(false);}
 async function run(work:()=>Promise<void>){if(busyRef.current)return;busyRef.current=true;setBusy(true);setMessage("");try{await work();}catch(e){checkoutOpen.current=false;if(mounted.current)setMessage(e instanceof Error?e.message:"Flight service unavailable.");}finally{if(!checkoutOpen.current){busyRef.current=false;if(mounted.current)setBusy(false);}}}
 async function open(next:"ANCILLARY"|"REISSUE"){if(busyRef.current||locked)return;setKind(next);setSearch(null);setQuote(null);setChoices({});setPassengers([]);await run(async()=>{if(next==="REISSUE")setOptions(await request<Options>(`/api/bookings/${bookingId}/services`));else setSearch(await request<Search>(`/api/bookings/${bookingId}/services`,{kind:next}));});}
 async function review(data:unknown){if(locked)return;await run(async()=>setQuote(await request<Quote>("/api/travel/service-review",{searchId:search?.searchId,...data as object})));}

 async function paymentRequest<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(20_000)});
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error||"Payment outcome could not be confirmed.") as Error&{code?:string};error.code=data.code;throw error;}return data;
 }
 async function resumePayment(marker:CheckoutMarker){
  const query=marker.bookingId?`bookingId=${encodeURIComponent(marker.bookingId)}`:`quoteId=${encodeURIComponent(marker.quoteId)}`;
  const status=parseCheckoutRecoveryStatus(await paymentRequest<unknown>(`/api/payments/status?${query}`));
  if(!mounted.current)return;
  if(!status||(!isResumableCheckout(status)&&!isResumableHostedCheckout(status))||!status.quoteExpiresAt||!(Date.parse(status.quoteExpiresAt)>new Date().getTime())){
   await recovery.reconcile(marker);throw Error(status?.message||"This checkout cannot be reopened safely. Check booking updates or contact support; do not pay again.");
  }
  const saved={...marker,bookingId:status.bookingId};
  if(!saveCheckoutMarker(saved))throw Error("Checkout recovery could not be saved. Check booking updates before paying again.");
  attempt.current=saved;
  if(isResumableHostedCheckout(status)){checkoutOpen.current=true;setMessage("Opening the original secure hosted checkout. Returning is not payment or supplier confirmation; check booking updates.");window.location.assign(status.checkoutUrl);return;}
  if(!isResumableCheckout(status))throw Error("Checkout cannot be resumed safely.");
  if(!window.Razorpay)throw Error("Payment checkout has not loaded. Your original order is preserved; check status to resume it.");
  verificationStarted.current=false;
  const checkout=new window.Razorpay({key:status.keyId,amount:status.amount,currency:status.currency,order_id:status.orderId,name:"Max Travel · Flight services",handler:result=>{
   if(verificationStarted.current||!mounted.current)return;verificationStarted.current=true;releaseCheckout();
   void run(async()=>{try{const verified=await paymentRequest<{bookingId?:string;status?:string}>("/api/payments/verify",{bookingId:status.bookingId,...result});if(!mounted.current)return;if(verified.bookingId!==status.bookingId||verified.status!=="PAYMENT_VERIFIED")throw Error("Payment verification response could not be confirmed. Check the original order; do not pay again.");clearCheckoutMarker(saved);recovery.clear();attempt.current=null;setStarted(false);setQuote(null);setSearch(null);setKind(null);onUpdate();setMessage("Request received. Check the linked booking for supplier confirmation.");}catch(error){if(mounted.current){await recovery.reconcile(saved);throw error;}}});
  },modal:{ondismiss:()=>{if(verificationStarted.current||!mounted.current)return;releaseCheckout();setMessage("Checkout closed. Check payment status before resuming the same order.");void recovery.reconcile(saved);}}});
  checkout.on("payment.failed",()=>{if(verificationStarted.current||!mounted.current)return;releaseCheckout();setMessage("Payment was not confirmed. Check the existing order before continuing.");void recovery.reconcile(saved);});
  checkoutOpen.current=true;checkout.open();
 }
 async function beginPayment(){
  if(!quote||locked||expired||busyRef.current||!(Date.parse(quote.expiresAt)>new Date().getTime()))return;
  await run(async()=>{
   // Save opaque recovery IDs BEFORE mutation, including zero-value services.
   // Never replace a different unresolved checkout belonging to this tab.
   const existing=parseCheckoutMarker(sessionStorage.getItem(CHECKOUT_RECOVERY_KEY));
   if(existing){await recovery.reconcile(existing);throw Error("An earlier checkout needs attention. Check its status before starting another payment.");}
   if(!saveCheckoutMarker({quoteId:quote.quoteId}))throw Error("Secure recovery storage is unavailable. Check booking updates before starting payment.");
   const marker={quoteId:quote.quoteId};attempt.current=marker;setStarted(true);
   try{
    const payment=await paymentRequest<ServicePayment>("/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor});
    if(!mounted.current)return;
    if(payment.free===true&&parseCheckoutMarker(JSON.stringify({quoteId:quote.quoteId,bookingId:payment.bookingId}))?.bookingId){clearCheckoutMarker(marker);recovery.clear();attempt.current=null;setStarted(false);setQuote(null);setSearch(null);setKind(null);onUpdate();setMessage("Request received. Check the linked booking for supplier confirmation.");return;}
    if(!isResumableCheckout({...payment,canResume:true})&&!isResumableHostedCheckout({...payment,canResume:true}))throw Error("Checkout details could not be verified. Check the original payment status; do not pay again.");
    const saved={...marker,bookingId:payment.bookingId};attempt.current=saved;
    if(!saveCheckoutMarker(saved))throw Error("Checkout recovery could not be saved. Check booking updates before paying again.");
    await resumePayment(saved);
   }catch(error){
    if(!mounted.current)return;
    if((error as Error&{code?:string}).code==="PAYMENT_PROVIDER_UNAVAILABLE"){clearCheckoutMarker(marker);attempt.current=null;setStarted(false);}
    else await recovery.reconcile(attempt.current??marker);
    throw error;
   }
  });
 }
 return <section className="flight-services"><Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive"/><h3>Make this journey yours</h3><div className="account-tabs"><button type="button" disabled={busy||locked} aria-pressed={kind==="ANCILLARY"} onClick={()=>void open("ANCILLARY")}>Add seats, meals & baggage</button><button type="button" disabled={busy||locked} aria-pressed={kind==="REISSUE"} onClick={()=>void open("REISSUE")}>Reschedule flight</button></div>
 {kind==="REISSUE"&&options&&!search&&!quote&&<form onSubmit={e=>{e.preventDefault();const date=String(new FormData(e.currentTarget).get("newDate"));void run(async()=>setSearch(await request<Search>(`/api/bookings/${bookingId}/services`,{kind,tripIndex,date,travellerIndexes:passengers})));}}><p className="muted">One trip can be changed at a time, once per booking. Your original travel stays active until the new ticket is confirmed.</p><label>Flight to change<select value={tripIndex} onChange={e=>{setTripIndex(Number(e.target.value));setPassengers([]);}}>{options.trips.map((t,i)=><option key={i} value={i}>{t.src} → {t.dest} · {t.departureDate}</option>)}</select></label><label>New departure date<input name="newDate" type="date" required/></label><fieldset><legend>Passengers to reschedule</legend>{options.travellers.map((p,i)=><label key={i} className="checkbox"><input type="checkbox" disabled={busy||options.cancelledUnits.includes(`${tripIndex}:${i}`)} checked={passengers.includes(i)} onChange={e=>setPassengers(current=>e.target.checked?[...current,i]:current.filter(index=>index!==i))}/>{p.fn} {p.ln}</label>)}</fieldset><button className="secondary" disabled={busy||!passengers.length||options.reissued}>Search replacement flights</button>{options.reissued&&<p className="info-message">This booking has already been reissued.</p>}</form>}
 {search&&!quote&&kind==="REISSUE"&&!Object.values(search.results.searchResult?.tripInfos??{}).flat().length&&<p className="info-message" role="status">No replacement flights were returned for this date. Choose Reschedule flight to try another date. Your original travel has not changed.</p>}
 {search&&!quote&&kind==="REISSUE"&&Object.values(search.results.searchResult?.tripInfos??{}).flat().map((flight,i)=><article key={i} className="white-card"><h4>{flight.sI.map(s=>`${s.da.code} → ${s.aa.code} · ${s.dt} — ${s.at} · ${s.fD.aI.name}`).join(" | ")}</h4>{flight.totalPriceList.map(fare=><div className="live-fare" key={fare.id}><span>{fare.fareIdentifier} · {fare.customerEstimateMinor===null?"Price at review":money(fare.customerEstimateMinor)} additional</span><button className="secondary" disabled={busy} onClick={()=>void review({priceId:fare.id})}>Review change</button></div>)}</article>)}
 {search&&!quote&&kind==="ANCILLARY"&&<form onSubmit={e=>{e.preventDefault();const selections=(search.results.segments??[]).flatMap(segment=>segment.pax.flatMap(pax=>(["MEAL","BAGGAGE","SEAT"] as const).flatMap(type=>{const code=choices[`${segment.id}:${pax.id}:${type}`];return code?[{segmentId:segment.id,paxId:pax.id,kind:type,code}]:[];})));void review({choices:selections});}}><p className="muted">Extras are purchased separately from your flight. Baggage covers the complete connecting trip. Infants cannot add extras. Exit-row seats require an eligible, able adult.</p>{search.results.segments?.map(segment=><fieldset key={segment.id}><legend>{segment.label}</legend>{segment.pax.map(pax=><div key={pax.id}><h4>{pax.name}</h4><div className="form-row">{(["MEAL","BAGGAGE","SEAT"] as const).map(type=><label key={type}>{type.toLowerCase()}<select aria-label={`${type.toLowerCase()} for ${pax.name} · ${segment.label}`} value={choices[`${segment.id}:${pax.id}:${type}`]??""} onChange={e=>setChoices(current=>({...current,[`${segment.id}:${pax.id}:${type}`]:e.target.value}))}><option value="">No addition</option>{segment.options.filter(o=>o.kind===type&&!pax.blockedKinds?.includes(type)).map(o=><option key={o.code} value={o.code}>{o.label} · {money(o.amountMinor)}</option>)}</select></label>)}</div></div>)}</fieldset>)}{!search.results.segments?.length&&<p className="info-message">No selectable extras returned by the supplier. Contact support for assistance.</p>}<button className="secondary" disabled={busy||!Object.values(choices).some(Boolean)}>Review extras total</button></form>}
 {quote&&<form onSubmit={e=>{e.preventDefault();if(!conditions||conditions.blocked||locked||expired)return;const consent=e.currentTarget.elements.namedItem("serviceConsent");if(!(consent instanceof HTMLInputElement)||!consent.checked||!consent.reportValidity())return;void beginPayment();}}><h4>{quote.kind==="REISSUE"?"Reschedule":"Flight extras"} · {quote.parentReference}</h4><h3>{money(quote.totalMinor)} additional payable</h3><p>Quote expires at {new Date(quote.expiresAt).toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata"})} IST.</p><section className="service-conditions" aria-label="Supplier conditions"><h4>Supplier conditions & notices</h4><p>Review every condition before confirming. Confirmation is unavailable if the complete supplier terms cannot be safely displayed.</p>{conditions?.lines.length?<dl>{conditions.lines.map((line,index)=><div key={index}><dt>{line.label}</dt><dd>{line.text}</dd></div>)}</dl>:<p>No additional condition text was returned. This does not mean changes or extras are unrestricted.</p>}{conditions?.blocked&&<p role="alert">Some supplier terms could not be safely displayed. Confirmation is unavailable; contact support to review the complete terms.</p>}</section><label className="checkbox"><input type="checkbox" name="serviceConsent" required disabled={locked||expired||!conditions||conditions.blocked}/>I accept the additional total and supplier conditions, including seat eligibility. Fulfilment is subject to supplier confirmation.</label><button className="primary" disabled={busy||locked||expired||!conditions||conditions.blocked}>Confirm {quote.totalMinor?"& pay":"request"}</button></form>}
 {quote&&expired&&!locked&&<p role="alert">This service quote has expired. Choose seats, meals & baggage or reschedule again above to check current availability and accept a fresh quote. No payment was started.</p>}
 {(started||recovery.pending)&&<section aria-label="Interrupted payment recovery"><h4>Check your existing checkout</h4><p>An earlier checkout in this tab needs attention; it may belong to another trip. New service payments are paused. A payment is not supplier confirmation.</p><p role="status">{recovery.message}</p><button type="button" className="secondary" disabled={busy||recovery.checking} onClick={()=>void run(async()=>{const marker=attempt.current??recovery.pending;if(marker)await recovery.reconcile(marker);})}>Check existing payment status</button>{started&&recovery.status&&(isResumableCheckout(recovery.status)||isResumableHostedCheckout(recovery.status))&&<button type="button" className="primary" disabled={busy||recovery.checking} onClick={()=>void run(async()=>{const marker=attempt.current??recovery.pending;if(marker)await resumePayment(marker);})}>Resume existing checkout</button>}{!started&&<Link href="/book">Open original checkout recovery</Link>}<Link href="/my-trips">View booking updates</Link><Link href="/customer-support">Contact support about this checkout</Link></section>}
 {recovery.checking&&!started&&<p role="status">Checking for an interrupted checkout…</p>}
 {busy&&<p role="status">Checking your flight service…</p>}{message&&<p role="alert" className="info-message">{message}</p>}
 </section>;
}
