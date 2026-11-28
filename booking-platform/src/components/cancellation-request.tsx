"use client";
import { useRef, useState } from "react";
type Options={trips:{src:string;dest:string;departureDate:string}[];travellers:{fn:string;ln:string}[];cancelledUnits:string[]};
export default function CancellationRequest({bookingId,product,onSubmitted}:{bookingId:string;product:string;onSubmitted?:()=>void}){
 const attempt=useRef<{reason:string;requestKey:string;selection?:{tripIndex:number;travellerIndexes:number[]}[]}|null>(null);
 const inFlight=useRef(false);
 const [uncertain,setUncertain]=useState(false);
 const [options,setOptions]=useState<Options|null>(null),[selected,setSelected]=useState<string[]>([]),[partial,setPartial]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function load(){
   if(inFlight.current||uncertain)return;
   inFlight.current=true;setBusy(true);setMessage("");
   try {
     const r=await fetch(`/api/bookings/${bookingId}/cancellation-options`,{cache:"no-store",signal:AbortSignal.timeout(15_000)});
     const data=await r.json().catch(()=>null);
     if(!r.ok)throw Error(typeof data?.error==="string"?data.error:"Unable to load passengers.");
     if(!Array.isArray(data?.trips)||!Array.isArray(data?.travellers)||!Array.isArray(data?.cancelledUnits))
       throw Error("Cancellation options could not be checked. Try again.");
     setOptions(data);setPartial(true);
   }catch(e){setMessage(e instanceof Error?e.message:"Unable to load passengers.");}
   finally{inFlight.current=false;setBusy(false);}
 }
 return <form className="trip-cancellation-request" onSubmit={async e=>{e.preventDefault();if(inFlight.current)return;const reason=String(new FormData(e.currentTarget).get("reason"));inFlight.current=true;setBusy(true);setMessage("");try{const selection=partial?options?.trips.flatMap((_,tripIndex)=>{const travellerIndexes=options.travellers.flatMap((_,i)=>selected.includes(`${tripIndex}:${i}`)?[i]:[]);return travellerIndexes.length?[{tripIndex,travellerIndexes}]:[];}):undefined;
 if(partial&&!selection?.length)throw Error("Select at least one passenger and flight.");
 attempt.current??={reason,requestKey:crypto.randomUUID(),...(selection?{selection}:{})};
 const r=await fetch(`/api/bookings/${bookingId}/cancellation`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(attempt.current),signal:AbortSignal.timeout(20_000)});
 const data=await r.json().catch(()=>null);
 if(!r.ok){if(r.status<500&&!uncertain){attempt.current=null;setUncertain(false);}throw Error(typeof data?.error==="string"?data.error:"Cancellation request failed.");}
 if(typeof data?.message!=="string"||!data.message.trim())throw Error("The cancellation request could not be confirmed.");
 attempt.current=null;setUncertain(false);setMessage(data.message);setSelected([]);setPartial(false);setOptions(null);onSubmitted?.();
 }catch(e){if(attempt.current){setUncertain(true);setMessage("We could not confirm whether your request was received. Retry the same request below; do not start another cancellation. Your selection is preserved.");}else setMessage(e instanceof Error?e.message:"Request failed.");}finally{inFlight.current=false;setBusy(false);}}}>
 <h3>Cancel travel</h3><p className="muted">Our team will check the charges and send terms for your acceptance. Travel remains active until cancellation is confirmed.</p>
 {product==="FLIGHT"&&<div className="account-tabs"><button type="button" disabled={busy||uncertain} aria-pressed={!partial} onClick={()=>setPartial(false)}>All remaining travel</button><button type="button" disabled={busy||uncertain} aria-pressed={partial} onClick={()=>void load()}>Choose passengers / flights</button></div>}
 {partial&&options&&(!options.trips.length?<p className="info-message">This booking needs staff assistance for partial cancellation. Contact support or select all remaining travel.</p>:options.trips.map((trip,ti)=><fieldset key={ti}><legend>{trip.src} → {trip.dest} · {trip.departureDate}</legend>{options.travellers.map((t,pi)=>{const unit=`${ti}:${pi}`,cancelled=options.cancelledUnits.includes(unit);return <label key={pi} className="checkbox"><input type="checkbox" disabled={busy||uncertain||cancelled} checked={selected.includes(unit)} onChange={e=>setSelected(current=>e.target.checked?[...current,unit]:current.filter(value=>value!==unit))}/>{t.fn} {t.ln}{cancelled?" · Already cancelled":""}</label>;})}</fieldset>))}
 <label>Reason for cancellation<input name="reason" placeholder="Tell us why your plans have changed" disabled={busy||uncertain} required minLength={3} maxLength={1000}/></label><button className="secondary" disabled={busy||partial&&!options?.trips.length}>{busy?"Sending…":uncertain?"Retry existing cancellation request":"Request cancellation terms"}</button>{message&&<p className="info-message" role="status">{message}</p>}
 </form>;
}
