'use client';
import {useCallback,useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {compactRupees,type FareCalendarDay} from '@/lib/fare-calendar-core';
import SearchPickerDialog from './search-picker-dialog';
import {StitchSymbol} from './stitch-symbol';
import {formatBookingDate} from '@/lib/travel-date';

const monthName=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
const fullDate=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const shortDay=new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'});
const longDay=new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'UTC'});
const selectedDay=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const compactDay=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const iso=(time:number)=>new Date(time).toISOString().slice(0,10);
const at=(date:string)=>Date.parse(`${date}T00:00:00Z`);
const shift=(date:string,days:number)=>iso(at(date)+days*86_400_000);
function monthStart(date:string){return `${date.slice(0,7)}-01`;}
function nextMonth(start:string,count=1){const d=new Date(at(start));d.setUTCMonth(d.getUTCMonth()+count);return iso(d.getTime());}

/** Date field with an inline two-month calendar. Prices are indicative "from"
 * fares per adult; the hidden input keeps native form submission unchanged. */
export default function FareDatePicker({name,label,value,min,max,onChange,fares,rangeStart,helper,iconOnly=false,openOnMount=false,startAtMinimum=false,compact=false}:{
 name?:string;label:string;value:string;min:string;max?:string;onChange:(value:string)=>void;iconOnly?:boolean;
 fares?:Record<string,FareCalendarDay>;rangeStart?:string;helper?:string;openOnMount?:boolean;startAtMinimum?:boolean;compact?:boolean;
}){
 const id=useId(),root=useRef<HTMLDivElement>(null),grid=useRef<HTMLDivElement>(null);
 const firstMonth=monthStart(startAtMinimum?min:value||min);
 const firstFocus=value>=min&&value<nextMonth(firstMonth,2)?value:min;
 const [open,setOpen]=useState(openOnMount);
 const [view,setView]=useState(firstMonth);
 const [focus,setFocus]=useState(firstFocus);
 const hasFares=Boolean(fares&&Object.keys(fares).length);
 const close=useCallback(()=>setOpen(false),[]);
 useEffect(()=>{if(open)grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();},[open,focus,view]);

 function toggle(){setView(firstMonth);setFocus(firstFocus);setOpen(current=>!current);}
 function pick(date:string){onChange(date);setOpen(false);root.current?.querySelector<HTMLButtonElement>('.fare-date-trigger')?.focus();}
 function allowed(date:string){return date>=min&&(!max||date<=max);}
 function browseMonth(offset:number){
  const start=nextMonth(view,offset),end=shift(nextMonth(start),-1);
  // Keep a real day in the visible month keyboard-reachable, including short
  // months and the first permitted month. Month browsing does not select it.
  let next=`${start.slice(0,8)}${focus.slice(8)}`;
  if(next>end)next=end;if(next<min)next=min;if(max&&next>max)next=max;
  setView(start);setFocus(next);
 }
 function move(date:string){
  if(!allowed(date))return;
  setFocus(date);
  const second=nextMonth(view);
  if(date<view)setView(monthStart(date));else if(date>=nextMonth(second))setView(nextMonth(monthStart(date),-1));
 }
 function keys(event:KeyboardEvent<HTMLDialogElement>){
  if(!grid.current?.contains(event.target as Node))return;
  const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
  if(step){event.preventDefault();move(shift(focus,step));return;}
  if(event.key==='Home'||event.key==='End'){
   event.preventDefault();
   const weekday=new Date(at(focus)).getUTCDay();
   const edge=shift(focus,event.key==='Home'?-weekday:6-weekday);
   move(edge<min?min:max&&edge>max?max:edge);
  }
 }
 const months=[view,nextMonth(view)];
 const canBack=view>monthStart(min);
 const canNext=!max||nextMonth(view)<=monthStart(max);
 const fare=fares?.[value];
 return <div className={`home-search-input fare-date${iconOnly?' fare-date-icon-only':''}`} ref={root}>
  {!iconOnly&&<span id={`${id}-label`} className="stitch-picker-caption"><StitchSymbol name="calendar_today" size={15}/>{label}</span>}
  <button type="button" className="fare-date-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?`${id}-panel`:undefined} aria-label={iconOnly?label:undefined} aria-labelledby={iconOnly?undefined:`${id}-label ${id}-value`} onClick={toggle}>
   {iconOnly ? <StitchSymbol name="calendar_today" size={19}/> : <span id={`${id}-value`} className="fare-date-value">{value?<><strong>{compact ? compactDay.format(at(value)) : formatBookingDate(value)}</strong>{!compact&&<><em className="stitch-wide-only">{shortDay.format(at(value))}</em><em className="stitch-phone-only">{longDay.format(at(value))}</em></>}</>:'Choose a date'}</span>}
  </button>
  {name&&<input type="hidden" name={name} value={value}/>}
  {!iconOnly&&<small>{fare?<>from <b className={`fare-band-${fare.band}`}>₹{compactRupees(fare.minor)}</b></>:helper??' '}</small>}
  {open&&<SearchPickerDialog id={`${id}-panel`} className={iconOnly?'fare-calendar':'fare-calendar home-fare-calendar'} modalOnDesktop={!iconOnly} label={`Choose ${label.toLowerCase()}`} onDismiss={close} onKeyDown={keys}>
   <div className="fare-calendar-head">
    <button type="button" aria-label="Previous month" disabled={!canBack} onClick={()=>browseMonth(-1)}>‹</button>
    <span className="calendar-selection">{value ? <>Selected <strong>{selectedDay.format(at(value))}</strong></> : 'Select a date'}</span>
    <button type="button" aria-label="Next month" disabled={!canNext} onClick={()=>browseMonth(1)}>›</button>
   </div>
   <div className="fare-calendar-months" ref={grid}>
    {months.map(start=>{
     const first=new Date(at(start)).getUTCDay(),days=Math.round((at(nextMonth(start))-at(start))/86_400_000);
     const weeks=Math.ceil((first+days)/7);
     return <div className="fare-calendar-month" key={start}>
      <h3>{monthName.format(at(start))}</h3>
      <div role="grid" aria-label={monthName.format(at(start))} aria-colcount={7}>
       <div className="fare-calendar-weekdays" role="row">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(day=><span role="columnheader" key={day}>{day}</span>)}</div>
       {Array.from({length:weeks},(_,week)=><div className="fare-calendar-days" role="row" key={week}>
       {Array.from({length:7},(_,column)=>{
        const index=week*7+column-first;
        if(index<0||index>=days)return <span key={column} aria-hidden="true"/>;
        const date=shift(start,index),price=fares?.[date],enabled=allowed(date);
        const inRange=rangeStart&&value&&date>rangeStart&&date<value;
        return <button type="button" role="gridcell" aria-colindex={column+1} key={date} data-date={date} disabled={!enabled} tabIndex={date===focus?0:-1}
         aria-selected={date===value} aria-label={`${fullDate.format(at(date))}${price?`, indicative fare from ₹${Math.round(price.minor/100).toLocaleString('en-IN')} per adult${price.band==='low'?', one of the lowest fares':''}`:''}`}
         className={[date===value?'is-selected':'',date===rangeStart?'is-range-start':'',inRange?'is-in-range':''].filter(Boolean).join(' ')||undefined}
         onClick={()=>pick(date)} onFocus={()=>setFocus(date)}>
         <span>{Number(date.slice(8))}</span>
         {enabled&&price&&<small className={`fare-band-${price.band}`}>{compactRupees(price.minor)}</small>}
        </button>;
       })}</div>)}
      </div>
     </div>;
    })}
   </div>
   {fares&&<p className="fare-calendar-note">{hasFares?<><i className="fare-band-low"/>Indicative one-way fares for 1 adult in ₹. Search for current availability.</>:'Search a date to check current fares.'}</p>}
  </SearchPickerDialog>}
 </div>;
}
