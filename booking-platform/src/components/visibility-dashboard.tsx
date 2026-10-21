"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ANALYTICS_FUNNEL } from "@/lib/analytics";
import { formatInrMinor, VISIBILITY_BASELINES, VISIBILITY_CONNECTIONS, type VisibilityLedgerSnapshot } from "@/lib/visibility-readiness";
import styles from "@/app/operations/visibility/visibility.module.css";

export default function VisibilityDashboard() {
  const [snapshot, setSnapshot] = useState<VisibilityLedgerSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loadedRefresh, setLoadedRefresh] = useState(-1);
  const loading = loadedRefresh !== refresh;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/visibility", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load reporting.");
        if (!controller.signal.aborted) { setSnapshot(data); setMessage(""); }
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setMessage(error instanceof Error ? error.message : "Unable to load reporting.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedRefresh(refresh); });
    return () => controller.abort();
  }, [refresh]);

  return <main id="main-content" className={styles.page}>
    <nav className={styles.navigation} aria-label="Operations navigation"><Link href="/operations">← Operations workspace</Link><Link href="/account">Account & security</Link></nav>
    <header className={styles.heading}><div><p className={styles.eyebrow}>PRIVATE · FINANCE PERMISSION REQUIRED</p><h1>Visibility & measurement</h1><p>Readiness, known gaps and a read-only booking ledger snapshot.</p></div>
      <button className={styles.button} disabled={loading} onClick={() => { setSnapshot(null); setMessage(""); setRefresh(value => value + 1); }}>{loading ? "Loading ledger…" : "Refresh ledger"}</button>
    </header>

    <aside className={styles.notice}><h2>Prepared, not activated</h2><p>Optional analytics is off. No analytics tags, visitor identifiers or outbound measurement are installed by this foundation. External account existence and access are unverified; “not connected” means not connected to this dashboard.</p><p>The supplier adapter is UAT-only. Database amounts below are test-environment operational records, <strong>not production revenue, organic sales or a growth baseline</strong>.</p></aside>

    <section className={styles.section} aria-labelledby="ledger-heading" aria-busy={loading}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>FIRST-PARTY DATABASE · INR</p><h2 id="ledger-heading">Current ledger snapshot</h2></div><span className={styles.badge}>UAT / test context</span></div>
      {loading && <p role="status">Loading authorised aggregate records…</p>}
      {message && <p className={styles.error} role="alert">Ledger unavailable: {message} Values are unknown, not zero.</p>}
      {!loading && snapshot && <>
        <p className={styles.meta}>All-time current state · checked <time dateTime={snapshot.checkedAt}>{snapshot.checkedAt.replace("T", " ").replace("Z", " UTC")}</time>. Not a date-range conversion report.</p>
        <div className={styles.metrics}>
          <article className={styles.metric}><h3>Currently confirmed base bookings</h3><strong>{snapshot.confirmedBaseBookings}</strong><p>{formatInrMinor(snapshot.confirmedBaseBookingValueMinor)} gross booking value</p><small>Paid + flight ticketed or hotel confirmed, with server booking.confirmed evidence. Excludes reissues, ancillary orders and bookings no longer confirmed.</small></article>
          <article className={styles.metric}><h3>Captured payments</h3><strong>{formatInrMinor(snapshot.capturedPaymentValueMinor)}</strong><p>{snapshot.capturedPayments} captured payment records</p><small>All orders, including after-sales. Capture alone does not establish a confirmed booking or purchase conversion.</small></article>
          <article className={styles.metric}><h3>Completed refunds</h3><strong>{formatInrMinor(snapshot.completedRefundValueMinor)}</strong><p>{snapshot.completedRefunds} completed refund records</p><small>Only completed refunds linked to captured payments. Requested, approved and processing refunds are excluded.</small></article>
        </div>
      </>}
      <p className={styles.meta}>Agency net revenue, production revenue and organic attribution: <strong>not measured</strong>. Gross booking value is not commission or profit. Payment and refund scopes differ from current confirmed bookings, so subtraction is not a reconciled revenue measure. Existing records have no per-order environment marker; do not mix test and live data.</p>
    </section>

    <section className={styles.section} aria-labelledby="connections-heading"><p className={styles.eyebrow}>OWNER ACTION REQUIRED</p><h2 id="connections-heading">External reporting connections</h2>
      <div className={styles.connections}>{VISIBILITY_CONNECTIONS.map(item => <article key={item.name}><div><h3>{item.name}</h3><span className={styles.badge}>{item.status}</span></div><p>{item.next}</p></article>)}</div>
    </section>

    <section className={styles.section} aria-labelledby="funnel-heading"><p className={styles.eyebrow}>EVENT CONTRACT ONLY · NO DELIVERY ENABLED</p><h2 id="funnel-heading">Booking funnel</h2><ol className={styles.funnel}>{ANALYTICS_FUNNEL.map(stage => <li key={stage.name}><h3>{stage.label}</h3><code>{stage.name}{"alternative" in stage ? ` / ${stage.alternative}` : ""}</code><span>Not measured</span><small>{stage.conversion ? "Purchase candidate: authoritative server confirmation only; durable deduplication relay still required." : stage.authority === "verified_server" ? "Server-verified payment; not a booking conversion." : "Explicit analytics consent required; no event collection connected."}</small></li>)}</ol>
      <p className={styles.meta}>A payment callback, checkout screen or My trips view must never dispatch a purchase. The existing server outbox contains private operational payloads: never forward those payloads to analytics. Denied consent and missing referrers create unknown attribution, not zero demand.</p>
    </section>

    <section className={styles.section} aria-labelledby="baseline-heading"><p className={styles.eyebrow}>UNKNOWN IS NOT ZERO</p><h2 id="baseline-heading">Search & growth baseline</h2><p>Use the first complete 28-day production window after approved activation. Record source, dates, time zone, consent gaps and test exclusions before setting traffic or conversion growth targets.</p>
      <div className={styles.tableWrap} role="region" aria-label="Search and growth baseline" tabIndex={0}><table className={styles.table}><caption>Unmeasured baseline; performance thresholds are targets, not results.</caption><thead><tr><th scope="col">Metric</th><th scope="col">Source</th><th scope="col">Baseline</th><th scope="col">Target</th></tr></thead><tbody>{VISIBILITY_BASELINES.map(metric => <tr key={metric.metric}><th scope="row">{metric.metric}</th><td>{metric.source}</td><td>Not measured</td><td>{metric.target ?? "Set after baseline"}</td></tr>)}</tbody></table></div>
    </section>
  </main>;
}
