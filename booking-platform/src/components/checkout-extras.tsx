"use client";

import {useState, useEffect, useMemo, useRef} from "react";
import type {CheckoutChoice, CheckoutSegment} from "@/lib/checkout-extras-contract";
import {displayMoney} from "@/lib/display-money";

type Props = {
  quoteId: string;
  disabled: boolean;
  onPending: (value: boolean) => void;
  onSaved: (total: number) => void;
};
const optionLabels = {BAGGAGE: "Extra baggage", MEAL: "Meal", SEAT: "Seat"} as const;

function sameChoices(a: CheckoutChoice[], b: CheckoutChoice[]) {
  return a.length === b.length && a.every(choice => b.some(other =>
    other.kind === choice.kind && other.segmentId === choice.segmentId
    && other.travellerIndex === choice.travellerIndex && other.code === choice.code));
}

export default function CheckoutExtras({quoteId, disabled, onPending, onSaved}: Props) {
  const mounted = useRef(true);
  const panel = useRef<HTMLElement>(null);
  const [segments, setSegments] = useState<CheckoutSegment[] | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [choices, setChoices] = useState<CheckoutChoice[]>([]);
  const [confirmed, setConfirmed] = useState<CheckoutChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const changed = useMemo(() => choices !== confirmed && !sameChoices(choices, confirmed), [choices, confirmed]);
  const dirty = uncertain || changed;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/travel/checkout-extras?quoteId=${encodeURIComponent(quoteId)}`, {signal: AbortSignal.timeout(15000)});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Extras unavailable.");
      if (!mounted.current) return;
      setSegments(data.segments);
      setTypes(data.travellerTypes);
      setConfirmed(data.choices);
      setChoices(data.choices);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.name === "Error" ? cause.message : "Airline options could not be loaded. Try again or continue without extras.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  function choose(segment: CheckoutSegment, travellerIndex: number, kind: CheckoutChoice["kind"], code: string) {
    const next = choices.filter(choice => {
      if (choice.travellerIndex !== travellerIndex || choice.kind !== kind) return true;
      if (kind === "BAGGAGE") return segments?.find(item => item.id === choice.segmentId)?.tripIndex !== segment.tripIndex;
      return choice.segmentId !== segment.id;
    });
    if (code) next.push({segmentId: segment.id, travellerIndex, kind, code});
    setChoices(next);
    setError("");
    onPending(uncertain || !sameChoices(next, confirmed));
  }

  function discard() {
    if (uncertain || loading) return;
    setChoices(confirmed);
    setError("");
    onPending(false);
    panel.current?.closest("details")?.querySelector("summary")?.focus();
  }

  async function save() {
    setLoading(true);
    setError("");
    let rejected = false;
    try {
      const response = await fetch("/api/travel/checkout-extras", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({quoteId, choices}), signal: AbortSignal.timeout(15000),
      });
      // A validation rejection leaves the last confirmed total intact. A
      // timeout, a conflict with another update, or a broken reply may not.
      rejected = response.status === 400 || response.status === 422;
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not review extras.");
      if (!Number.isSafeInteger(data.totalMinor) || data.totalMinor < 0 || (data.quoteId !== undefined && data.quoteId !== quoteId)) {
        throw Error("The updated total could not be confirmed.");
      }
      if (!mounted.current) return;
      setConfirmed(choices);
      setApplied(true);
      setUncertain(false);
      onSaved(data.totalMinor);
      onPending(false);
    } catch (cause) {
      if (!mounted.current) return;
      if (!rejected) setUncertain(true);
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "The updated total could not be confirmed.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  return <section className="checkout-extras" ref={panel}>
    <h3>Flight extras</h3>
    <p className="muted">Choose extras by traveller. Baggage covers the whole connecting journey.</p>
    {segments === null ? <button type="button" className="secondary" disabled={disabled || loading} onClick={() => void load()}>
      {loading ? "Loading airline options…" : "Choose flight extras"}
    </button> : <>
      <p className="muted">Prices include applicable booking charges. Apply your choices to recheck availability and see the updated total before payment.</p>
      {segments.map(segment => <fieldset disabled={disabled || loading || uncertain} key={segment.id}>
        <legend>{segment.label}</legend>
        {segment.options.some(option => !option.exitRow) ? types.map((type, index) => type === "INFANT" ? null :
          <div className="form-row" key={index}>
            <strong>Traveller {index + 1} · {type.toLowerCase()}</strong>
            {(["BAGGAGE", "MEAL", "SEAT"] as const).map(kind => {
              const options = segment.options.filter(option => option.kind === kind && !option.exitRow);
              if (!options.length) return null;
              const selected = choices.find(choice => choice.segmentId === segment.id && choice.travellerIndex === index && choice.kind === kind);
              return <label key={kind}>{optionLabels[kind]}
                <select value={selected?.code ?? ""} onChange={event => choose(segment, index, kind, event.target.value)}>
                  <option value="">{kind === "SEAT" ? "Airline allocation" : "No extra"}</option>
                  {options.map(option => <option key={option.code} value={option.code}>{option.label} · {option.amountMinor > 0 ? `+${displayMoney(option.amountMinor)}` : "No additional charge"}</option>)}
                </select>
              </label>;
            })}
          </div>) : <p className="muted">No optional extras available for this flight.</p>}
      </fieldset>)}
      {types.includes("INFANT") && <p className="muted">Infants cannot select extras.</p>}
      {segments.some(segment => segment.options.some(option => option.exitRow)) && <p className="muted">Contact support for exit-row seats.</p>}
      {uncertain && <p className="info-message">Check the latest price using Refresh reviewed price, or apply your choices again to confirm the total.</p>}
      {(dirty || applied) && <div className="checkout-extras-actions">
        <button className="secondary" type="button" disabled={disabled || loading || !dirty} onClick={() => void save()}>
          {loading ? "Checking extras…" : dirty ? "Apply extras and update total" : "Extras applied"}
        </button>
        {dirty && !uncertain && <button className="inline-link" type="button" disabled={disabled || loading} onClick={discard}>Discard changes</button>}
      </div>}
    </>}
    {error && <p role="alert" className="info-message">{error}</p>}
  </section>;
}
