"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import type { Resource } from "@/lib/admin-resources";
import { adminDesks, adminDeskPermissions } from "@/lib/admin-navigation";
import OperationsAction, {
  actionTitle,
  type OpsAction,
  type OpsRow,
  type PendingOperation,
} from "./operations-action";
import OperationsHealth from "./operations-health";
import NotificationOperations from "./notification-operations";
import "@/app/operations-experience.css";

type Context = { userId: string; name: string; permissions: string[] };
const headings: Record<Resource, string> = {
  bookings: "Booking journeys",
  companies: "Corporate accounts",
  pricing: "Pricing rules",
  cancellations: "Cancellation requests",
  payments: "Payments",
  refunds: "Refunds",
  sync: "CRM & delivery",
  audit: "Activity history",
};
const guidance: Record<Resource, string> = {
  bookings:
    "Follow payment, supplier confirmation and after-sales work from one reference.",
  companies:
    "Manage one verified login per company and keep account access current.",
  pricing: "Review the price rules used for public and corporate bookings.",
  cancellations:
    "Review the request, publish the offer and follow the accepted supplier outcome.",
  payments: "Reconcile existing payments and recover uncertain orders safely.",
  refunds:
    "Follow each refund from reservation through approval to gateway confirmation.",
  sync: "Review CRM delivery and the workers behind booking operations.",
  audit: "See who changed a record, what happened and when.",
};
const statuses: Partial<Record<Resource, string[]>> = {
  bookings: [
    "PAYMENT_PENDING",
    "PAYMENT_VERIFIED",
    "BOOKING_PENDING",
    "MANUAL_REVIEW",
    "PAID",
    "TICKETED",
    "CONFIRMED",
    "BOOKING_FAILED",
    "CANCELLED",
    "CLOSED",
  ],
  companies: ["APPROVED", "SUSPENDED"],
  payments: ["CREATED", "CAPTURED", "FAILED", "ORDER_UNKNOWN"],
  cancellations: [
    "FOLLOW_UP_REQUIRED",
    "REQUESTED",
    "UNDER_REVIEW",
    "AWAITING_ACCEPTANCE",
    "ACCEPTED",
    "SUPPLIER_PENDING",
    "CONFIRMED",
    "REJECTED",
    "MANUAL_REVIEW",
  ],
  refunds: [
    "REQUESTED",
    "APPROVED",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "MANUAL_REVIEW",
  ],
};
export function human(value: unknown) {
  return String(value ?? "—")
    .replace(/[_.]/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
function money(value: unknown) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isSafeInteger(n)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(n / 100)
    : "Amount unavailable";
}
function date(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d)
    : "—";
}
function today() {
  const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()),
    get = (key: string) => p.find((x) => x.type === key)!.value;
  return get("year") + "-" + get("month") + "-" + get("day");
}
function text(value: unknown) {
  return value == null || value === ""
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
function columns(tab: Resource): [string, string][] {
  switch (tab) {
    case "bookings":
      return [
        ["reference", "Booking reference"],
        ["product", "Service"],
        ["status", "Progress"],
        ["total_minor", "Customer total"],
        ["created_at", "Created (IST)"],
      ];
    case "companies":
      return [
        ["name", "Company"],
        ["gst_number", "GSTIN"],
        ["status", "Access"],
        ["created_at", "Created (IST)"],
      ];
    case "pricing":
      return [
        ["product", "Service"],
        ["company_name", "Audience"],
        ["markup_minor", "Fixed markup"],
        ["markup_basis_points", "Markup %"],
        ["service_fee_minor", "Service fee"],
        ["active", "Enabled"],
      ];
    case "cancellations":
      return [
        ["reference", "Booking reference"],
        ["status", "Progress"],
        ["supplier_status", "Supplier progress"],
        ["last_checked_at", "Last checked (IST)"],
        ["next_check", "Next check (IST)"],
        ["follow_up_required_at", "Follow-up required since (IST)"],
        ["is_partial", "Scope"],
        ["reason", "Customer reason"],
        ["created_at", "Requested (IST)"],
      ];
    case "payments":
      return [
        ["reference", "Booking reference"],
        ["status", "Progress"],
        ["amount_minor", "Payment amount"],
        ["gateway_payment_id", "Gateway reference"],
        ["created_at", "Created (IST)"],
      ];
    case "refunds":
      return [
        ["reference", "Booking reference"],
        ["status", "Progress"],
        ["amount_minor", "Refund amount"],
        ["reason", "Reason"],
        ["created_at", "Requested (IST)"],
      ];
    case "sync":
      return [
        ["event_type", "Event"],
        ["aggregate_id", "Booking record"],
        ["attempts", "Attempts"],
        ["delivered_at", "Delivered (IST)"],
        ["next_attempt", "Next attempt (IST)"],
      ];
    case "audit":
      return [
        ["action", "Activity"],
        ["actor_id", "Staff record"],
        ["entity_id", "Related record"],
        ["created_at", "Recorded (IST)"],
      ];
  }
}
function display(key: string, row: OpsRow) {
  if (key === "follow_up_required_at") return row.status === "SUPPLIER_PENDING" && row[key] ? "Staff follow-up required" : "—";
  if (key === "check_error") return row[key] === "SUPPLIER_UNAVAILABLE" ? "Supplier unavailable; automatic checks continue" : row[key] === "AMENDMENT_REFERENCE_UNAVAILABLE" ? "Supplier reference needs staff reconciliation" : row[key] === "UNKNOWN_STATUS" ? "Supplier status needs review" : "—";
  if (key.endsWith("_minor")) return money(row[key]);
  if (key.endsWith("_at") || ["next_attempt", "next_check"].includes(key))
    return date(row[key]);
  if (key === "status")
    return (
      <span
        className={"ops-status ops-status-" + String(row.status).toLowerCase()}
      >
        {human(row.status)}
      </span>
    );
  if (key === "is_partial")
    return row.is_partial ? "Selected travellers / items" : "Whole booking";
  if (key === "active") return row.active ? "Enabled" : "Disabled";
  if (key === "markup_basis_points")
    return String(Number(row[key] ?? 0) / 100) + "%";
  if (key === "company_name")
    return row.company_name ? text(row.company_name) : "Public customers";
  if (["product", "event_type", "action"].includes(key)) return human(row[key]);
  return text(row[key]);
}
function actionsFor(
  tab: Resource,
  row: OpsRow | undefined,
  permissions: string[],
): OpsAction[] {
  const can = (p: string) => permissions.includes(p);
  if (!row)
    return tab === "companies"
      ? ["company-create"]
      : tab === "pricing"
        ? ["pricing-create"]
        : tab === "refunds"
          ? ["refund-request"]
          : [];
  switch (tab) {
    case "bookings":
      return [
        ...(can("bookings:reconcile") ? ["supplier-check" as const] : []),
        ...(can("payments:manage") && row.status === "PAYMENT_PENDING"
          ? ["payment-recover" as const]
          : []),
      ];
    case "companies":
      return ["company-update"];
    case "payments":
      return [
        ...(can("payments:manage") ? ["payment-check" as const] : []),
        ...(can("refunds:manage") && row.status === "CAPTURED"
          ? ["refund-request" as const]
          : []),
      ];
    case "cancellations":
      return [
        ...(["REQUESTED", "UNDER_REVIEW", "AWAITING_ACCEPTANCE"].includes(
          String(row.status),
        )
          ? [
              "cancellation-review" as const,
              "cancellation-charges" as const,
              "cancellation-offer" as const,
            ]
          : []),
        ...(can("cancellations:execute")
          ? ["cancellation-execute" as const]
          : []),
      ];
    case "refunds":
      return [
        ...(can('refunds:execute')&&row.provider==='PAYGLOCAL'&&row.status==='PROCESSING'&&Boolean(row.gateway_refund_id)?['refund-settle' as const]:[]),
        ...(row.status === "REQUESTED" ? ["refund-approve" as const] : []),
        ...(can("refunds:execute") &&
        ["APPROVED", "PROCESSING", "MANUAL_REVIEW"].includes(String(row.status))
          ? ["refund-execute" as const]
          : []),
      ];
    case "sync":
      return !row.delivered_at ? ["sync-retry"] : [];
    default:
      return [];
  }
}

export default function OperationsConsole() {
  const router = useRouter(),
    params = useSearchParams(),
    [context, setContext] = useState<Context | null>(null),
    [accessError, setAccessError] = useState(""),
    [accessReload, setAccessReload] = useState(0),
    [rows, setRows] = useState<OpsRow[]>([]),
    [total, setTotal] = useState<number | null>(null),
    [more, setMore] = useState(false),
    [refresh, setRefresh] = useState(0),
    [loaded, setLoaded] = useState(""),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false),
    [detail, setDetail] = useState<OpsRow | null>(null),
    [action, setAction] = useState<{
      name: OpsAction;
      row?: OpsRow;
      restore?: PendingOperation;
    } | null>(null),
    [exporting, setExporting] = useState(false),
    [pending, setPending] = useState<PendingOperation | null>(null);
  const details = useRef<HTMLDialogElement>(null),
    exportDialog = useRef<HTMLDialogElement>(null),
    activeActor = useRef("");
  const desks = adminDesks.filter((name) =>
      context?.permissions.includes(adminDeskPermissions[name]),
    ),
    requested = params.get("desk"),
    tab = (desks.includes(requested as Resource) ? requested : desks[0]) as
      | Resource
      | undefined,
    page = Math.min(
      10000,
      Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1),
    ),
    q = params.get("q") ?? "",
    status = params.get("status") ?? "",
    key = [context?.userId, tab, page, q, status, refresh].join(":"),
    loading = key !== loaded;
  useEffect(() => {
    const c = new AbortController();
    let generation = 0;
    async function load() {
      const own = ++generation;
      try {
        const r = await fetch("/api/admin/context", {
            cache: "no-store",
            signal: c.signal,
          }),
          data = await r.json();
        if (!r.ok)
          throw Error(data.error ?? "Operations access could not be verified.");
        if (c.signal.aborted || own !== generation) return;
        if (!Array.isArray(data.permissions))
          throw Error("The access response was incomplete.");
        if (activeActor.current !== data.userId) {
          setDetail(null);
          setAction(null);
          setPending(null);
          activeActor.current = data.userId;
        }
        setContext(data);
        setAccessError("");
        try {
          const raw = sessionStorage.getItem(
            "maxtravel:ops:pending:" + data.userId,
          );
          if (raw) {
            const item = JSON.parse(raw) as PendingOperation;
            if (
              item.command?.path?.startsWith("/api/admin/") &&
              typeof item.requestId === "string"
            )
              setPending(item);
          } else setPending(null);
        } catch {}
      } catch (e) {
        if (!c.signal.aborted && own === generation) {
          setContext(null);
          setAccessError(
            e instanceof Error
              ? e.message
              : "Access verification is unavailable.",
          );
        }
      }
    }
    void load();
    const focus = () => void load(),
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void load();
      }, 60000);
    window.addEventListener("focus", focus);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [accessReload]);

  useEffect(() => {
    if (!tab) return;
    const c = new AbortController(),
      query = new URLSearchParams({ page: String(page), q, status });
    fetch(`/api/admin/${tab}?${query}`, { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error ?? "Records could not be loaded.");
        if (!Array.isArray(data.rows))
          throw Error("The register response was incomplete.");
        if (c.signal.aborted) return;
        setRows(data.rows);
        setTotal(Number.isSafeInteger(data.total) ? data.total : null);
        setMore(Boolean(data.hasMore));
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setRows([]);
          setTotal(null);
          setError(e instanceof Error ? e.message : "Records are unavailable.");
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoaded(key);
      });
    return () => c.abort();
  }, [tab, page, q, status, key]);
  useEffect(() => {
    if (!detail) return;
    const trigger = document.activeElement as HTMLElement | null;
    details.current?.showModal();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [detail]);
  useEffect(() => {
    if (!exporting) return;
    const trigger = document.activeElement as HTMLElement | null;
    exportDialog.current?.showModal();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [exporting]);
  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes))
      if (v) next.set(k, v);
      else next.delete(k);
    router.push("/operations?" + next);
  }
  function openAction(name: OpsAction, row?: OpsRow) {
    if (pending) {
      setAction({ name: pending.action, row: pending.row, restore: pending });
      return;
    }
    setDetail(null);
    setAction({ name, row });
  }
  const closeAction = () => {
    setAction(null);
    if (context)
      try {
        const raw = sessionStorage.getItem(
          "maxtravel:ops:pending:" + context.userId,
        );
        setPending(raw ? JSON.parse(raw) : null);
      } catch {}
  };
  if (!context)
    return (
      <main className="operations-access">
        <Link href="/">Max Travel</Link>
        <p className="ops-eyebrow">Private staff workspace</p>
        <h1>Operations workspace</h1>
        <section className="white-card" role="status">
          <h2>
            {accessError
              ? "Operations access required"
              : "Checking your workspace…"}
          </h2>
          <p>
            {accessError ||
              "Checking your verified account, authenticator and staff permissions."}
          </p>
          {accessError && (
            <>
              <Link className="primary" href="/account">
                Account & security
              </Link>
              <button
                className="secondary"
                onClick={() => setAccessReload((n) => n + 1)}
              >
                Retry access check
              </button>
            </>
          )}
        </section>
      </main>
    );
  return (
    <div className="operations-shell ops-workspace">
      <a className="operations-skip" href="#operations-main">
        Skip to workspace
      </a>
      <aside className="operations-sidebar">
        <div className="ops-brand-row">
          <Link className="operations-brand" href="/">
            <BrandLogo variant="operations"/>
          </Link>
          <button
            className="ops-menu-toggle"
            aria-expanded={menu}
            aria-controls="ops-navigation"
            onClick={() => setMenu((v) => !v)}
          >
            Menu
          </button>
        </div>
        <div
          id="ops-navigation"
          className={"ops-nav-body " + (menu ? "ops-nav-open" : "")}
        >
          <p className="ops-nav-caption">OPERATIONS WORKSPACE</p>
          <nav aria-label="Operations desks">
            {desks.map((name) => (
              <Link
                key={name}
                href={"/operations?desk=" + name}
                aria-current={name === tab ? "page" : undefined}
                className={name === tab ? "selected-desk" : ""}
                onClick={() => setMenu(false)}
              >
                {headings[name]}
              </Link>
            ))}
          </nav>
          {context.permissions.includes("finance:read") && (
            <>
              <Link href="/operations/reports">Booking reports ↗</Link>
              <Link href="/operations/visibility">
                Visibility & measurement ↗
              </Link>
            </>
          )}
          <Link href="/account">Account & security ↗</Link>
          <div className="ops-staff">
            <strong>{context.name}</strong>
            <small>Verified staff access · India time</small>
          </div>
        </div>
      </aside>
      <main id="operations-main" className="operations-main" tabIndex={-1}>
        {!tab ? (
          <div className="white-card">
            <h1>No desks assigned</h1>
            <p>
              Ask your administrator to assign the staff permissions needed for
              your work.
            </p>
          </div>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="ops-eyebrow">Staff workspace</div>
                <h1>{headings[tab]}</h1>
                <p>{guidance[tab]}</p>
              </div>
              <div className="ops-heading-actions">
                <button
                  className="secondary"
                  disabled={loading}
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  {loading ? "Refreshing…" : "Refresh records"}
                </button>
                {actionsFor(tab, undefined, context.permissions).map((name) => (
                  <button
                    className="primary"
                    key={name}
                    onClick={() => openAction(name)}
                  >
                    {actionTitle(name)}
                  </button>
                ))}
              </div>
            </div>
            {pending && (
              <section className="ops-pending" role="status">
                <strong>A previous request needs review.</strong>
                <p>
                  Its original request reference and details are retained for a
                  safe retry.
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    setAction({
                      name: pending.action,
                      row: pending.row,
                      restore: pending,
                    })
                  }
                >
                  Review previous request
                </button>
              </section>
            )}
            <div className="ops-register-bar">
              <form
                key={tab + q + status}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  navigate({
                    q: String(f.get("q") ?? ""),
                    status: String(f.get("status") ?? ""),
                    page: "1",
                  });
                }}
              >
                <label>
                  <span>Find a record</span>
                  <input
                    name="q"
                    maxLength={100}
                    defaultValue={q}
                    placeholder={
                      tab === "companies"
                        ? "Company, GSTIN or reference"
                        : "Booking reference or record ID"
                    }
                  />
                </label>
                {statuses[tab] && (
                  <label>
                    <span>Progress</span>
                    <select name="status" defaultValue={status}>
                      <option value="">All states</option>
                      {statuses[tab]!.map((s) => (
                        <option key={s} value={s}>
                          {human(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="secondary">Apply filters</button>
                {(q || status) && (
                  <Link className="ops-clear" href={"/operations?desk=" + tab}>
                    Clear
                  </Link>
                )}
              </form>
              <button className="secondary" onClick={() => setExporting(true)}>
                Export view
              </button>
            </div>
            <div className="ops-register-caption">
              <p>
                {total === null
                  ? loading
                    ? "Loading matching records…"
                    : `${rows.length} records loaded`
                  : `${total.toLocaleString("en-IN")} matching records`}
                <span> · {headings[tab]} · Dates shown in IST</span>
              </p>
              <span className="ops-muted">
                Open a record for its details and permitted actions.
              </span>
            </div>
            {loading ? (
              <section className="operations-loading" role="status">
                <strong>Loading {headings[tab].toLowerCase()}…</strong>
                <p>Checking the current authorised register.</p>
              </section>
            ) : error ? (
              <section className="white-card" role="status">
                <h2>Records are unavailable</h2>
                <p>{error}</p>
                <button
                  className="secondary"
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  Retry records
                </button>
                <Link href="/account">Account & security</Link>
              </section>
            ) : rows.length ? (
              <div
                className="operations-table-wrap ops-register"
                role="region"
                aria-label={`${tab} records`}
                tabIndex={0}
              >
                <table className="operations-table">
                  <caption className="sr-only">
                    {headings[tab]} · Page {page}
                  </caption>
                  <thead>
                    <tr>
                      {columns(tab).map(([name, label]) => (
                        <th key={name} scope="col">
                          {label}
                        </th>
                      ))}
                      <th scope="col">Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={text(row.id ?? index)}>
                        {columns(tab).map(([name, label], i) => (
                          <td key={name} data-label={label}>
                            {i === 0 ? (
                              <button
                                className="ops-record-link"
                                onClick={() => setDetail(row)}
                              >
                                {display(name, row)}
                              </button>
                            ) : (
                              display(name, row)
                            )}
                          </td>
                        ))}
                        <td data-label="Record">
                          <button
                            className="secondary"
                            onClick={() => setDetail(row)}
                          >
                            Open record →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <section className="empty-card">
                <h2>No records to show.</h2>
                <p>
                  {q || status
                    ? "Try another reference or clear the filters."
                    : "Records appear here as accounts and bookings are created."}
                </p>
                {(q || status) && (
                  <Link className="secondary" href={"/operations?desk=" + tab}>
                    Clear filters
                  </Link>
                )}
              </section>
            )}
            <div className="operations-pagination">
              <button
                className="secondary"
                disabled={page === 1 || loading}
                onClick={() => navigate({ page: String(page - 1) })}
              >
                ← Previous
              </button>
              <span>
                Page {page}
                {total !== null
                  ? " of " + Math.max(1, Math.ceil(total / 50))
                  : ""}
              </span>
              <button
                className="secondary"
                disabled={!more || loading}
                onClick={() => navigate({ page: String(page + 1) })}
              >
                Next →
              </button>
            </div>
            {((tab === "bookings" &&
              context.permissions.includes("finance:read")) ||
              tab === "sync") && (
              <details className="ops-support-tools">
                <summary>
                  {tab === "sync"
                    ? "Worker health & customer delivery"
                    : "Supplier wallet"}
                </summary>
                {tab === "sync" ? (
                  <>
                    <OperationsHealth />
                    <NotificationOperations />
                  </>
                ) : (
                  <OperationsHealth wallet />
                )}
              </details>
            )}
          </>
        )}
      </main>
      {detail && tab && (
        <dialog
          className="ops-dialog"
          ref={details}
          aria-labelledby="ops-record-title"
          onClose={() => setDetail(null)}
          onCancel={() => setDetail(null)}
        >
          <header>
            <div>
              <span className="ops-eyebrow">{headings[tab]}</span>
              <h2 id="ops-record-title">
                {text(detail.reference ?? detail.name ?? detail.id)}
              </h2>
            </div>
            <button
              className="secondary"
              aria-label="Close record"
              onClick={() => setDetail(null)}
            >
              ×
            </button>
          </header>
          <dl className="ops-detail-grid">
            {columns(tab).map(([name, label]) => (
              <div key={name}>
                <dt>{label}</dt>
                <dd>{display(name, detail)}</dd>
              </div>
            ))}
          </dl>
          {actionsFor(tab, detail, context.permissions).length > 0 && (
            <section className="ops-record-actions">
              <h3>Next action</h3>
              {actionsFor(tab, detail, context.permissions).map((name) => (
                <button
                  className="secondary"
                  key={name}
                  onClick={() => openAction(name, detail)}
                >
                  {actionTitle(name)} →
                </button>
              ))}
            </section>
          )}
          <details className="ops-technical">
            <summary>Record references & additional details</summary>
            <dl>
              {Object.entries(detail).map(([name, value]) => (
                <div key={name}>
                  <dt>{human(name)}</dt>
                  <dd>
                    {typeof value === "object" && value !== null ? (
                      <pre>{JSON.stringify(value, null, 2)}</pre>
                    ) : (
                      text(value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <button className="secondary" onClick={() => setDetail(null)}>
            Close record
          </button>
        </dialog>
      )}
      {action && (
        <OperationsAction
          key={action.name + String(action.row?.id ?? "new")}
          action={action.name}
          row={action.row}
          actorId={context.userId}
          restore={action.restore}
          onClose={closeAction}
          onSaved={() => {
            setRefresh((n) => n + 1);
            setPending(null);
          }}
        />
      )}
      {exporting && tab && (
        <dialog
          ref={exportDialog}
          className="ops-dialog"
          aria-labelledby="ops-export-title"
          onClose={() => setExporting(false)}
          onCancel={() => setExporting(false)}
        >
          <header>
            <h2 id="ops-export-title">Export {headings[tab].toLowerCase()}</h2>
            <button
              className="secondary"
              aria-label="Close export"
              onClick={() => setExporting(false)}
            >
              ×
            </button>
          </header>
          <p>
            Exports use the current search and progress filters. Choose the
            record creation period in India time, including both dates.
          </p>
          <form action={`/api/admin/export/${tab}`} method="get">
            <input type="hidden" name="q" value={q} />
            <input type="hidden" name="status" value={status} />
            <label>
              From
              <input name="from" type="date" required max={today()} />
            </label>
            <label>
              To
              <input
                name="to"
                type="date"
                required
                max={today()}
                defaultValue={today()}
              />
            </label>
            <p className="ops-muted">
              Up to 5,000 complete matching rows per export. Amount columns
              ending in “minor” contain paise; timestamps are UTC. Narrow the
              period if the limit is exceeded.
            </p>
            <button className="primary">Download CSV</button>
          </form>
        </dialog>
      )}
    </div>
  );
}
