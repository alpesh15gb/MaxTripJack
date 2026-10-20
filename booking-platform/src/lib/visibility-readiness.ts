/** No account/API access is inferred from a hostname, build mode or placeholder ID. */
export const VISIBILITY_CONNECTIONS = [
  { name: "Google Search Console", status: "Not connected", next: "Owner verification and read access; then inspect indexing and query reports." },
  { name: "Google Analytics 4", status: "Not connected", next: "Owner property, privacy approval, consent UI and tested authoritative purchase relay." },
  { name: "Google Tag Manager", status: "Not configured · optional", next: "Choose GA4 directly or a reviewed GTM deployment, not duplicate tracking." },
  { name: "Bing Webmaster Tools", status: "Not connected", next: "Owner verification and read access; inspect search and available AI reports." },
  { name: "Google Business Profile", status: "Not connected", next: "An existing profile is owner-reported; obtain the client's owner access and verify office details. Do not create a duplicate profile." },
] as const;

export const VISIBILITY_BASELINES = [
  { metric: "Organic clicks / impressions / non-brand visibility", source: "Search Console", value: null, unit: "count", target: null },
  { metric: "Indexed high-value landing pages", source: "Search Console / Bing", value: null, unit: "count", target: null },
  { metric: "Organic booking conversion rate / gross booking value", source: "Consented attribution + booking ledger", value: null, unit: "rate / INR", target: null },
  { metric: "Funnel abandonment by stage", source: "Consented analytics", value: null, unit: "rate", target: null },
  { metric: "Observable AI referrals / citations", source: "Referral analytics / available webmaster reports", value: null, unit: "separate counts", target: null },
  { metric: "Local profile actions", source: "Verified Business Profile", value: null, unit: "count", target: null },
  { metric: "Mobile field LCP · p75", source: "Field data after sufficient traffic", value: null, unit: "seconds", target: "≤ 2.5 seconds" },
  { metric: "Mobile field INP · p75", source: "Field data after sufficient traffic", value: null, unit: "milliseconds", target: "≤ 200 milliseconds" },
  { metric: "Mobile field CLS · p75", source: "Field data after sufficient traffic", value: null, unit: "score", target: "≤ 0.1" },
] as const;

export type VisibilityLedgerSnapshot = {
  checkedAt: string;
  environment: "uat_only_adapter";
  scope: "all_time_current_state";
  currency: "INR";
  confirmedBaseBookings: string;
  confirmedBaseBookingValueMinor: string;
  capturedPayments: string;
  capturedPaymentValueMinor: string;
  completedRefunds: string;
  completedRefundValueMinor: string;
  organicAttribution: null;
  productionRevenue: null;
  agencyNetRevenue: null;
};

/** Database bigint amounts stay exact. Never coerce a financial aggregate to Number. */
export function formatInrMinor(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error("Invalid non-negative minor amount.");
  const amount = BigInt(value);
  const whole = (amount / BigInt(100)).toLocaleString("en-IN");
  return `₹${whole}.${(amount % BigInt(100)).toString().padStart(2, "0")}`;
}
