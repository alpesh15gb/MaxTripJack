'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {accountHref} from '@/lib/account-return';

type Match = {id: string; reference: string};
const bookingId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function isMatch(value: unknown): value is Match {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Match>;
  return typeof row.id === 'string' && bookingId.test(row.id) &&
    typeof row.reference === 'string' && row.reference.trim().length > 0;
}

export default function BookingLookup({emailVerified, initiallyOpen, guest=false}: {emailVerified: boolean; initiallyOpen: boolean; guest?: boolean}) {
  const [pending,setPending] = useState(false);
  const [matches,setMatches] = useState<Match[]>([]);
  const [status,setStatus] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const value = String(new FormData(event.currentTarget).get('pnr') ?? '').trim();
    const lookup = guest && /^MT-/i.test(value) ? {reference:value} : {pnr:value};
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setMatches([]);
    setStatus('');
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      const response = await fetch('/api/bookings/lookup', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lookup), signal});
      const data = await response.json().catch(()=>null);
      if (controller.signal.aborted) return;
      if (!response.ok) throw Error(guest&&response.status===401 ? 'Use the browser you booked in, or sign in with your booking email.' : typeof data?.error==='string' ? data.error : 'We couldn’t check the booking. Try again.');
      if (!Array.isArray(data?.matches)||!data.matches.every(isMatch)||typeof data.incomplete!=='boolean')
        throw Error('The lookup response was incomplete. Try again.');
      setMatches(data.matches);
      setStatus(data.matches.length ? 'Select a matching booking.' : data.incomplete ? 'Some bookings could not be checked. Contact the travel desk for help.' : guest ? 'No booking matched in this browser. Check the reference or sign in with the email on your booking.' : 'No flight with that PNR was found in this account. Check the code and the email on your booking.');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error&&error.name==='TimeoutError' ? 'The lookup took too long. Try again.' : error instanceof Error&&error.name==='Error' ? error.message : 'We couldn’t check the booking. Try again.');
    } finally {
      if(request.current===controller)request.current=null;
      if(!controller.signal.aborted)setPending(false);
    }
  }

  return <details className="booking-pnr-lookup" open={initiallyOpen || undefined}>
    <summary>{guest?'Find a guest booking':'Find a flight by PNR'}</summary>
    {guest && <p>Find a guest booking in the browser you used to book it. Using a different browser or device? <Link href={accountHref('/my-trips')}>Sign in with the email on your booking</Link> to see your trips there.</p>}
    {emailVerified || guest ? <form onSubmit={submit}>
      <label>{guest?'Booking reference or airline PNR':'Airline PNR'}<input name="pnr" disabled={pending} onChange={()=>{setMatches([]);setStatus('');}} required autoCapitalize="characters" autoComplete="off" pattern={guest?'(?:[A-Za-z0-9]{4,12}|[Mm][Tt]\\x2D[0-9a-fA-F]{8})':'[A-Za-z0-9]{4,12}'} maxLength={12}/></label>
      <button type="submit" className="primary" disabled={pending}>{pending ? 'Finding booking…' : guest?'Find booking':'Find flight'}</button>
    </form> : <p><Link href={accountHref('/my-trips?lookup=flight')}>Verify the email address on your booking</Link> to look up a flight.</p>}
    <p role="status">{status}</p>
    {matches.length>0&&<ul>{matches.map(match=><li key={match.id}><Link href={`/my-trips/${match.id}`}>Open booking {match.reference}</Link></li>)}</ul>}
  </details>;
}
