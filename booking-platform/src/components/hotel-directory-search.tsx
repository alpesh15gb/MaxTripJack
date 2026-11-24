'use client';

import {useState,type FormEvent} from 'react';
import HotelDestination from './hotel-destination';
import {indiaToday} from '@/lib/booking-presentation';

export default function HotelDirectorySearch({query}: {query:string}) {
  const [arrival,setArrival]=useState('');
  const [resolving,setResolving]=useState(false);
  const [message,setMessage]=useState('');
  const today=indiaToday();
  const nextDay=arrival ? new Date(Date.parse(arrival+'T00:00:00Z')+86_400_000).toISOString().slice(0,10) : today;

  function submit(event: FormEvent<HTMLFormElement>) {
    const fields=new FormData(event.currentTarget);
    if (fields.get('hotelIds') || (fields.get('regionId') && fields.get('destinationCursor'))) return;
    event.preventDefault();
    setMessage('Choose an available destination from the suggestions.');
    event.currentTarget.querySelector<HTMLInputElement>('input[name="city"]')?.focus();
  }

  return <form action="/book" method="get" className="catalogue-live-search" onSubmit={submit} aria-label="Check room availability">
    <input type="hidden" name="product" value="HOTEL"/>
    <input type="hidden" name="autoSearch" value="1"/>
    <HotelDestination initialQuery={query} onResolvingChange={setResolving}/>
    <label>Check-in<input name="date" type="date" min={today} required value={arrival} onChange={event=>setArrival(event.target.value)}/></label>
    <label>Check-out<input name="end" type="date" min={nextDay} required/></label>
    <label>Adults<select name="adults" defaultValue="2">{[1,2,3,4].map(count=><option key={count} value={count}>{count}</option>)}</select></label>
    <button className="catalogue-button" type="submit" disabled={resolving}>Search stays</button>
    <p className="catalogue-live-search-note">{message ? <span role="alert">{message}</span> : <>One room · <a href="/book?product=HOTEL">More rooms, children or another nationality</a></>}</p>
  </form>;
}
