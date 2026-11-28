'use client';

import {useRef, useState, type ReactNode} from 'react';
import {formatBookingDate, normalizeBookingDate} from '@/lib/travel-date';
import FareDatePicker from './fare-date-picker';

const shortDate = new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const narrowDate = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});

export default function BookingDateInput({name,label,caption=label,initial='',min,onDateChange,compact=false,previousDate,nextDate}: {
  name:string;label:string;caption?:string;initial?:string;min:string;onDateChange?:(date:string)=>void;
  compact?:boolean;previousDate?:ReactNode;nextDate?:ReactNode;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [text,setText] = useState(() => formatBookingDate(initial));
  const date = normalizeBookingDate(text);
  const dateTimestamp = date ? Date.parse(`${date}T00:00:00Z`) : null;
  const calendar = <FareDatePicker iconOnly label={`${label} calendar`} value={date>=min?date:''} min={min} onChange={value=>{
    setText(formatBookingDate(value));
    field.current?.setCustomValidity('');
    onDateChange?.(value);
  }}/>;

  return <div className={`booking-date-input${compact?' booking-date-compact':''}${previousDate || nextDate?' booking-date-adjacent':''}`}>
    {compact&&calendar}
    {previousDate}
    <label>{caption}
      <input ref={field} aria-label={caption===label?undefined:label} name={name} value={text} inputMode="numeric" autoComplete="off" placeholder="DD/MM/YYYY" maxLength={10} required
        onChange={event=>{
          const input = event.currentTarget;
          const value = input.value;
          const digits = value.replaceAll('/', '');
          const display = /^[\d/]+$/.test(value) ? [digits.slice(0,2),digits.slice(2,4),digits.slice(4,8)].filter(Boolean).join('/') : formatBookingDate(value);
          const parsed = normalizeBookingDate(display);
          input.setCustomValidity(display && (!parsed || parsed < min) ? 'Enter a valid travel date (DD/MM/YYYY) from today onwards.' : '');
          setText(display);
          onDateChange?.(parsed);
        }}/>
      {compact&&dateTimestamp!==null&&<span className="booking-date-readable" aria-hidden="true">
        <span className="booking-date-wide">{shortDate.format(dateTimestamp)}</span>
        <span className="booking-date-narrow">{narrowDate.format(dateTimestamp)}</span>
      </span>}
    </label>
    {nextDate}
    {!compact&&calendar}
  </div>;
}
