"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { defaultReportFilters, parseReportFilters, reportParams, REPORT_DEFINITIONS, REPORT_SCOPES, REPORT_STATUSES, type BookingReport, type ReportFilters } from "@/lib/booking-report";
import { formatInrMinor } from "@/lib/visibility-readiness";

const label = (value: string) => value === "ALL" ? "All" : value.replaceAll("_", " ").toLowerCase();
function indiaDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
export default function BookingReports() {
  const [draft, setDraft] = useState<ReportFilters>(() => defaultReportFilters());
  const [applied, setApplied] = useState<ReportFilters | null>(null);
  const [report, setReport] = useState<BookingReport | null>(null);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportController = useRef<AbortController | null>(null);

  useEffect(() => {
    const readLocation = () => {
      exportController.current?.abort(); setExporting(false); setExportError("");
      try {
        const filters = parseReportFilters(new URLSearchParams(window.location.search));
        setReport(null); setLoading(true); setError("");
        setDraft({ ...filters, cursor: undefined }); setApplied(filters); setFilterError("");
      } catch (error) {
        setApplied(null); setReport(null); setLoading(false);
        setFilterError(error instanceof Error ? error.message : "Invalid report filters.");
      }
    };
    readLocation(); window.addEventListener("popstate", readLocation);
    return () => { window.removeEventListener("popstate", readLocation); exportController.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    fetch(`/api/admin/reports?${reportParams(applied, applied.cursor)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Reporting is temporarily unavailable.");
        if (!controller.signal.aborted) setReport(data);
      })
      .catch(error => { if (!controller.signal.aborted) { setReport(null); setError(error instanceof Error ? error.message : "Reporting is unavailable."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, refresh]);

  function apply(filters: ReportFilters) {
    try {
      const checked = parseReportFilters(reportParams(filters, filters.cursor));
      exportController.current?.abort(); setExporting(false); setExportError("");
      setReport(null); setLoading(true); setError("");
      setApplied(checked); setDraft({ ...checked, cursor: undefined }); setFilterError("");
      window.history.pushState(null, "", `/operations/reports?${reportParams(checked, checked.cursor)}`);
    } catch (error) { setFilterError(error instanceof Error ? error.message : "Invalid filters."); }
  }
  function refreshReport() { exportController.current?.abort(); setExporting(false); setExportError(""); setReport(null); setError(""); setLoading(true); setRefresh(value => value + 1); }
  async function exportReport() {
    if (!applied || !report || exporting || loading) return;
    const controller = new AbortController(); exportController.current = controller;
    setExporting(true); setExportError("");
    try {
      const response = await fetch(`/api/admin/reports/export?${reportParams(applied)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) { const data = await response.json(); if (controller.signal.aborted) return; if (response.status === 401 || response.status === 403) setReport(null); throw Error(data.error || "Export could not be prepared."); }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `maxtravel-booking-cohort-${applied.from}-${applied.to}.csv`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (!controller.signal.aborted) setExportError(error instanceof Error ? error.message : "Export unavailable."); }
    finally { if (!controller.signal.aborted) setExporting(false); }
  }
  const unapplied = applied && reportParams(draft).toString() !== reportParams(applied).toString();
  return <main id="main-content" className="reports-page">
    <nav className="reports-nav" aria-label="Operations navigation"><Link href="/operations">← Operations workspace</Link><Link href="/operations/visibility">Measurement readiness</Link><Link href="/account">Account & security</Link></nav>
    <header className="reports-heading"><div><p className="reports-eyebrow">PRIVATE · FINANCE REPORTING</p><h1>Know where every booking stands.</h1><p>One order cohort. Clear booking, payment and refund totals.</p></div><span className="reports-badge">UAT / test records</span></header>
    <aside className="reports-notice"><strong>Current state, not period cash flow.</strong><p>Dates select when bookings were created in Asia/Kolkata. Payments and refunds include later updates to those bookings. These records are not production revenue, bank settlement or net profit. Test and live records cannot be separated by an existing per-order environment marker.</p></aside>
    <form className="reports-filters" aria-label="Report filters" onSubmit={event => { event.preventDefault(); apply({ ...draft, cursor: undefined }); }}>
      <label>Created from (IST)<input type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })}/></label>
      <label>Created through (IST)<input type="date" required value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })}/></label>
      <label>Product<select value={draft.product} onChange={e => setDraft({ ...draft, product: e.target.value as ReportFilters["product"] })}>{["ALL", "FLIGHT", "HOTEL"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label>Current status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as ReportFilters["status"] })}>{["ALL", ...REPORT_STATUSES].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label>Order scope<select value={draft.scope} onChange={e => setDraft({ ...draft, scope: e.target.value as ReportFilters["scope"] })}>{REPORT_SCOPES.map(value => <option key={value} value={value}>{value === "ALL" ? "All orders" : value === "BASE" ? "Base bookings" : label(value)}</option>)}</select></label>
      <div className="reports-filter-actions"><button type="submit">Apply filters</button><button type="button" className="reports-secondary" onClick={() => apply(defaultReportFilters())}>This month</button></div>
      <p className="reports-filter-help">Maximum 366 days, inclusive. {unapplied ? "You have unapplied changes. Displayed results and export use the applied filters below." : "All summary cards and exports use the same applied booking cohort."}</p>
      {filterError && <p className="reports-error" role="alert">{filterError}</p>}
    </form>
    {applied && <section className="reports-applied" aria-label="Applied report filters"><div><strong>Applied: {applied.from} → {applied.to} · Asia/Kolkata</strong><p>{label(applied.product)} products · {label(applied.status)} statuses · {applied.scope === "ALL" ? "All order types" : label(applied.scope)} · Current-state creation cohort</p></div><div className="reports-actions"><button type="button" className="reports-secondary" disabled={loading} onClick={refreshReport}>Refresh report</button><button type="button" disabled={loading || !report || exporting} onClick={() => void exportReport()}>{exporting ? "Preparing CSV…" : "Export full cohort CSV"}</button></div></section>}
    {exportError && <p className="reports-error" role="alert">{exportError}</p>}
    {loading && <section className="reports-loading" role="status" aria-live="polite"><span/>Loading authorised report…</section>}
    {error && <section className="reports-error" role="alert"><h2>Report unavailable</h2><p>{error} Values are unknown, not zero. No previous financial results are shown.</p><button type="button" onClick={refreshReport}>Try again</button></section>}
    {!loading && report && <>
      <p className="reports-stamp">Checked {indiaDate(report.checkedAt)} IST · INR only · Current-state values can change after refresh or export.</p>
      <section className="reports-cards" aria-label="Cohort totals">
        <article><span>Bookings / orders</span><strong>{report.totals.orders}</strong><p>{formatInrMinor(report.totals.orderValueMinor)} recorded order value</p><small>Includes every current status in the applied scope; not confirmed sales.</small></article>
        <article><span>Currently confirmed base</span><strong>{formatInrMinor(report.totals.confirmedBaseValueMinor)}</strong><p>{report.totals.confirmedBaseBookings} eligible base bookings</p><small>Supplier-confirmed with matching captured payment and confirmation evidence.</small></article>
        <article><span>Captured payments</span><strong>{formatInrMinor(report.totals.capturedMinor)}</strong><p>{report.totals.capturedPayments} captured payment records</p><small>Includes captured money on pending or unsuccessful bookings.</small></article>
        <article><span>Completed refunds</span><strong>{formatInrMinor(report.totals.completedRefundMinor)}</strong><p>{report.totals.completedRefunds} completed refund records</p><small>Linked to captured payments; separate from supplier cancellation.</small></article>
        <article><span>Pending refunds</span><strong>{formatInrMinor(report.totals.pendingRefundMinor)}</strong><p>{report.totals.pendingRefunds} requested / approved / processing</p><small>Not yet completed; never deducted as money already refunded.</small></article>
      </section>
      <section className="reports-breakdowns" aria-label="Cohort breakdowns"><div><h2>Current booking statuses</h2>{report.statuses.length ? <div className="reports-chips">{report.statuses.map(item => <button key={item.status} type="button" onClick={() => apply({ ...applied!, status: item.status as ReportFilters["status"], cursor: undefined })}>{label(item.status)} <b>{item.count}</b></button>)}</div> : <p>No statuses in this cohort.</p>}</div><div><h2>Order types</h2><ul>{report.scopes.map(item => <li key={item.scope}>{item.scope === "OTHER" ? "Unclassified — investigate separately" : label(item.scope)} <strong>{item.count}</strong></li>)}</ul></div></section>
      <section aria-labelledby="report-bookings"><div className="reports-table-heading"><div><h2 id="report-bookings">Booking-level reconciliation</h2><p>{report.rows.length} rows on this page; summary totals cover the full filtered cohort. Open a row for its financial breakdown.</p></div><a href="#report-definitions">How figures are defined ↓</a></div>
      {!report.rows.length ? <div className="reports-empty"><h3>No bookings match this view.</h3><p>Try a wider date range or different product, status or order scope. This is an empty result, not a reporting error.</p></div> : <div className="reports-table-wrap" role="region" aria-label="Booking report rows" tabIndex={0}><table><caption>INR creation-cohort detail · newest bookings first</caption><thead><tr><th scope="col">Booking / created IST</th><th scope="col">Product / status</th><th scope="col">Order value</th><th scope="col">Captured</th><th scope="col">Refunds</th><th scope="col">Breakdown</th></tr></thead><tbody>{report.rows.map(row => <tr key={row.id}><th scope="row"><strong>{row.reference}</strong><small>{indiaDate(row.createdAt)} IST</small><small>{label(row.scope)}</small></th><td>{label(row.product)}<small>{label(row.status)}</small>{row.confirmedBase && <small className="reports-confirmed">Verified base confirmation</small>}</td><td>{formatInrMinor(row.totalMinor)}</td><td>{formatInrMinor(row.capturedMinor)}<small>{row.capturedPayments} records · {row.providers || "No payment provider recorded"}</small></td><td>{formatInrMinor(row.completedRefundMinor)}<small>Completed · {row.completedRefunds} records</small><small>{formatInrMinor(row.pendingRefundMinor)} pending</small></td><td><details><summary>View breakdown</summary><dl><dt>Booking ID</dt><dd>{row.id}</dd><dt>Quoted supplier cost</dt><dd>{formatInrMinor(row.supplierMinor)}</dd><dt>Pending refund records</dt><dd>{row.pendingRefunds}</dd>{row.parentOrderId && <><dt>Original booking ID</dt><dd>{row.parentOrderId}</dd></>}</dl><p>Recorded quote cost is not final supplier settlement or net profit.</p><Link href="/operations">Open authorised operations workspace</Link></details></td></tr>)}</tbody></table></div>}
      <nav className="reports-pagination" aria-label="Report pages"><button className="reports-secondary" type="button" disabled={!applied?.cursor || loading} onClick={() => apply({ ...applied!, cursor: undefined })}>First page</button><span>{applied?.cursor ? "Older booking records" : "Newest booking records"}</span><button type="button" disabled={!report.nextCursor || loading} onClick={() => apply({ ...applied!, cursor: report.nextCursor! })}>Older bookings →</button></nav></section>
    </>}
    <section id="report-definitions" className="reports-definitions"><p className="reports-eyebrow">THE RULES BEHIND THE NUMBERS</p><h2>Report definitions</h2><dl>{REPORT_DEFINITIONS.map(([name, definition]) => <div key={name}><dt>{name}</dt><dd>{definition}</dd></div>)}</dl><p>CSV exports all matching rows, up to 5,000, regardless of the visible page. Amount columns explicitly ending in <code>_minor</code> are exact integer paise. Dates, timezone, generation time and UAT context accompany each data row. Import text columns as text; spreadsheet applications can treat formula-like values differently after re-saving.</p></section>
  </main>;
}
