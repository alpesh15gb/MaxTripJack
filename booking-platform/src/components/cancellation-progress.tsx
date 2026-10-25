"use client";
import { useEffect, useRef, useState } from "react";

type Offer = { is_partial: boolean; scope?: { trips: { src: string; dest: string; departureDate: string; travellers: { fn: string; ln: string }[] }[] }; id: string; status: string; review_note: string | null; refund_offer_minor: string | null; penalty_minor: string | null; offer_version: string | null; offer_expires_at: string | null; accepted_at: string | null };
// Consent belongs to the exact displayed terms, not merely the request row.
const termsKey = (offer: Offer) => JSON.stringify([offer.id, offer.offer_version, offer.refund_offer_minor, offer.penalty_minor, offer.offer_expires_at, offer.review_note, offer.scope, offer.is_partial]);

export default function CancellationProgress({ bookingId, refreshVersion = 0 }: { bookingId: string; refreshVersion?: number }) {
  const [offers, setOffers] = useState<Offer[]>([]), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [consent, setConsent] = useState<string | null>(null), [recheckRequired, setRecheckRequired] = useState(false);
  const inFlight = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/bookings/${bookingId}/cancellation-offer`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Cancellation updates could not be loaded.");
      if (controller.signal.aborted) return;
      setOffers(data.requests ?? []); setConsent(null); setLoadError(""); setRecheckRequired(false);
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Cancellation updates could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [bookingId, revision, refreshVersion]);
  function refresh() { setConsent(null); setLoading(true); setLoadError(""); setRevision(value => value + 1); }
  async function accept(offer: Offer) {
    if (inFlight.current || loading || loadError || recheckRequired || consent !== termsKey(offer)) return;
    if (!offer.offer_version || !offer.offer_expires_at || !Number.isFinite(Date.parse(offer.offer_expires_at)) || Date.parse(offer.offer_expires_at) <= new Date().getTime()) {
      setConsent(null); setMessage("Cancellation offer expired or changed. Ask operations for a fresh offer, then refresh cancellation progress."); return;
    }
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancellation-offer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerVersion: offer.offer_version }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to accept offer.");
      if (!data || typeof data.message !== "string") throw Error("The acceptance response could not be confirmed.");
      if (!mounted.current) return;
      setMessage(data.message); setRecheckRequired(true); refresh();
    } catch (error) {
      if (!mounted.current) return;
      setRecheckRequired(true); setMessage(`${error instanceof Error ? error.message : "Acceptance could not be confirmed."} Checking the current offer before another acceptance. Travel and refunds are not confirmed by this response.`); refresh();
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="cancellation-progress"><h3>Cancellation progress</h3>
    <button type="button" className="secondary" disabled={loading || busy} onClick={refresh}>Refresh cancellation progress</button>
    {loading && <p role="status" className="muted">Loading cancellation updates…</p>}
    {loadError && <div className="trip-inline-error" role="alert"><p>{loadError}</p><button type="button" className="secondary" disabled={loading || busy} onClick={refresh}>Retry cancellation updates</button></div>}
    {!loading && !loadError && !offers.length && <p className="muted">No cancellation request for this booking.</p>}
    {offers.map(offer => <div key={offer.id}>
      <p>{offer.is_partial ? "Selected passengers / flights" : "Remaining booking"}</p>
      {offer.scope?.trips.map((trip, i) => <p key={i} className="muted">{trip.src} → {trip.dest} · {trip.departureDate} · {trip.travellers.map(person => `${person.fn} ${person.ln}`).join(", ")}</p>)}
      <p><strong>{offer.status.replaceAll("_", " ")}</strong></p>
      {offer.review_note && <p className="muted">{offer.review_note}</p>}
      {offer.refund_offer_minor !== null && <p>Estimated refund: ₹{(Number(offer.refund_offer_minor) / 100).toFixed(2)} · Remaining value / retained charges: ₹{(Number(offer.penalty_minor) / 100).toFixed(2)}</p>}
      {offer.offer_expires_at && <p className="muted">Offer valid until {new Date(offer.offer_expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>}
      {offer.status === "AWAITING_ACCEPTANCE" && !offer.accepted_at && <form key={termsKey(offer)} onSubmit={event => { event.preventDefault(); void accept(offer); }}>
        <label className="checkbox"><input type="checkbox" required checked={consent === termsKey(offer)} disabled={busy || loading || Boolean(loadError) || recheckRequired} onChange={event => setConsent(event.target.checked ? termsKey(offer) : null)} />I accept these cancellation charges and the estimated refund.</label>
        <button className="secondary" disabled={busy || loading || Boolean(loadError) || recheckRequired}>{busy ? "Accepting terms…" : "Accept cancellation terms"}</button>
      </form>}
      {offer.accepted_at && <p className="muted">Terms accepted. Supplier confirmation is required before travel is cancelled.</p>}
    </div>)}
    {message && <p role="status" className="info-message">{message}</p>}
  </section>;
}
