import {publicSupplierPolicy,publicSupplierAlerts} from '@/lib/public-supplier-policy';
import {flightFareRuleRoutes,flightRuleTypes,flightRuleLabels,flightRuleWindow,flightFeeLabels,type FlightRule} from '@/lib/flight-fare-rules';
const FRIENDLY_LABELS: Record<string, string> = {
  amount: "Amount",
  cancellable: "Cancellation allowed",
  cancellationDeadline: "Cancellation deadline",
  cancellationPolicy: "Cancellation policy",
  currency: "Currency",
  endDate: "End date",
  freeCancellation: "Free cancellation",
  fromDate: "From",
  nonRefundable: "Non-refundable",
  penalty: "Cancellation penalty",
  penaltyAmount: "Penalty amount",
  percent: "Percentage",
  refundable: "Refundable",
  startDate: "Start date",
  toDate: "Until",
};

function labelFor(key: string) {
  return FRIENDLY_LABELS[key] ?? key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll(".", " · ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayValue(key: string, value: unknown) {
  if (typeof value === "boolean") {
    if (/required|mandatory/i.test(key)) return value ? "Required" : "Not required";
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not provided";
  if (typeof value === "string") return value.trim() || "Not provided";
  return "Not provided";
}

function PolicyValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 4) return <p className="policy-note">Additional supplier details are available in the booking review.</p>;
  if (Array.isArray(value)) {
    if (!value.length) return <p className="policy-note">No policy details provided.</p>;
    return <div className="policy-list">{value.slice(0, 20).map((entry, index) => <div className="policy-row" key={index}><PolicyValue value={entry} depth={depth + 1}/></div>)}</div>;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== null && entry !== undefined && entry !== "");
    if (!entries.length) return <p className="policy-note">No policy details provided.</p>;
    return <dl className="policy-list">{entries.slice(0, 24).map(([key, entry]) => <div className="policy-row" key={key}>
      <dt>{labelFor(key)}</dt><dd>{entry && typeof entry === "object" ? <PolicyValue value={entry} depth={depth + 1}/> : displayValue(key, entry)}</dd>
    </div>)}</dl>;
  }
  return <p className="policy-note">{displayValue("policy", value)}</p>;
}

function FlightRuleRows({rules}:{rules:FlightRule[]}) {
  return <ol className="flight-policy-bands">{rules.map((rule,index)=><li className="flight-policy-band" key={index}>
    <p className="flight-policy-window">{flightRuleWindow(rule)}</p>
    {rule.policyInfo&&<p className="flight-policy-description">{rule.policyInfo}</p>}
    {(rule.amount!==undefined||rule.additionalFee!==undefined)&&<dl className="flight-policy-fees">
      {rule.amount!==undefined&&<div><dt>Airline fee</dt><dd>{rule.amount.toLocaleString('en-IN',{maximumFractionDigits:20})}</dd></div>}
      {rule.additionalFee!==undefined&&<div><dt>Supplier fee</dt><dd>{rule.additionalFee.toLocaleString('en-IN',{maximumFractionDigits:20})}</dd></div>}
    </dl>}
    {rule.fcs&&<details className="flight-policy-breakdown"><summary>Supplied fee breakdown</summary><dl className="flight-policy-fees">{Object.entries(rule.fcs).map(([key,value])=><div key={key}><dt>{flightFeeLabels[key as keyof typeof flightFeeLabels]}</dt><dd>{value}</dd></div>)}</dl></details>}
  </li>)}</ol>;
}

function FlightPolicies({value}:{value:unknown}) {
  const routes=flightFareRuleRoutes(value);
  return <div className="flight-policy-routes">{routes.map(({route,policy})=><article className="flight-policy-route" key={route}>
    <h5>{route.replaceAll('-',' → ')}</h5>
    <div className="flight-policy-category"><h6>Cancellation</h6>{policy.tfr?.CANCELLATION?<FlightRuleRows rules={policy.tfr.CANCELLATION}/>:<p className="policy-note flight-policy-unavailable">Cancellation charges are unavailable for this route. Do not assume this fare is refundable. {policy.miscInfo?'Read the detailed fare conditions below and contact support if unclear.':'Contact support for the terms before paying.'}</p>}</div>
    {flightRuleTypes.filter(type=>type!=='CANCELLATION'&&policy.tfr?.[type]).map(type=><details className="flight-policy-category" key={type}><summary>{flightRuleLabels[type]}</summary><FlightRuleRows rules={policy.tfr![type]!}/></details>)}
    {policy.miscInfo&&<details className="flight-policy-category"><summary>Detailed fare conditions</summary>{policy.miscInfo.map((note,index)=><p className="flight-policy-description" key={index}>{note}</p>)}</details>}
  </article>)}
  <p className="policy-note">Fee amounts are shown as supplied. Currency and whether fees apply per person are not specified separately. Read the airline wording; these amounts are not a refund quote.</p>
  </div>;
}

export default function SupplierPolicy({ title, value }: { title: string; value: unknown }) {
  const safe=publicSupplierPolicy(value),hasFlightRules=flightFareRuleRoutes(safe).length>0;
  return <section className="supplier-policy" aria-label={title}>
    <h4>{title}</h4>
    <p className="policy-note">Only supported supplier policy details are shown. Other terms may be unavailable; contact support for complete conditions before paying.</p>
    {hasFlightRules?<FlightPolicies value={safe}/>:<PolicyValue value={safe??publicSupplierAlerts(value)??"Comparable policy details unavailable. Do not assume there are no restrictions."}/>}
  </section>;
}
