'use client';
import {useEffect,useId,useRef,useState} from 'react';

const cabins=[['ECONOMY','Economy'],['PREMIUM_ECONOMY','Premium economy'],['BUSINESS','Business'],['FIRST','First']] as const;
export const cabinLabel=(value:string)=>cabins.find(([key])=>key===value)?.[1]??'Economy';

function Stepper({label,hint,value,min,max,onChange}:{label:string;hint:string;value:number;min:number;max:number;onChange:(value:number)=>void}){
 return <div className="travellers-row">
  <span><strong>{label}</strong><small>{hint}</small></span>
  <div className="travellers-stepper" role="group" aria-label={label}>
   <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value<=min} onClick={()=>onChange(value-1)}>−</button>
   <output aria-live="polite">{value}</output>
   <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value>=max} onClick={()=>onChange(value+1)}>+</button>
  </div>
 </div>;
}

/** One "Travellers & class" field (as on the major OTAs). Children, infants and
 * cabin live in the panel that opens below the field, not above the search. */
export default function TravellersPicker({product,adults,childCount:children,infants,cabin,onChange}:{
 product:'FLIGHT'|'HOTEL';adults:number;childCount:number;infants:number;cabin:string;
 onChange:(next:{adults:number;children:number;infants:number;cabin:string})=>void;
}){
 const id=useId(),root=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  if(!open)return;
  const away=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false);};
  const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);root.current?.querySelector<HTMLButtonElement>('.travellers-trigger')?.focus();}};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape);};
 },[open]);
 const flight=product==='FLIGHT';
 const total=adults+(flight?children+infants:0);
 const set=(patch:Partial<{adults:number;children:number;infants:number;cabin:string}>)=>{
  const next={adults,children,infants,cabin,...patch};
  next.children=Math.min(next.children,9-next.adults);next.infants=Math.min(next.infants,next.adults);
  onChange(next);
 };
 return <div className="home-search-input home-guests travellers-picker" ref={root}>
  <span id={`${id}-label`}>{flight?'Travellers & class':'Guests'}</span>
  <button type="button" className="travellers-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-panel`} aria-labelledby={`${id}-label ${id}-value`} onClick={()=>setOpen(value=>!value)}>
   <span id={`${id}-value`}><strong>{total}</strong> {flight?(total===1?'Traveller':'Travellers'):(total===1?'Adult':'Adults')}</span>
  </button>
  <small>{flight?cabinLabel(cabin):'1 room'}</small>
  {open&&<div className="travellers-panel" id={`${id}-panel`} role="dialog" aria-label={flight?'Travellers and cabin class':'Guests'}>
   <Stepper label="Adults" hint={flight?'12 years and above':'Per room'} value={adults} min={1} max={flight?9:4} onChange={value=>set({adults:value})}/>
   {flight&&<>
    <Stepper label="Children" hint="2–11 years" value={children} min={0} max={9-adults} onChange={value=>set({children:value})}/>
    <Stepper label="Infants" hint="Under 2, on an adult’s lap" value={infants} min={0} max={adults} onChange={value=>set({infants:value})}/>
    <fieldset className="travellers-cabins"><legend>Cabin class</legend>
     {cabins.map(([value,text])=><label key={value}><input type="radio" name={`${id}-cabin`} value={value} checked={cabin===value} onChange={()=>set({cabin:value})}/>{text}</label>)}
    </fieldset>
    <p>Up to 9 adults and children. Ages apply on the travel date.</p>
   </>}
   <button type="button" className="travellers-done" onClick={()=>{setOpen(false);root.current?.querySelector<HTMLButtonElement>('.travellers-trigger')?.focus();}}>Done</button>
  </div>}
 </div>;
}
