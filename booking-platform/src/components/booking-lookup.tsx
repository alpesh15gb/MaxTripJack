'use client';

import Link from 'next/link';
import {useState, type FormEvent} from 'react';
import {accountHref} from '@/lib/account-return';

type Match = {id: string; reference: string};

export default function BookingLookup({emailVerified, initiallyOpen, guest=false}: {emailVerified: boolean; initiallyOpen: boolean; guest?: boolean}) {
  const [pending,setPending] = useState(false);
  const [matches,setMatches] = useState<Match[]>([]);
  const [status,setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const value = String(new FormData(event.currentTarget).get('pnr') ?? '').trim();
    const lookup = guest && /^MT-/i.test(value) ? {reference:value} : {pnr:value};
    setPending(true);
    setMatches([]);
    setStatus('');
    try {
      const response = await fetch('/api/bookings/lookup', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lookup), signal:AbortSignal.timeout(15000)});
      const data = await response.json();
      if (!response.ok) throw Error(guest&&response.status===401 ? 'Use the browser you booked in, or sign in with your booking email.' : data.error || 'We couldn’t check the booking. Try again.');
      setMatches(data.matches);
      setStatus(data.matches.length ? 'Select a matching booking.' : data.incomplete ? 'Some bookings could not be checked. Contact the travel desk for help.' : guest ? 'No booking matched in this browser. Check the reference or sign in with the email on your booking.' : 'No flight with that PNR was found in this account. Check the code and the email on your booking.');
    } catch (error) {
      setStatus(error instanceof Error && error.name === 'Error' ? error.message : 'The lookup took too long. Try again.');
    } finally { setPending(false); }
  }

  return <details className="booking-pnr-lookup" open={initiallyOpen || undefined}>
    <summary>{guest?'Find a guest booking':'Find a flight by PNR'}</summary>
    {guest && <p>Find a guest booking in the browser you used to book it. Using a different browser or device? <Link href={accountHref('/my-trips')}>Sign in with the email on your booking</Link> to see your trips there.</p>}
    {emailVerified || guest ? <form onSubmit={submit}>
      <label>{guest?'Booking reference or airline PNR':'Airline PNR'}<input name="pnr" required autoCapitalize="characters" autoComplete="off" pattern={guest?'(?:[A-Za-z0-9]{4,12}|[Mm][Tt]\\x2D[0-9a-fA-F]{8})':'[A-Za-z0-9]{4,12}'} maxLength={12}/></label>
      <button type="submit" className="primary" disabled={pending}>{pending ? 'Finding booking…' : guest?'Find booking':'Find flight'}</button>
    </form> : <p><Link href={accountHref('/my-trips?lookup=flight')}>Verify the email address on your booking</Link> to look up a flight.</p>}
    <p role="status">{status}</p>
    {matches.length>0&&<ul>{matches.map(match=><li key={match.id}><Link href={`/my-trips/${match.id}`}>Open booking {match.reference}</Link></li>)}</ul>}
  </details>;
}
