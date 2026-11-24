import {displayMoney} from '@/lib/display-money';
import type {InitialReviewPriceChange} from '@/lib/checkout-selection-context';
import type {BookingPriceBreakdown} from '@/lib/booking-price-breakdown';

function signedMoney(amount: number) {
 return `${amount > 0 ? '+' : ''}${displayMoney(amount)}`;
}

export default function InitialReviewPriceNotice({change,product,estimateBreakdown,reviewedBreakdown}:{
 change:InitialReviewPriceChange;product:'FLIGHT'|'HOTEL';estimateBreakdown?:BookingPriceBreakdown;reviewedBreakdown?:BookingPriceBreakdown|null;
}){
 const stay = product === 'HOTEL';
 const difference = change.reviewedMinor - change.estimateMinor;
 const roomRateDifference = estimateBreakdown && reviewedBreakdown ? reviewedBreakdown.baseMinor - estimateBreakdown.baseMinor : null;
 return <section className="initial-review-price-notice" aria-labelledby="initial-review-price-title">
  <h3 id="initial-review-price-title">Price updated at review</h3>
  <p>{product==='HOTEL'?'Full stay · all selected rooms and guests':'Complete selected itinerary · all travellers'}</p>
  <dl><div><dt>Selected estimate</dt><dd>{displayMoney(change.estimateMinor)}</dd></div><div><dt>First reviewed total</dt><dd>{displayMoney(change.reviewedMinor)}</dd></div>{stay&&<div><dt>Change in stay total</dt><dd>{signedMoney(difference)}</dd></div>}</dl>
  <p role="status">{stay
    ? 'The total changed when we checked availability and price for this room again.'
    : 'The review returned a different total for this selection. Check the reviewed total and terms before continuing.'}</p>
  {stay&&roomRateDifference!==null&&<p>Room rate {signedMoney(roomRateDifference)} · Taxes and fees {signedMoney(difference-roomRateDifference)}</p>}
  {stay&&roomRateDifference===null&&reviewedBreakdown&&<p>See the price breakdown for the current room rate, taxes and fees.</p>}
  {stay&&!reviewedBreakdown&&<p>The supplier did not provide a complete breakdown for the reviewed total.</p>}
 </section>;
}
