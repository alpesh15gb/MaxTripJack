import {displayMoney} from '@/lib/display-money';
import {compareReviewedTerms,type ReviewTerm} from '@/lib/review-term-changes';
import SupplierPolicy from './supplier-policy';
type Review={totalMinor:number;review:{terms?:ReviewTerm[];fareRules?:unknown;option?:{cancellation?:unknown}}};
const money=(minor:number)=>displayMoney(minor);
export default function RefreshedTerms({before,after,extrasRefresh}:{before:Review;after:Review;extrasRefresh?:'kept'|'removed'}){
 const changes=compareReviewedTerms(before.review.terms,after.review.terms);
 const totalChanged=before.totalMinor!==after.totalMinor;
 const extrasChanged=extrasRefresh==='removed';
 const incomplete=!before.review.terms?.length||!after.review.terms?.length||[...before.review.terms,...after.review.terms].some(term=>term.value===null);
 return <section className={`supplier-policy refreshed-terms ${changes.length||totalChanged||extrasChanged?'refreshed-terms--changed':'refreshed-terms--unchanged'}`} aria-labelledby="refreshed-terms-title">
  <h3 id="refreshed-terms-title" tabIndex={-1}>Review the refreshed terms</h3>
  <p role="status">{!totalChanged?'Total unchanged.':`Total changed from ${money(before.totalMinor)} to ${money(after.totalMinor)}.`} {changes.length?`${changes.length} reviewed detail${changes.length===1?' has':'s have'} changed or become unavailable.`:totalChanged||extrasChanged?'The comparable fare or room terms are unchanged.':'No differences detected in the comparable details.'} {incomplete&&'Some terms could not be compared.'}</p>
  {extrasRefresh&&<p className="refreshed-terms-guidance"><strong>{extrasRefresh==='kept'?'Saved flight extras are included in the refreshed total.':'Saved flight extras were removed at your request.'}</strong></p>}
  {changes.length>0&&<p className="refreshed-terms-guidance"><strong>Same price does not mean same terms.</strong> Only supplied details are compared. Missing details do not mean no restrictions or no allowance.</p>}
  {changes.length>0&&<dl className="policy-list">{changes.map(change=><div className="policy-row" key={change.key}><dt>{change.label}</dt><dd><p><strong>Previously:</strong> {change.before}</p><p><strong>Now:</strong> {change.after}</p></dd></div>)}</dl>}
  <details><summary>Compare supported previous and latest cancellation / fare policies</summary><p>This comparison does not cover every supplier rule or meal benefit. Some full conditions may be unavailable here. Missing details do not mean no restrictions or no allowance. Read the latest supplied conditions before accepting again; contact support if anything is unclear.</p><SupplierPolicy title="Previous supplier policy" value={before.review.option?.cancellation??before.review.fareRules}/><SupplierPolicy title="Latest supplier policy" value={after.review.option?.cancellation??after.review.fareRules}/></details>
 </section>;
}
