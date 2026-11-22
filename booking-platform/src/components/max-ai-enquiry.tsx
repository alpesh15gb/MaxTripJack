'use client';

import Link from 'next/link';
import {useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent} from 'react';
import {authClient} from '@/lib/auth-client';
import {customerEmail} from '@/lib/customer-identity';
import {indiaToday} from '@/lib/booking-presentation';
import {enquiryDateError, enquiryServiceLabels, itineraryEnquirySubmitSchema, enquirySummary, type EnquiryDraft, type EnquiryReceipt, type ItineraryEnquirySubmission} from '@/lib/travel-enquiry-contract';
import '@/app/enquiry-experience.css';

function receipt(value: unknown): EnquiryReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as EnquiryReceipt;
  return typeof item.id === 'string' && typeof item.reference === 'string' && item.reference.length > 0 && item.reference.length <= 60 &&
    ['VISA', 'INSURANCE', 'HOLIDAY', 'CRUISE'].includes(item.service) && ['NEW', 'CONTACTED', 'QUOTED', 'CLOSED'].includes(item.status) &&
    typeof item.createdAt === 'string' && ['PENDING', 'DELIVERED', 'ACTION_REQUIRED', 'NOT_CONFIGURED', 'LEGACY_DELIVERY', 'DESTINATION_REVIEW'].includes(item.crmStatus) ? item : null;
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > 24_000) throw Error('The response could not be checked.');
  let data: unknown;
  try {data = JSON.parse(text);} catch {throw Error('The response could not be checked.');}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('The response could not be checked.');
  return data as Record<string, unknown>;
}

function ageList(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text.split(',').map(age => /^\d{1,3}$/.test(age.trim()) ? Number(age.trim()) : NaN);
}

/** Contact and consent go directly to the application, never into a model turn. */
export default function MaxAiEnquiry({draft, superseded = false}: {draft: EnquiryDraft; superseded?: boolean}) {
  const [expanded, setExpanded] = useState(false);
  const [channel, setChannel] = useState('EMAIL');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<EnquiryReceipt | null>(null);
  const [savedDestination, setSavedDestination] = useState('');
  const [status, setStatus] = useState('');
  const submitted = useRef<ItineraryEnquirySubmission | null>(null);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const {data: session} = authClient.useSession();
  const label = enquiryServiceLabels[draft.service];
  const locked = busy || uncertain;
  const labels: Record<string, string> = {
    destination: draft.service === 'VISA' ? 'Destination country' : draft.service === 'CRUISE' ? 'Cruise destination or departure port' : 'Destination',
    travelWindow: 'When would you like to travel?', adults: 'Adults · age 18+', childAges: 'Children’s ages', nationality: 'Passport nationality', purpose: 'Purpose of travel',
    travellerAges: 'Every traveller’s age', departureCity: `Departure city${draft.service === 'HOLIDAY' ? '' : ' (optional)'}`,
    travelStart: 'Start date (optional)', travelEnd: 'End date (optional)', durationNights: 'Number of nights (optional)', budgetRupees: 'Budget in INR (optional)', budgetBasis: 'Budget applies to',
    countryOfResidence: 'Country of residence (optional)', cabinPreference: 'Cabin preference (optional)', notes: 'Other travel preferences (optional)',
    name: 'Your name', preferredChannel: 'Preferred reply method', email: `Email${channel === 'EMAIL' ? '' : ' (optional)'}`, phone: `Phone or WhatsApp number${channel === 'EMAIL' ? ' (optional)' : ''}`,
    consent: 'I confirm these details and agree that MaxTravel may contact me about this enquiry.',
  };

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {if (saved) resultHeading.current?.focus({preventScroll: true});}, [saved]);
  // Focus the newly committed form before it paints. A deferred animation frame
  // can steal focus after the customer has already moved to another field.
  useLayoutEffect(() => {if (expanded) form.current?.querySelector('input')?.focus();}, [expanded]);
  useLayoutEffect(() => {
    const name = Object.keys(fieldErrors)[0];
    if (!name) return;
    const input = form.current?.elements.namedItem(name);
    if (input instanceof HTMLElement) {input.closest('details')?.setAttribute('open', ''); input.focus();}
  }, [fieldErrors]);

  function failFields(errors: Record<string, string>) {
    setFieldErrors(errors);
    setError('Check the highlighted details before sending your enquiry.');
  }

  async function submit(payload: ItineraryEnquirySubmission, checkOnly = false) {
    if (inFlight.current) return;
    const current = new AbortController();
    controller.current = current; inFlight.current = true;
    setBusy(true); setError(''); setStatus(checkOnly ? 'Checking whether your enquiry was saved…' : 'Saving your enquiry…');
    try {
      const response = await fetch(checkOnly ? `/api/travel/enquiries?requestId=${encodeURIComponent(payload.requestId)}` : '/api/travel/enquiries', {
        method: checkOnly ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        ...(checkOnly ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}),
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(20_000)]),
      });
      const data = await responseBody(response);
      if (current.signal.aborted) return;
      if (!response.ok) {
        const message = typeof data.error === 'string' ? data.error.slice(0, 500) : 'We could not save the enquiry.';
        // A validation/rate-limit rejection is definite. Network/server failures
        // retain this same request and payload so a retry cannot create another lead.
        if (!checkOnly && !uncertain && response.status >= 400 && response.status < 500 && response.status !== 409) {
          submitted.current = null; setUncertain(false); setError(message); setStatus(''); return;
        }
        throw Error(message);
      }
      const result = receipt(data.enquiry);
      if (checkOnly && data.enquiry === null) {
        setUncertain(true); setStatus('No saved result is available yet. Retry the same enquiry safely, or check again.'); return;
      }
      if (!result || result.service !== payload.draft.service) throw Error('The saved result could not be verified.');
      setSavedDestination(payload.draft.destination); setSaved(result); setUncertain(false); setStatus(''); submitted.current = null;
    } catch (cause) {
      if (current.signal.aborted) return;
      setUncertain(true); setStatus('');
      setError(cause instanceof Error && !['AbortError', 'TimeoutError'].includes(cause.name) ? cause.message : 'The connection took too long.');
    } finally {
      inFlight.current = false;
      if (!current.signal.aborted) setBusy(false);
    }
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || inFlight.current || superseded) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const optional = (name: string) => text(name) || undefined;
    const number = (name: string) => text(name) ? Number(text(name)) : undefined;
    const edited: Record<string, unknown> = {...draft, destination: text('destination'), travelWindow: text('travelWindow'), adults: Number(text('adults')), childAges: ageList(data.get('childAges'))};
    // Preserve any valid supplied optional field that this form does not render.
    // An explicitly cleared rendered field is deliberately removed.
    for (const name of ['departureCity', 'travelStart', 'travelEnd', 'nationality', 'countryOfResidence', 'purpose', 'cabinPreference', 'notes']) if (data.has(name)) edited[name] = optional(name);
    for (const name of ['durationNights', 'budgetRupees']) if (data.has(name)) edited[name] = number(name);
    if (data.has('travellerAges')) edited.travellerAges = text('travellerAges') ? ageList(data.get('travellerAges')) : undefined;
    if (data.has('budgetRupees')) edited.budgetBasis = text('budgetRupees') ? text('budgetBasis') : undefined;
    const parsed = itineraryEnquirySubmitSchema.safeParse({
      requestId: crypto.randomUUID(),
      draft: edited,
      contact: {name: text('name'), email: optional('email'), phone: optional('phone'), preferredChannel: channel},
      consent: data.get('consent') === 'on',
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {const field = String(issue.path[0] === 'draft' || issue.path[0] === 'contact' ? issue.path[1] : issue.path[0] ?? 'destination'); if (!errors[field]) errors[field] = field === 'consent' ? 'Confirm the details and contact permission before submitting.' : issue.message;}
      failFields(errors); return;
    }
    const dateError = enquiryDateError(parsed.data.draft, indiaToday());
    if (dateError) {failFields({travelStart: dateError}); return;}
    submitted.current = parsed.data; setFieldErrors({}); void submit(parsed.data);
  }

  function hint(name: string) {return fieldErrors[name] ? <small id={`${id}-${name}-error`} className="enquiry-field-error">{fieldErrors[name]}</small> : null;}
  function field(name: string) {
    const description = [...(['travelWindow', 'childAges', 'travellerAges', 'notes', 'phone'].includes(name) ? [`${id}-${name}-hint`] : []), ...(fieldErrors[name] ? [`${id}-${name}-error`] : [])].join(' ');
    return {name, id: `${id}-${name}`, 'aria-label': labels[name], 'aria-invalid': Boolean(fieldErrors[name]), 'aria-describedby': description || undefined};
  }

  if (saved) return <section className="enquiry-receipt" aria-label="Enquiry saved">
    <span className="enquiry-kicker">SAVED WITH MAXTRAVEL</span>
    <h3 ref={resultHeading} tabIndex={-1}>Your enquiry is ready for our team</h3>
    <p>{label} · {savedDestination}</p>
    <div className="enquiry-reference"><span>Enquiry reference</span><strong>{saved.reference}</strong></div>
    <p>Our team will review your request during office hours and use your chosen contact method. Keep this reference if you contact us.</p>
    <p className="enquiry-small">This is an enquiry, not a booking, issued policy, visa approval or confirmed quote. No payment has been taken.</p>
    <Link href="/contact" target="_blank" rel="noopener noreferrer">Contact MaxTravel</Link>
  </section>;

  if (superseded && !uncertain && !busy) return <section className="enquiry-review enquiry-review--superseded" aria-label={`Earlier ${label.toLowerCase()} enquiry`}>
    <span className="enquiry-kicker">UPDATED ENQUIRY BELOW</span><h3>{label}</h3><p>Your newer enquiry details replace this unsent draft. Review the updated version below before submitting.</p>
  </section>;

  return <section className="enquiry-review" aria-label={`Review ${label.toLowerCase()} enquiry`} aria-live="off">
    <span className="enquiry-kicker">{uncertain ? 'SAVE STATUS UNCONFIRMED' : busy ? 'SAVING YOUR ENQUIRY' : 'PREPARED FOR YOU · NOT SENT'}</span>
    <h3>{label} enquiry</h3>
    {superseded && <p>This earlier request may already be saved. Check its outcome below before submitting your updated plan.</p>}
    {!expanded ? <>
      <ul className="enquiry-summary">{enquirySummary(draft).map((line, index) => <li key={index}>{line}</li>)}</ul>
      <p>Review the details and choose how our team can reach you. Nothing is submitted until you confirm.</p>
      <button type="button" className="enquiry-primary" onClick={() => setExpanded(true)}>Review &amp; send enquiry</button>
    </> : <form ref={form} onSubmit={prepare} noValidate aria-label="Submit travel enquiry">
      <fieldset disabled={locked}>
        <legend>Your travel details</legend>
        <div className="enquiry-fields">
          <label htmlFor={`${id}-destination`}>{draft.service === 'VISA' ? 'Destination country' : draft.service === 'CRUISE' ? 'Cruise destination or departure port' : 'Destination'}<input {...field('destination')} maxLength={150} required defaultValue={draft.destination}/>{hint('destination')}</label>
          <label htmlFor={`${id}-travelWindow`}>When would you like to travel?<input {...field('travelWindow')} maxLength={120} required defaultValue={draft.travelWindow}/><small id={`${id}-travelWindow-hint`}>Exact dates, a month, or your flexibility.</small>{hint('travelWindow')}</label>
          <div className="enquiry-pair"><label htmlFor={`${id}-adults`}>Adults · age 18+<input {...field('adults')} type="number" min="0" max="50" required defaultValue={draft.adults}/>{hint('adults')}</label><label htmlFor={`${id}-childAges`}>Children’s ages<input {...field('childAges')} maxLength={80} inputMode="text" placeholder="For example: 6, 10" defaultValue={draft.childAges.join(', ')}/><small id={`${id}-childAges-hint`}>Leave blank if there are no children.</small>{hint('childAges')}</label></div>
          {(draft.service === 'VISA' || draft.nationality) && <label htmlFor={`${id}-nationality`}>Passport nationality<input {...field('nationality')} maxLength={80} required={draft.service === 'VISA'} defaultValue={draft.nationality}/>{hint('nationality')}</label>}
          {(draft.service === 'VISA' || draft.purpose) && <label htmlFor={`${id}-purpose`}>Purpose of travel<input {...field('purpose')} maxLength={120} required={draft.service === 'VISA'} defaultValue={draft.purpose}/>{hint('purpose')}</label>}
          {(draft.service === 'INSURANCE' || draft.travellerAges) && <label htmlFor={`${id}-travellerAges`}>Every traveller’s age<input {...field('travellerAges')} maxLength={280} required={draft.service === 'INSURANCE'} defaultValue={draft.travellerAges?.join(', ')} placeholder="For example: 35, 32, 6"/><small id={`${id}-travellerAges-hint`}>Include all adults and children. Do not enter medical details.</small>{hint('travellerAges')}</label>}
          <label htmlFor={`${id}-departureCity`}>Departure city{draft.service === 'HOLIDAY' ? '' : ' (optional)'}<input {...field('departureCity')} maxLength={120} required={draft.service === 'HOLIDAY'} defaultValue={draft.departureCity}/>{hint('departureCity')}</label>
        </div>
        <details className="enquiry-optional"><summary>Dates, budget and other preferences</summary><div className="enquiry-fields">
          <div className="enquiry-pair"><label htmlFor={`${id}-travelStart`}>Start date (optional)<input {...field('travelStart')} type="date" defaultValue={draft.travelStart}/>{hint('travelStart')}</label><label htmlFor={`${id}-travelEnd`}>End date (optional)<input {...field('travelEnd')} type="date" defaultValue={draft.travelEnd}/>{hint('travelEnd')}</label></div>
          <label htmlFor={`${id}-durationNights`}>Number of nights (optional)<input {...field('durationNights')} type="number" min="1" max="365" defaultValue={draft.durationNights}/>{hint('durationNights')}</label>
          <div className="enquiry-pair"><label htmlFor={`${id}-budgetRupees`}>Budget in INR (optional)<input {...field('budgetRupees')} type="number" min="1" max="100000000" step="0.01" defaultValue={draft.budgetRupees}/>{hint('budgetRupees')}</label><label htmlFor={`${id}-budgetBasis`}>Budget applies to<select {...field('budgetBasis')} defaultValue={draft.budgetBasis ?? 'TOTAL'}><option value="TOTAL">All travellers</option><option value="PER_PERSON">Each person</option></select>{hint('budgetBasis')}</label></div>
          <label htmlFor={`${id}-countryOfResidence`}>Country of residence (optional)<input {...field('countryOfResidence')} maxLength={80} defaultValue={draft.countryOfResidence}/>{hint('countryOfResidence')}</label>
          {(draft.service === 'CRUISE' || draft.cabinPreference) && <label htmlFor={`${id}-cabinPreference`}>Cabin preference (optional)<input {...field('cabinPreference')} maxLength={120} defaultValue={draft.cabinPreference}/>{hint('cabinPreference')}</label>}
          <label htmlFor={`${id}-notes`}>Other travel preferences (optional)<textarea {...field('notes')} maxLength={800} rows={3} defaultValue={draft.notes}/><small id={`${id}-notes-hint`}>Keep passport numbers, medical information, passwords and payment details out of this enquiry.</small>{hint('notes')}</label>
        </div></details>
      </fieldset>
      <fieldset disabled={locked}><legend>How can we reach you?</legend><p className="enquiry-small">These contact details go directly to MaxTravel with your enquiry, not into the AI conversation. For a child’s enquiry, use a parent or guardian’s contact details.</p><div className="enquiry-fields">
        <label htmlFor={`${id}-name`}>Your name<input {...field('name')} autoComplete="name" maxLength={120} required defaultValue={session?.user.name ?? ''}/>{hint('name')}</label>
        <label htmlFor={`${id}-preferredChannel`}>Preferred reply method<select {...field('preferredChannel')} value={channel} onChange={event => setChannel(event.target.value)}><option value="EMAIL">Email</option><option value="PHONE">Phone call</option><option value="WHATSAPP">WhatsApp</option></select></label>
        <label htmlFor={`${id}-email`}>Email{channel === 'EMAIL' ? '' : ' (optional)'}<input {...field('email')} type="email" autoComplete="email" maxLength={254} required={channel === 'EMAIL'} defaultValue={session?.user ? customerEmail(session.user) : ''}/>{hint('email')}</label>
        <label htmlFor={`${id}-phone`}>Phone or WhatsApp number{channel === 'EMAIL' ? ' (optional)' : ''}<input {...field('phone')} type="tel" autoComplete="tel" maxLength={40} required={channel !== 'EMAIL'} placeholder="+91 98765 43210"/><small id={`${id}-phone-hint`}>Include the country code for numbers outside India.</small>{hint('phone')}</label>
        <label className="enquiry-consent" htmlFor={`${id}-consent`}><input {...field('consent')} type="checkbox" required/><span>I confirm these details and agree that MaxTravel may contact me about this enquiry.</span></label>{hint('consent')}
      </div></fieldset>
      <p className="enquiry-small">No booking or payment is made. Final availability, eligibility, prices and terms are checked by the team. <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy policy</Link></p>
      {error && <p className="enquiry-error" role="alert">{error}</p>}
      {status && <p role="status" className="enquiry-small">{status}</p>}
      {uncertain ? <div className="enquiry-recovery"><p>The save outcome is not confirmed. Your details are held unchanged so a retry uses the same enquiry request.</p><button type="button" disabled={busy} onClick={() => {if (submitted.current) void submit(submitted.current, true);}}>Check save status</button><button type="button" disabled={busy} onClick={() => {if (submitted.current) void submit(submitted.current);}}>Retry same enquiry</button></div>
        : <button className="enquiry-primary" disabled={busy} type="submit">{busy ? 'Saving enquiry…' : 'Submit enquiry'}</button>}
    </form>}
  </section>;
}
