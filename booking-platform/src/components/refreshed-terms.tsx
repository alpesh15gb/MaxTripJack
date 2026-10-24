import {compareReviewedTerms,type ReviewTerm} from '@/lib/review-term-changes';
import SupplierPolicy from './supplier-policy';
type Review={totalMinor:number;review:{terms?:ReviewTerm[];fareRules?:unknown;option?:{cancellation?:unknown}}};
const money=(minor:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(minor/100);
export default function RefreshedTerms({before,after}:{before:Review;after:Review}){
 const changes=compareReviewedTerms(before.review.terms,after.review.terms);
 const incomplete=!before.review.terms?.length||!after.review.terms?.length||[...before.review.terms,...after.review.terms].some(term=>term.value===null);
 return <section className="supplier-policy" aria-labelledby="refreshed-terms-title">
  <h3 id="refreshed-terms-title" tabIndex={-1}>Review the refreshed terms</h3>
  <p role="status">{before.totalMinor===after.totalMinor?'Total unchanged.':`Total changed from ${money(before.totalMinor)} to ${money(after.totalMinor)}.`} {changes.length?`${changes.length} reviewed detail${changes.length===1?' has':'s have'} changed or become unavailable.`:'No differences detected in the comparable details.'} {incomplete&&'Some terms could not be compared.'}</p>
  <p><strong>Same price does not mean same terms.</strong> Only supplied details are compared. Missing details do not mean no restrictions or no allowance.</p>
  {changes.length>0&&<dl className="policy-list">{changes.map(change=><div className="policy-row" key={change.key}><dt>{change.label}</dt><dd><p><strong>Previously:</strong> {change.before}</p><p><strong>Now:</strong> {change.after}</p></dd></div>)}</dl>}
  <details><summary>Compare supported previous and latest cancellation / fare policies</summary><p>This comparison does not cover every supplier rule or meal benefit. Some full conditions may be unavailable here. Read the latest supplied conditions before accepting again; contact support if anything is unclear.</p><SupplierPolicy title="Previous supplier policy" value={before.review.option?.cancellation??before.review.fareRules}/><SupplierPolicy title="Latest supplier policy" value={after.review.option?.cancellation??after.review.fareRules}/></details>
 </section>;
}
