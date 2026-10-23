import {hotelCancellationTimeline} from '@/lib/hotel-cancellation-timeline';
import SupplierPolicy from './supplier-policy';
export default function HotelCancellationTimeline({value}:{value:unknown}){
 const windows=hotelCancellationTimeline(value);
 return <section className="supplier-policy hotel-cancellation-policy" aria-label="Hotel cancellation windows">
  <h4>Hotel cancellation windows</h4>
  <p>Times are in India Standard Time (IST, UTC+05:30). These are supplier policy details, not a confirmed refund quote.</p>
  {windows?<ol className="policy-list">{windows.map((window,index)=><li className="policy-row" key={index}>
   <div><strong>From {window.from} IST</strong><p>Until {window.until} IST</p></div>
   <div><strong className="policy-charge-heading">{window.chargeKnown?'Supplied policy':'Exact charge needs confirmation'}</strong><p>{window.charge}</p></div>
  </li>)}</ol>:<p className="policy-note">We cannot confirm the cancellation schedule. Complete, unambiguous terms were not supplied; check the full policy before payment.</p>}
  <details><summary>Original supplier policy details</summary><p className="policy-note">Original values are shown below for reference. An amount without a verified currency, unit and calculation basis is not a confirmed cancellation charge.</p><SupplierPolicy title="Supplier cancellation terms" value={value}/></details>
 </section>;
}
