'use client';

import {useRef, useState} from 'react';
import {formatBookingDate, normalizeBookingDate} from '@/lib/travel-date';
import FareDatePicker from './fare-date-picker';

export default function BookingDateInput({name,label,initial='',min,onDateChange}: {name:string;label:string;initial?:string;min:string;onDateChange?:(date:string)=>void}) {
  const field = useRef<HTMLInputElement>(null);
  const [text,setText] = useState(() => formatBookingDate(initial));
  const date = normalizeBookingDate(text);

  return <div className="booking-date-input">
    <label>{label}
      <input ref={field} name={name} value={text} inputMode="numeric" autoComplete="off" placeholder="DD/MM/YYYY" maxLength={10} required
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
    </label>
    <FareDatePicker iconOnly label={`${label} calendar`} value={date>=min?date:''} min={min} onChange={value=>{
      setText(formatBookingDate(value));
      field.current?.setCustomValidity('');
      onDateChange?.(value);
    }}/>
  </div>;
}
