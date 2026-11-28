'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';

export type TravelEnquiryPrefill = { subject: string; message: string };
const staticSubscription=()=>()=>{};

export default function SupportRequestForm({ emailHref, travel }: { emailHref: string; travel?: TravelEnquiryPrefill }) {
  const [draft, setDraft] = useState<{subject:string;body:string;href:string}|null>(null);
  const ready=useSyncExternalStore(staticSubscription,()=>true,()=>false);

  function prepareDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const value = (field: string) => String(fields.get(field) ?? '').trim();
    const body = [
      `Name: ${value('name')}`, `Email: ${value('email')}`,
      value('phone') && `Phone: ${value('phone')}`,
      value('booking') && `Trip confirmation: ${value('booking')}`,
      `\n${value('message')}`,
    ].filter(Boolean).join('\r\n');
    const subject = travel ? travel.subject : `MaxTravel support: ${value('subject')}`;
    setDraft({subject,body,href:`${emailHref}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`});
  }

  return <section className="help-panel help-request-form" aria-label={travel ? travel.subject : 'Support request form'}>
    <noscript><p><a href={emailHref}>Email our travel desk</a> to send your request.</p></noscript>
    <form hidden={!ready} inert={!ready} method="post" onSubmit={prepareDraft} onChange={() => setDraft(null)}>
      <label>Full name<input name="name" autoComplete="name" maxLength={100} required placeholder="As shown on your booking"/></label>
      <label>Email address<input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/></label>
      <label>Phone number (optional)<input type="tel" name="phone" autoComplete="tel" maxLength={32} placeholder="Include your country code"/></label>
      {!travel && <label>Trip confirmation (if booked)<input name="booking" autoCapitalize="characters" maxLength={32} placeholder="Booking reference or airline PNR"/></label>}
      {travel ? <p><strong>{travel.subject}</strong></p> : <label>Subject<select name="subject" defaultValue="" required>
        <option value="" disabled>What is it about?</option>
        <option>Booking changes</option><option>Cancellations and refunds</option><option>Payment or confirmation</option><option>Baggage or seats</option><option>Account help</option><option>Other travel assistance</option>
      </select></label>}
      <label>Message<textarea name="message" rows={5} minLength={10} maxLength={1000} required placeholder="Tell us what you need help with" defaultValue={travel?.message}/></label>
      <p>Leave out passwords, card details and verification codes.</p>
      <button className="help-button" type="submit">{travel ? 'Prepare enquiry email' : 'Prepare support email'}</button>
      {draft && <div className="help-draft">
        <p role="status">Your draft is ready. Review and send it in your email app.</p>
        <a className="help-button" href={draft.href}>Open email draft</a>
        <details><summary>Review or copy email text</summary>
          <label>Draft subject<input readOnly value={draft.subject}/></label>
          <label>Draft message<textarea readOnly rows={6} value={draft.body}/></label>
        </details>
      </div>}
    </form>
  </section>;
}
