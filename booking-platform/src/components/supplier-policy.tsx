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

export default function SupplierPolicy({ title, value }: { title: string; value: unknown }) {
  return <section className="supplier-policy" aria-label={title}>
    <h4>{title}</h4>
    <PolicyValue value={value}/>
  </section>;
}
