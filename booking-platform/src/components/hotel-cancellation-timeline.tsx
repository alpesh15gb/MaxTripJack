import {hotelCancellationTimeline} from '@/lib/hotel-cancellation-timeline';
import SupplierPolicy from './supplier-policy';
export default function HotelCancellationTimeline({value}:{value:unknown}){
 const windows=hotelCancellationTimeline(value);
 return <section className="supplier-policy" aria-label="Hotel cancellation windows"><h4>Hotel cancellation windows</h4><p>Formatted cancellation windows use India Standard Time (IST, UTC+05:30). Original timestamps remain as supplied in the details. Supplier cancellation charges are not a guarantee of your final refund.</p>{windows?<ol className="policy-list">{windows.map((window,index)=><li className="policy-row" key={index}><div><strong>From {window.from} IST</strong><p>Until {window.until} IST</p></div><p>{window.charge}</p></li>)}</ol>:<p className="policy-note">Cancellation terms require review. A complete, unambiguous schedule was not supplied.</p>}<details><summary>Original supplier policy details</summary><SupplierPolicy title="Supplier cancellation terms" value={value}/></details></section>;
}
