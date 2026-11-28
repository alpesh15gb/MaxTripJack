'use client';

import Link from 'next/link';
import {useEffect, useId, useRef, useState} from 'react';
import {accountHref} from '@/lib/account-return';
import {authClient} from '@/lib/auth-client';
import {customerEmail} from '@/lib/customer-identity';
import CheckoutVerification from './checkout-verification';
import {TravelIcon} from './travel-icon';
import './booking-lookup.css';

type Match = {id: string; reference: string};
const bookingId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function isMatch(value: unknown): value is Match {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Match>;
  return typeof row.id === 'string' && bookingId.test(row.id) &&
    typeof row.reference === 'string' && row.reference.trim().length > 0;
}

export default function BookingLookup({emailVerified, initiallyOpen, guest=false, compact=false, onVerificationActive}: {
  emailVerified: boolean; initiallyOpen: boolean; guest?: boolean; compact?: boolean; onVerificationActive?: (active: boolean) => void;
}) {
  const id = useId();
  const {data: session, error: sessionError, isPending: sessionPending, isRefetching: sessionRefetching} = authClient.useSession();
  const [pending,setPending] = useState(false);
  const [matches,setMatches] = useState<Match[]>([]);
  const [status,setStatus] = useState('');
  const [lookupEmail,setLookupEmail] = useState('');
  const [reference,setReference] = useState('');
  const [bookingEmail,setBookingEmail] = useState('');
  const [verification,setVerification] = useState<{reference: string; email: string} | null>(null);
  const verifier = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const sessionEmail = session?.user.emailVerified ? customerEmail(session.user).toLowerCase() : '';
  const resultVisible = !lookupEmail || sessionEmail === lookupEmail && !sessionPending && !sessionRefetching && !sessionError;
  useEffect(()=>()=>request.current?.abort(),[]);

  useEffect(() => {
    const dialog = verifier.current;
    if (!verification || !dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [verification]);

  function closeVerification(verified = false) {
    setVerification(null);
    if (!verified) onVerificationActive?.(false);
    requestAnimationFrame(() => opener.current?.focus());
  }

  async function submit(data: FormData) {
    const value = String(data.get('pnr') ?? '').trim();
    const email = String(data.get('bookingEmail') ?? '').trim();
    if (guest && compact && email && (email.toLowerCase() !== sessionEmail || sessionPending || sessionRefetching || sessionError)) {
      setMatches([]);
      setStatus('');
      onVerificationActive?.(true);
      setVerification({reference:value, email});
      return;
    }
    await findBooking(value);
  }

  async function findBooking(value: string, verifiedEmail = '') {
    if (request.current) return;
    const lookup = /^MT-/i.test(value) ? {reference:value} : {pnr:value};
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setLookupEmail(verifiedEmail.toLowerCase() || sessionEmail);
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
      setStatus(data.matches.length ? 'Select a matching booking.' : data.incomplete ? 'Some bookings could not be checked. Contact the travel desk for help.' : guest && !verifiedEmail && !sessionEmail ? 'No booking matched in this browser. Check the reference or sign in with the email on your booking.' : 'No matching booking was found in this account. Check the reference and booking email.');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error&&error.name==='TimeoutError' ? 'The lookup took too long. Try again.' : error instanceof Error&&error.name==='Error' ? error.message : 'We couldn’t check the booking. Try again.');
    } finally {
      if(request.current===controller)request.current=null;
      if(!controller.signal.aborted)setPending(false);
    }
  }

  const content = <>
    {guest && !compact && <p>Find a guest booking in the browser you used to book it. Using a different browser or device? <Link href={accountHref('/my-trips')}>Sign in with the email on your booking</Link> to see your trips there.</p>}
    {emailVerified || guest ? <form action={submit}>
      <label>Booking reference or airline PNR<input name="pnr" value={reference} placeholder={compact?'e.g. ABC123':'e.g. MT-1234ABCD'} disabled={pending} onChange={event=>{setReference(event.target.value);setMatches([]);setStatus('');}} required autoCapitalize="characters" autoComplete="off" pattern={'(?:[A-Za-z0-9]{4,12}|[Mm][Tt]\\x2D[0-9a-fA-F]{8})'} maxLength={12}/></label>
      {guest && compact && <div className="booking-lookup-email"><label>Booking email (optional)<input name="bookingEmail" type="email" value={bookingEmail} autoComplete="email" maxLength={254} disabled={pending} aria-describedby={`${id}-email-hint`} placeholder="you@example.com" onChange={event=>{setBookingEmail(event.target.value);setMatches([]);setStatus('');}}/></label>
        <small id={`${id}-email-hint`}>Use this to verify your email if you booked on another device.</small>
      </div>}
      <button ref={opener} type="submit" className="primary" disabled={pending}>{pending ? 'Finding booking…' : compact ? 'Find my trip' : 'Find booking'}</button>
    </form> : <p><Link href={accountHref('/my-trips?lookup=flight')}>Sign in with your verified booking email</Link> to look up a booking.</p>}
    <p role="status">{resultVisible ? status : ''}</p>
    {resultVisible&&matches.length>0&&<ul>{matches.map(match=><li key={match.id}><Link href={`/my-trips/${match.id}`}>Open booking {match.reference}</Link></li>)}</ul>}
    {verification && <dialog ref={verifier} className="booking-lookup-verification" aria-labelledby={`${id}-verify`} onCancel={event=>{event.preventDefault();closeVerification();}}>
      <header><h2 id={`${id}-verify`}>Verify your booking email</h2><button type="button" aria-label="Close email verification" onClick={()=>closeVerification()}>×</button></header>
      <CheckoutVerification emailOnly initialEmail={verification.email} onVerified={async contact=>{
        setBookingEmail(contact.email);
        closeVerification(true);
        await findBooking(verification.reference, contact.email);
      }}/>
    </dialog>}
  </>;
  if (compact) return <div className="support-compact-lookup">{content}</div>;
  return <details className="booking-pnr-lookup" open={initiallyOpen || undefined}>
    <summary><TravelIcon name="search" size={18}/>{guest?'Find a guest booking':'Find a booking'}<TravelIcon name="chevron" size={16}/></summary>
    {content}
  </details>;
}
