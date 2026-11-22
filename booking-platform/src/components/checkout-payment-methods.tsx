'use client';

import { useRef, useState } from 'react';
import { bookingPhoneFromFields, bookingPhoneParts } from '@/lib/booking-phone';
import { displayMoney } from '@/lib/display-money';
import type { CheckoutPromoOffer } from '@/lib/promo-offers';
import type { RazorpayMethod } from '@/lib/razorpay-checkout-loader';
import { readCheckoutOffers } from './checkout-promo';
import { TravelIcon } from './travel-icon';
import { StitchSymbol } from './stitch-symbol';
import HotelPropertyMedia from './hotel-property-media';
import type { HotelPropertyDetails } from '@/lib/hotel-presentation';

const methods: { id: RazorpayMethod; label: string; icon: string; description: string }[] = [
  { id: 'upi', label: 'UPI', icon: 'qr_code_scanner', description: 'Pay using a supported UPI app' },
  { id: 'card', label: 'Credit or debit card', icon: 'credit_card', description: 'Choose an eligible card at checkout' },
  { id: 'netbanking', label: 'Netbanking', icon: 'account_balance', description: 'Use your bank’s online payment service' },
  { id: 'emi', label: 'EMI', icon: 'calendar_month', description: 'View eligible instalment plans at checkout' },
  { id: 'wallet', label: 'Wallets', icon: 'account_balance_wallet', description: 'Choose an available digital wallet' },
];

export function paymentPreference(form: HTMLFormElement) {
  const method = methods.find(item => item.id === form.querySelector<HTMLInputElement>('input[name="gateway-method"]')?.value);
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')?.value.trim();
  const phone = form.querySelector<HTMLInputElement>('input[name="phone"]')?.value.trim();
  const code = form.querySelector<HTMLSelectElement>('select[name="phoneCountryCode"]')?.value ?? '';
  const contact = phone ? bookingPhoneParts(bookingPhoneFromFields(phone, code)) : null;
  return method && email && contact ? {method: method.id, email, contact: contact.international} : undefined;
}

type Props = {
  quoteId: string;
  totalMinor: number;
  journey: { title: string; detail: string; product: 'HOTEL'|'FLIGHT'; photos?: HotelPropertyDetails['photos'] };
  discountMinor: number;
  appliedCode?: string | null;
  hosted: boolean;
  disabled: boolean;
  offersDisabled: boolean;
  beforeOpen: () => boolean;
  onApplyOffer: (code: string) => void;
};

export default function CheckoutPaymentMethods({quoteId, totalMinor, journey, discountMinor, appliedCode, hosted, disabled, offersDisabled, beforeOpen, onApplyOffer}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useRef<AbortController | null>(null);
  const offerToApply = useRef<string | null>(null);
  const [selected, setSelected] = useState<RazorpayMethod | ''>('');
  const [draft, setDraft] = useState<RazorpayMethod | ''>('');
  const [offers, setOffers] = useState<CheckoutPromoOffer[]>([]);
  const [offerStatus, setOfferStatus] = useState<'loading' | 'ready' | 'unavailable'>('ready');
  const methodLabel = methods.find(item => item.id === selected)?.label;
  async function openOptions() {
    if (disabled || !dialog.current || dialog.current.open || !beforeOpen()) return;
    setDraft(selected);
    dialog.current.showModal();
    setOffers([]);
    if (offersDisabled) { setOfferStatus('ready'); return; }
    load.current?.abort();
    const controller = new AbortController();
    load.current = controller;
    setOfferStatus('loading');
    try {
      const current = await readCheckoutOffers(quoteId, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
      if (!controller.signal.aborted) { setOffers(current); setOfferStatus('ready'); }
    } catch {
      if (!controller.signal.aborted) setOfferStatus('unavailable');
    }
  }
  return <section className="checkout-methods" aria-labelledby="checkout-method-title">
    <h4 id="checkout-method-title"><TravelIcon name="shield" size={19} /> Payment options</h4>
    <input type="hidden" name="gateway-method" value={hosted ? '' : selected}/>
    <button className="checkout-method-launch" type="button" aria-haspopup="dialog" disabled={disabled} onClick={() => void openOptions()}>
      <span>{methodLabel || (hosted ? 'View payment options' : 'Choose a preferred payment method')}</span><TravelIcon name="chevron" size={18}/>
    </button>
    <dialog className="checkout-method-sheet" ref={dialog} aria-labelledby="checkout-sheet-title" onClose={() => {
      load.current?.abort();
      const code = offerToApply.current;
      offerToApply.current = null;
      if (code && !offersDisabled) onApplyOffer(code);
    }}>
      <header><button className="sheet-back" aria-label="Back to booking review" type="button" onClick={() => dialog.current?.close()}>←</button>
        <div><h2 id="checkout-sheet-title">Payment options</h2><p><TravelIcon name="shield" size={14}/>{hosted ? 'PayGlocal' : 'Razorpay'} payment preview</p></div></header>
      <div className="sheet-body">
        <p className="sheet-payment-note">Choose a preferred method here. Payment starts after you complete your booking details and select Agree &amp; pay.</p>
        <section className="sheet-journey">
          <div className="sheet-journey-summary">
            {journey.photos?.length ? <HotelPropertyMedia name={journey.title} photos={journey.photos}/> : <span className="sheet-journey-symbol"><StitchSymbol name={journey.product==='HOTEL'?'apartment':'flight'} size={26}/></span>}
            <div><small>{journey.product==='HOTEL'?'Hotel stay':'Flight itinerary'}</small><h3>{journey.title}</h3><p>{journey.detail}</p></div>
          </div>
          <details className="sheet-total"><summary><span><small>Total payable</small><strong>{displayMoney(totalMinor)}</strong></span><b>View fare breakdown <StitchSymbol name="expand_more" size={14}/></b></summary>
            <dl><div><dt>Reviewed booking</dt><dd>{displayMoney(totalMinor+discountMinor)}</dd></div>
            {appliedCode && discountMinor>0 && <div><dt>{appliedCode}</dt><dd>−{displayMoney(discountMinor)}</dd></div>}</dl>
          </details>
        </section>
        {(!offersDisabled && (offerStatus !== 'ready' || offers.length > 0)) && <section className="sheet-offers">
          <h3>Available offers</h3>
          {offerStatus === 'loading' && <p role="status">Checking offers for this booking…</p>}
          {offerStatus === 'unavailable' && <p role="status">Offers could not be loaded. You can check again in booking review.</p>}
          {offers.map(offer => <button type="button" key={offer.code} disabled={disabled || offer.code===appliedCode}
            onClick={() => { setSelected(draft); offerToApply.current = offer.code; dialog.current?.close(); }}>
            <span><strong>{offer.code}</strong><small>Save {displayMoney(offer.discountMinor)}</small></span>
            <span>{offer.code === appliedCode ? 'Applied' : 'Apply'}</span></button>)}
        </section>}
        {hosted ? <section className="sheet-options"><h3>Payment method</h3><p>Choose from the available methods on PayGlocal secure checkout.</p></section> :
          <section className="sheet-options"><fieldset disabled={disabled}><legend>Select payment method</legend>
            {methods.map(method => <label key={method.id}>
              <span className="method-symbol"><StitchSymbol name={method.icon} size={20}/></span>
              <span className="sheet-method-copy">{method.label}<small>{method.description}</small></span><input aria-label={method.label} type="radio" name="gateway-method-draft" value={method.id}
                checked={draft === method.id} onChange={() => setDraft(method.id)}/>
            </label>)}
          </fieldset><p>Razorpay confirms available methods and collects payment details securely.</p></section>}
      </div>
      <footer><div><small>Total payable</small><strong>{displayMoney(totalMinor)}</strong></div>
        <button type="button" className="sheet-done" onClick={() => { setSelected(draft); dialog.current?.close(); }}>Done <TravelIcon name="check" size={16}/></button></footer>
    </dialog>
  </section>;
}
