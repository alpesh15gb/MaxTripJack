import {displayMoney} from '@/lib/display-money';
import type {InitialReviewPriceChange} from '@/lib/checkout-selection-context';

export default function InitialReviewPriceNotice({change,product}:{change:InitialReviewPriceChange;product:'FLIGHT'|'HOTEL'}){
 return <section className="initial-review-price-notice" aria-labelledby="initial-review-price-title">
  <h3 id="initial-review-price-title">Price updated at review</h3>
  <p>{product==='HOTEL'?'Full stay · all selected rooms and guests':'Complete selected itinerary · all travellers'}</p>
  <dl><div><dt>Selected estimate</dt><dd>{displayMoney(change.estimateMinor)}</dd></div><div><dt>First reviewed total</dt><dd>{displayMoney(change.reviewedMinor)}</dd></div></dl>
  <p role="status">The review returned a different total for this selection. Check the reviewed total and terms before continuing.</p>
 </section>;
}
