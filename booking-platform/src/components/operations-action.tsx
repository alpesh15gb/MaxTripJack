"use client";
import { useEffect, useRef, useState } from "react";
import AdminRecordPicker, { PricingAudience } from "./admin-record-picker";
export type OpsRow = Record<string, unknown>;
export type OpsAction =
  | "company-create"
  | "company-update"
  | "pricing-create"
  | "supplier-check"
  | "payment-recover"
  | "payment-check"
  | "cancellation-review"
  | "cancellation-charges"
  | "cancellation-offer"
  | "cancellation-execute"
  | "refund-request"
  | "refund-approve"
  | "refund-execute"
  | "sync-retry";
type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string;
  options?: [string, string][];
  hint?: string;
  min?: number;
  max?: number;
  minLength?: number;
};
const spec: Record<OpsAction, { title: string; help: string; button: string }> =
  {
    "company-create": {
      title: "Approve a company account",
      help: "Link one existing, verified account with authenticator protection to the company.",
      button: "Approve company account",
    },
    "company-update": {
      title: "Update company access",
      help: "Check the verified login and current company details before saving.",
      button: "Save company access",
    },
    "pricing-create": {
      title: "Publish a pricing rule",
      help: "Review fixed markup, percentage and service fee. Choose an approved company for corporate pricing.",
      button: "Publish pricing rule",
    },
    "supplier-check": {
      title: "Check supplier booking status",
      help: "Reconcile the existing booking with TripJack. A check does not create a second booking.",
      button: "Check existing booking",
    },
    "payment-recover": {
      title: "Recover an uncertain gateway order",
      help: "Use the existing Razorpay order. Its receipt, currency and amount are verified before linking.",
      button: "Verify and link order",
    },
    "payment-check": {
      title: "Check captured payment",
      help: "Compare this payment with Razorpay before taking further action.",
      button: "Reconcile payment",
    },
    "cancellation-review": {
      title: "Review cancellation request",
      help: "Record your review. Supplier cancellation and returning the money are separate actions.",
      button: "Save cancellation review",
    },
    "cancellation-charges": {
      title: "Check supplier cancellation charges",
      help: "Retrieve the current supplier charges for this request before preparing an offer.",
      button: "Check supplier charges",
    },
    "cancellation-offer": {
      title: "Publish a cancellation offer",
      help: "The customer reviews and accepts this offer before supplier cancellation. Refund plus retained charges must equal the remaining booking value.",
      button: "Publish customer offer",
    },
    "cancellation-execute": {
      title: "Submit or check supplier cancellation",
      help: "Requires the accepted offer and current supplier eligibility. Confirmation appears only after the supplier outcome is known.",
      button: "Submit / check cancellation",
    },
    "refund-request": {
      title: "Request a customer refund",
      help: "Reserve an eligible amount against a captured payment. The request reference is generated once and retained for retries.",
      button: "Reserve refund amount",
    },
    "refund-approve": {
      title: "Approve a refund",
      help: "Review the request and original payment. High-value refunds require a different authorised reviewer.",
      button: "Approve refund",
    },
    "refund-execute": {
      title: "Execute or reconcile gateway refund",
      help: "Use the approved refund request. Reconciliation keeps an uncertain gateway outcome attached to the same request.",
      button: "Execute / reconcile refund",
    },
    "sync-retry": {
      title: "Retry CRM delivery",
      help: "Retry this undelivered event. Delivered and actively leased events cannot be retried here.",
      button: "Retry this event",
    },
  };
export const actionTitle = (action: OpsAction) => spec[action].title;
function fields(action: OpsAction, row?: OpsRow): Field[] {
  switch (action) {
    case "company-create":
    case "company-update":
      return [
        {
          name: "name",
          label: "Company name",
          value: String(row?.name ?? ""),
          minLength: 2,
        },
        {
          name: "email",
          label: "Existing verified login email",
          type: "email",
          value: String(row?.email ?? ""),
        },
        {
          name: "gst",
          label: "GSTIN (optional)",
          value: String(row?.gst_number ?? ""),
        },
        ...(action === "company-update"
          ? [
              {
                name: "status",
                label: "Account access",
                value: String(row?.status ?? "APPROVED"),
                options: [
                  ["APPROVED", "Approved"],
                  ["SUSPENDED", "Suspended"],
                ] as [string, string][],
              },
            ]
          : []),
      ];
    case "pricing-create":
      return [
        {
          name: "product",
          label: "Service",
          options: [
            ["FLIGHT", "Flights"],
            ["HOTEL", "Hotels"],
          ],
        },
        {
          name: "company",
          label: "Company reference (optional)",
          hint: "Leave blank for public pricing.",
        },
        {
          name: "markup",
          label: "Fixed markup (₹)",
          type: "number",
          value: "0",
          min: 0,
        },
        {
          name: "percentage",
          label: "Percentage markup (%)",
          type: "number",
          value: "0",
          min: 0,
          max: 100,
        },
        {
          name: "fee",
          label: "Service fee (₹)",
          type: "number",
          value: "0",
          min: 0,
        },
      ];
    case "payment-recover":
      return [
        {
          name: "gateway",
          label: "Existing Razorpay order ID",
          value: String(row?.gateway_order_id ?? ""),
          hint: "Copy the existing order reference from Razorpay; this does not create a new order.",
        },
      ];
    case "cancellation-review":
      return [
        {
          name: "status",
          label: "Review decision",
          options: [
            ["UNDER_REVIEW", "Under review"],
            ["REJECTED", "Reject request"],
          ],
        },
        { name: "note", label: "Review note", minLength: 3 },
      ];
    case "cancellation-offer":
      return [
        {
          name: "refund",
          label: "Customer refund offered (₹)",
          type: "number",
          min: 0,
        },
        {
          name: "penalty",
          label: "Retained charges / remaining value (₹)",
          type: "number",
          min: 0,
        },
        { name: "note", label: "Offer explanation", minLength: 5 },
      ];
    case "refund-request":
      return [
        {
          name: "payment",
          label: "Captured payment record",
          value: String(row?.id ?? ""),
          hint: "Select a captured payment in Payments to start this request.",
        },
        { name: "amount", label: "Refund amount (₹)", type: "number", min: 1 },
        { name: "reason", label: "Reason for refund", minLength: 3 },
      ];
    default:
      return [];
  }
}
function minor(value: FormDataEntryValue | null) {
  const s = String(value ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw Error("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = s.split("."),
    n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw Error("Amount is too large.");
  return n;
}
type Command = { path: string; body?: unknown };
function command(
  action: OpsAction,
  f: FormData,
  row: OpsRow | undefined,
  id: string,
): Command {
  const value = (name: string) => String(f.get(name) ?? "").trim(),
    record = String(row?.id ?? "");
  switch (action) {
    case "company-create":
    case "company-update":
      return {
        path: "/api/admin/companies",
        body: {
          id: record || id,
          name: value("name"),
          email: value("email"),
          status: action === "company-create" ? "APPROVED" : value("status"),
          ...(value("gst") ? { gstNumber: value("gst").toUpperCase() } : {}),
        },
      };
    case "pricing-create":
      if (value("audience") === "COMPANY" && !value("company"))
        throw Error(
          "Choose an approved company before publishing corporate pricing.",
        );
      return {
        path: "/api/admin/pricing",
        body: {
          id,
          product: value("product"),
          companyId: value("company") || null,
          markupMinor: minor(f.get("markup")),
          basisPoints: minor(f.get("percentage")),
          serviceFeeMinor: minor(f.get("fee")),
        },
      };
    case "supplier-check":
      return { path: `/api/admin/bookings/${record}/reconcile`, body: {} };
    case "payment-recover":
      return {
        path: "/api/admin/payments/recover",
        body: {
          bookingId: String(row?.order_id ?? record),
          gatewayOrderId: value("gateway"),
        },
      };
    case "payment-check":
      return { path: `/api/admin/payments/${record}/reconcile`, body: {} };
    case "cancellation-review":
      return {
        path: "/api/admin/cancellations",
        body: { id: record, status: value("status"), note: value("note") },
      };
    case "cancellation-charges":
      return { path: `/api/admin/cancellations/${record}/charges` };
    case "cancellation-offer":
      return {
        path: `/api/admin/cancellations/${record}/offer`,
        body: {
          refundMinor: minor(f.get("refund")),
          penaltyMinor: minor(f.get("penalty")),
          note: value("note"),
        },
      };
    case "cancellation-execute":
      return { path: `/api/admin/cancellations/${record}/execute` };
    case "refund-request":
      if (!value("payment"))
        throw Error("Choose a captured payment before requesting a refund.");
      return {
        path: "/api/admin/refunds",
        body: {
          action: "request",
          id,
          paymentId: value("payment"),
          amountMinor: minor(f.get("amount")),
          reason: value("reason"),
        },
      };
    case "refund-approve":
      return {
        path: "/api/admin/refunds",
        body: { action: "approve", id: record },
      };
    case "refund-execute":
      return { path: `/api/admin/refunds/${record}/execute` };
    case "sync-retry":
      return { path: "/api/admin/sync", body: { id: record } };
  }
}
export type PendingOperation = {
  action: OpsAction;
  row?: OpsRow;
  command: Command;
  requestId: string;
};
export default function OperationsAction({
  action,
  row,
  actorId,
  restore,
  onClose,
  onSaved,
}: {
  action: OpsAction;
  row?: OpsRow;
  actorId: string;
  restore?: PendingOperation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    locked = useRef(false),
    [requestId] = useState(() => restore?.requestId ?? crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Command | null>(restore?.command ?? null),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<OpsRow | null>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => trigger?.focus();
  }, []);
  async function send(request: Command) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    setPending(request);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 35000);
    try {
      try {
        sessionStorage.setItem(
          "maxtravel:ops:pending:" + actorId,
          JSON.stringify({ action, row, command: request, requestId }),
        );
      } catch {}
      const response = await fetch(request.path, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
      });
      const data = await response.json();
      if (response.status >= 500)
        throw Error(data.error ?? "The service could not confirm the outcome.");
      try {
        sessionStorage.removeItem("maxtravel:ops:pending:" + actorId);
      } catch {}
      setPending(null);
      if (!response.ok) {
        setMessage(data.error ?? "This action could not be completed.");
        return;
      }
      setResult(data);
      setMessage(
        data.message ??
          "Update recorded. Review the current status before taking the next action.",
      );
      onSaved();
    } catch (e) {
      setMessage(
        (e instanceof Error ? e.message : "The response was interrupted.") +
          " The outcome is unconfirmed. Retry the same request or review the register before starting another action.",
      );
    } finally {
      clearTimeout(timer);
      locked.current = false;
      setBusy(false);
    }
  }
  const formFields = fields(action, row),
    definition = spec[action];
  return (
    <dialog
      className="ops-dialog"
      ref={dialog}
      aria-labelledby="ops-action-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClose={onClose}
    >
      <header>
        <div>
          <span className="ops-eyebrow">Record action</span>
          <h2 id="ops-action-title">{definition.title}</h2>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onClose}
          aria-label="Close action"
        >
          ×
        </button>
      </header>
      <p>{definition.help}</p>
      {row && (
        <div className="ops-record-context">
          <strong>{String(row.reference ?? row.name ?? row.id)}</strong>
          <span>{String(row.status ?? "").replaceAll("_", " ")}</span>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            void send(
              command(action, new FormData(e.currentTarget), row, requestId),
            );
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Check the form.");
          }
        }}
      >
        <fieldset disabled={busy || Boolean(pending) || Boolean(result)}>
          {formFields.map((field) =>
            field.name === "company" ? (
              <PricingAudience key={field.name} />
            ) : field.name === "payment" && !row ? (
              <AdminRecordPicker
                key={field.name}
                kind="payment"
                name="payment"
                required
              />
            ) : (
              <label key={field.name}>
                {field.label}
                {field.options ? (
                  <select name={field.name} defaultValue={field.value}>
                    {field.options.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={field.name}
                    type={field.type ?? "text"}
                    required={!field.label.includes("optional")}
                    min={field.min}
                    max={field.max}
                    step={field.type === "number" ? "0.01" : undefined}
                    minLength={field.minLength}
                    maxLength={field.name === "gst" ? 15 : 1000}
                    defaultValue={field.value}
                    readOnly={
                      action === "refund-request" &&
                      field.name === "payment" &&
                      Boolean(row)
                    }
                  />
                )}
                {field.hint && <small>{field.hint}</small>}
              </label>
            ),
          )}
          {[
            "cancellation-execute",
            "refund-execute",
            "refund-approve",
            "cancellation-offer",
          ].includes(action) && (
            <label className="ops-confirm">
              <input type="checkbox" required />I have reviewed the policy,
              amount and customer acceptance applicable to this action.
            </label>
          )}
          <button
            className="primary"
            disabled={busy || Boolean(pending) || Boolean(result)}
          >
            {busy ? "Checking outcome…" : definition.button}
          </button>
        </fieldset>
      </form>
      {message && (
        <p className="info-message" role="status">
          {message}
        </p>
      )}
      {pending && !busy && (
        <button className="primary" onClick={() => void send(pending)}>
          Retry the same request
        </button>
      )}
      {result && action === "cancellation-charges" && (
        <div className="ops-action-result">
          <h3>Supplier response</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      {(pending || action === "refund-request") && (
        <p className="ops-muted">
          Request reference: <code>{requestId}</code>. Unconfirmed retry details
          are retained for this staff account in this browser tab.
        </p>
      )}
      {!busy && (
        <button className="secondary" onClick={onClose}>
          {pending ? "Close and review records" : "Close"}
        </button>
      )}
    </dialog>
  );
}
