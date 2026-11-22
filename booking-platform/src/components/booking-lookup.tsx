'use client';

import Link from 'next/link';
import {useState, type FormEvent} from 'react';
import {accountHref} from '@/lib/account-return';

type Match = {id: string; reference: string};

export default function BookingLookup({emailVerified, initiallyOpen}: {emailVerified: boolean; initiallyOpen: boolean}) {
  const [pending,setPending] = useState(false);
  const [matches,setMatches] = useState<Match[]>([]);
  const [status,setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const pnr = String(new FormData(event.currentTarget).get('pnr') ?? '').trim();
    setPending(true);
    setMatches([]);
    setStatus('');
    try {
      const response = await fetch('/api/bookings/lookup', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pnr}), signal:AbortSignal.timeout(15000)});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'We couldn’t check the booking. Try again.');
      setMatches(data.matches);
      setStatus(data.matches.length ? 'Select a matching booking.' : data.incomplete ? 'Some bookings could not be checked. Contact the travel desk for help.' : 'No flight with that PNR was found in this account. Check the code and the email on your booking.');
    } catch (error) {
      setStatus(error instanceof Error && error.name === 'Error' ? error.message : 'The lookup took too long. Try again.');
    } finally { setPending(false); }
  }

  return <details className="booking-pnr-lookup" open={initiallyOpen || undefined}>
    <summary>Find a flight by PNR</summary>
    {emailVerified ? <form onSubmit={submit}>
      <label>Airline PNR<input name="pnr" required autoCapitalize="characters" autoComplete="off" pattern="[A-Za-z0-9]{4,12}" maxLength={12}/></label>
      <button type="submit" className="primary" disabled={pending}>{pending ? 'Finding flight…' : 'Find flight'}</button>
    </form> : <p><Link href={accountHref('/my-trips?lookup=flight')}>Verify the email address on your booking</Link> to look up a flight.</p>}
    <p role="status">{status}</p>
    {matches.length>0&&<ul>{matches.map(match=><li key={match.id}><Link href={`/my-trips/${match.id}`}>Open booking {match.reference}</Link></li>)}</ul>}
  </details>;
}
