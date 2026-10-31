"use client";
import { useEffect, useId, useState } from "react";
export default function AdminRecordPicker({
  kind,
  name,
  required = false,
}: {
  kind: "company" | "payment";
  name: string;
  required?: boolean;
}) {
  const id = useId(),
    [q, setQ] = useState(""),
    [records, setRecords] = useState<
      { id: string; label: string; amount_minor?: string }[]
    >([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    const c = new AbortController(),
      timer = setTimeout(() => {
        fetch("/api/admin/lookups?" + new URLSearchParams({ kind, q }), {
          cache: "no-store",
          signal: c.signal,
        })
          .then(async (r) => {
            const data = await r.json();
            if (!r.ok) throw Error(data.error ?? "Lookup unavailable.");
            if (c.signal.aborted) return;
            setRecords(data.records);
            setMore(data.hasMore);
            setError("");
            setLoaded(q);
          })
          .catch((e) => {
            if (!c.signal.aborted) {
              setError(e instanceof Error ? e.message : "Lookup unavailable.");
              setLoaded(q);
            }
          });
      }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [kind, q]);
  const loading = loaded !== q;
  return (
    <div className="ops-picker">
      <label htmlFor={id + "-search"}>
        {kind === "company"
          ? "Find a corporate company (optional)"
          : "Find a captured payment"}
      </label>
      <input
        id={id + "-search"}
        value={q}
        maxLength={100}
        placeholder={
          kind === "company"
            ? "Search company name"
            : "Search booking reference"
        }
        onChange={(e) => {
          setQ(e.target.value);
          setSelected("");
        }}
      />
      <label htmlFor={id + "-select"}>
        {kind === "company" ? "Pricing audience" : "Captured payment record"}
      </label>
      <select
        id={id + "-select"}
        name={name}
        required={required}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={loading || Boolean(error)}
      >
        <option value="">
          {loading
            ? "Loading matches…"
            : kind === "company"
              ? "Public customers (no specific company)"
              : "Select a captured payment"}
        </option>
        {records.map((r) => (
          <option value={r.id} key={r.id}>
            {r.label}
            {r.amount_minor
              ? " · ₹" + (Number(r.amount_minor) / 100).toLocaleString("en-IN")
              : ""}
          </option>
        ))}
      </select>
      {error && <p role="status">{error}</p>}
      {more && (
        <small>
          Showing 30 matches. Refine the search to find another record.
        </small>
      )}
      {!loading && !error && !records.length && (
        <small>
          No matching{" "}
          {kind === "company" ? "approved companies" : "captured payments"}. Try
          another search.
        </small>
      )}
    </div>
  );
}

export function PricingAudience() {
  const [audience, setAudience] = useState("PUBLIC");
  return (
    <div className="ops-picker">
      <label>
        Pricing audience
        <select
          name="audience"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        >
          <option value="PUBLIC">Public customers</option>
          <option value="COMPANY">A specific company</option>
        </select>
      </label>
      {audience === "COMPANY" && (
        <AdminRecordPicker kind="company" name="company" required />
      )}
    </div>
  );
}
