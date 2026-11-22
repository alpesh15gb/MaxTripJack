'use client';

import {useRef, useState, type FormEvent} from 'react';
import {enquiryServiceLabels, enquirySubmitSchema, type EnquirySubmission, type OfficeEnquiryService} from '@/lib/travel-enquiry-contract';
import '@/app/enquiry-experience.css';

export default function OfficeEnquiryForm({service}: {service: OfficeEnquiryService}) {
  const active = useRef(false);
  const [pending,setPending] = useState(false);
  const [retry,setRetry] = useState<EnquirySubmission | null>(null);
  const [error,setError] = useState('');
  const [reference,setReference] = useState('');
  const bus = service === 'BUS';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const input = enquirySubmitSchema.safeParse(retry ?? {requestId:crypto.randomUUID(),draft:{service,subject:value('subject'),message:value('message')},
      contact:{name:value('name'),email:value('email'),phone:value('phone')||undefined,preferredChannel:'EMAIL'},consent:data.has('consent')});
    if (!input.success) {setError(input.error.issues[0]?.message || 'Check the details and try again.'); return;}
    active.current = true;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/travel/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input.data),signal:AbortSignal.timeout(15000)});
      const result = await response.json();
      if (response.ok && /^ME-[A-F0-9]{12}$/.test(result.enquiry?.reference)) {
        setReference(result.enquiry.reference);
        setRetry(null);
      } else if (response.status >= 400 && response.status < 500 && response.status !== 409) {
        if (response.status === 400) setRetry(null);
        setError(result.error || 'Check the details and try again.');
      } else { throw Error('Delivery could not be verified'); }
    } catch {
      setRetry(input.data);
      setError('We couldn’t confirm receipt. Retry this same request to check without sending a duplicate.');
    } finally { active.current = false; setPending(false); }
  }

  return <section className="public-section office-enquiry" id="office-enquiry" aria-labelledby="office-enquiry-title">
    <h2 id="office-enquiry-title">{enquiryServiceLabels[service]}</h2>
    {reference ? <p role="status">Enquiry received. Your reference is <strong>{reference}</strong>. The travel desk will reply by email.</p> : <form onSubmit={submit}>
      <fieldset disabled={pending||Boolean(retry)}>
        <label>{bus?'Pickup and destination':'Company name'}<input name="subject" required minLength={2} maxLength={140} placeholder={bus?'Hyderabad to Srisailam':undefined}/></label>
        <label>{bus?'Trip date, group size and requirements':'How would you like to work with us?'}<textarea name="message" required minLength={10} maxLength={1500} rows={4}/></label>
        <label>Your name<input name="name" required autoComplete="name" minLength={2} maxLength={120}/></label>
        <label>Email<input type="email" name="email" required autoComplete="email" maxLength={254}/></label>
        <label>Phone (optional)<input type="tel" name="phone" autoComplete="tel" maxLength={40}/></label>
        <label className="office-enquiry-consent"><input name="consent" type="checkbox" required/> I agree that MaxTravel can contact me about this enquiry.</label>
      </fieldset>
      {error&&<p role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={pending}>{pending?'Checking receipt…':retry?'Retry this enquiry':'Send enquiry'}</button>
    </form>}
  </section>;
}
