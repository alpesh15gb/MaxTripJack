"use client";
import { useState } from "react";
type Health = {
  workers?: { name: string; last_seen: string; healthy: boolean }[];
  crm?: { pending: number; exhausted: number };
  notifications?: { pending: number; exhausted: number };
  bookingJobs?: { state: string; count: number }[];
  walletBalance?: number;
  creditBalance?: number;
  totalBalance?: number;
  totalOutStanding?: number;
  checkedAt?: string;
};
const label = (s: string) => s.replaceAll("_", " ").toLowerCase();
const count = (n: unknown) =>
  Number.isSafeInteger(n) ? Number(n).toLocaleString("en-IN") : "Unavailable";
const money = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(n)
    : "Unavailable";
const date = (s: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
export default function OperationsHealth({
  wallet = false,
}: {
  wallet?: boolean;
}) {
  const [result, setResult] = useState<Health | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="white-card operations-health">
      <h2>
        {wallet ? "Prepaid booking wallet" : "Worker and delivery health"}
      </h2>
      <p className="muted">
        {wallet
          ? "Read the current supplier balance before processing bookings. This check does not add funds or change credit."
          : "Check worker activity and queues that need operational attention."}
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch(
                wallet ? "/api/admin/wallet" : "/api/admin/system",
                { cache: "no-store" },
              ),
              data = await r.json();
            if (!r.ok) throw Error(data.error);
            setResult(data);
          } catch (e) {
            setResult(null);
            setMessage(
              e instanceof Error
                ? e.message
                : "Health information is unavailable.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Checking…"
          : wallet
            ? "Check supplier wallet"
            : "Check worker health"}
      </button>
      {result &&
        (wallet ? (
          <>
            <dl className="ops-detail-grid">
              {[
                ["Wallet balance", result.walletBalance],
                ["Credit balance", result.creditBalance],
                ["Total balance", result.totalBalance],
                ["Outstanding", result.totalOutStanding],
              ].map(([name, value]) => (
                <div key={String(name)}>
                  <dt>{String(name)}</dt>
                  <dd>{money(value)}</dd>
                </div>
              ))}
            </dl>
            {result.checkedAt && (
              <p className="ops-muted">Checked {date(result.checkedAt)} IST</p>
            )}
          </>
        ) : (
          <>
            <dl className="ops-detail-grid">
              <div>
                <dt>CRM delivery pending</dt>
                <dd>{count(result.crm?.pending)}</dd>
              </div>
              <div>
                <dt>CRM delivery exhausted</dt>
                <dd>{count(result.crm?.exhausted)}</dd>
              </div>
              <div>
                <dt>Customer emails pending</dt>
                <dd>{count(result.notifications?.pending)}</dd>
              </div>
              <div>
                <dt>Email retries exhausted</dt>
                <dd>{count(result.notifications?.exhausted)}</dd>
              </div>
            </dl>
            <h3>Worker activity</h3>
            {result.workers?.length ? (
              <ul className="ops-worker-list">
                {result.workers.map((w) => (
                  <li key={w.name}>
                    <strong>{label(w.name)}</strong>
                    <span>
                      {w.healthy ? "Healthy" : "Needs attention"} ·{" "}
                      {date(w.last_seen)} IST
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ops-muted">
                No worker heartbeat is recorded. Check the worker deployment
                before processing bookings.
              </p>
            )}
            <h3>Booking jobs</h3>
            {result.bookingJobs?.length ? (
              <ul className="ops-worker-list">
                {result.bookingJobs.map((j) => (
                  <li key={j.state}>
                    <span>{label(j.state)}</span>
                    <strong>{count(j.count)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ops-muted">No booking jobs are recorded.</p>
            )}
          </>
        ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
