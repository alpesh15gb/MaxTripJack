import Link from "next/link";
import type { ReportRow } from "@/lib/booking-report";
import { formatInrMinor } from "@/lib/visibility-readiness";

const label = (value: string) => value.replaceAll("_", " ").toLowerCase();
export function reportIndiaDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** One row per booking, shared by the desktop table and mobile card layout.
 * Explicit table roles preserve semantics when mobile CSS changes display. */
export default function BookingReportRows({ rows }: { rows: ReportRow[] }) {
  return <div className="reports-table-wrap" role="region" aria-label="Booking report rows" tabIndex={0}>
    <table role="table" aria-label="Booking-level reconciliation">
      <caption>INR creation-cohort detail · newest bookings first</caption>
      <thead role="rowgroup"><tr role="row">
        <th role="columnheader" scope="col">Booking / created IST</th><th role="columnheader" scope="col">Product / status</th>
        <th role="columnheader" scope="col">Order value</th><th role="columnheader" scope="col">Captured</th>
        <th role="columnheader" scope="col">Refunds</th><th role="columnheader" scope="col">Breakdown</th>
      </tr></thead>
      <tbody role="rowgroup">{rows.map(row => <tr role="row" key={row.id}>
        <th role="rowheader" scope="row" className="reports-row-identity">
          <strong>{row.reference}</strong><small>{reportIndiaDate(row.createdAt)} IST</small><small>{label(row.scope)}</small>
        </th>
        <td role="cell" className="reports-row-status"><span className="reports-cell-label" aria-hidden="true">Product / status</span>
          {label(row.product)}<small>{label(row.status)}</small>{row.confirmedBase && <small className="reports-confirmed">Verified base confirmation</small>}
        </td>
        <td role="cell"><span className="reports-cell-label" aria-hidden="true">Order value</span>{formatInrMinor(row.totalMinor)}</td>
        <td role="cell"><span className="reports-cell-label" aria-hidden="true">Captured</span>{formatInrMinor(row.capturedMinor)}<small>{row.capturedPayments} records · {row.providers || "No payment provider recorded"}</small></td>
        <td role="cell" className="reports-row-refunds"><span className="reports-cell-label" aria-hidden="true">Refunds</span>
          {formatInrMinor(row.completedRefundMinor)}<small>Completed · {row.completedRefunds} records</small><small>{formatInrMinor(row.pendingRefundMinor)} pending</small>
        </td>
        <td role="cell" className="reports-row-breakdown"><details><summary>View breakdown</summary>
          <dl><dt>Booking ID</dt><dd>{row.id}</dd><dt>Quoted supplier cost</dt><dd>{formatInrMinor(row.supplierMinor)}</dd><dt>Pending refund records</dt><dd>{row.pendingRefunds}</dd>{row.parentOrderId && <><dt>Original booking ID</dt><dd>{row.parentOrderId}</dd></>}</dl>
          <p>Recorded quote cost is not final supplier settlement or net profit.</p><Link href="/operations">Open authorised operations workspace</Link>
        </details></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
