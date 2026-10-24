import { createHash } from "node:crypto";

type Snapshot = {
  reference: string;
  revision: number;
  status: string;
  cancellations: unknown[];
  replacementBookings: unknown[];
};
type Event = {
  id: string;
  aggregate_id: string;
  schema_version: number;
  event_type: string;
  created_at: unknown;
  delivery_payload: string | null;
};
export type DocumentOmission = "generation_failed" | "transport_limit" | "revision_changed";

// The snapshot is authoritative; the PDF is best effort. Once frozen, an event
// must never be regenerated: the receiver binds its ID to the exact body hash.
// The current receiver cannot backfill a document at an already applied revision.
export async function crmDeliveryPayload<S extends Snapshot>(event: Event, dependencies: {
  snapshot: (id: string) => Promise<S>;
  document: (id: string) => Promise<Response>;
  revision: (id: string) => Promise<number | undefined>;
  persist: (body: string, documentRevision: number | null) => Promise<boolean>;
  omitted: (reason: DocumentOmission) => void;
}): Promise<string> {
  if (event.delivery_payload) return event.delivery_payload;
  let snapshot = await dependencies.snapshot(event.aggregate_id);
  let document: { filename: string; sha256: string; base64: string } | undefined;
  if (["TICKETED", "CONFIRMED"].includes(snapshot.status) && !snapshot.cancellations.length && !snapshot.replacementBookings.length) {
    let bytes: Buffer | undefined;
    try {
      const response = await dependencies.document(event.aggregate_id);
      if (!response.ok) throw new Error("Document unavailable");
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      dependencies.omitted("generation_failed");
    }
    if (bytes && bytes.length > 524288) {
      dependencies.omitted("transport_limit");
      bytes = undefined;
    }
    // Database/snapshot failures are deliberately outside the optional PDF catch.
    const revision = await dependencies.revision(event.aggregate_id);
    if (revision !== snapshot.revision) {
      dependencies.omitted("revision_changed");
      snapshot = await dependencies.snapshot(event.aggregate_id);
    } else if (bytes) {
      document = { filename: `${snapshot.reference}.pdf`, sha256: createHash("sha256").update(bytes).digest("hex"), base64: bytes.toString("base64") };
    }
  }
  const body = JSON.stringify({ schemaVersion: event.schema_version, eventId: event.id, eventType: event.event_type, aggregateId: event.aggregate_id, occurredAt: event.created_at, revision: snapshot.revision, payload: { ...snapshot, ...(document ? { document } : {}) } });
  // A document's revision must still match when persisted, not just after render.
  if (!await dependencies.persist(body, document ? snapshot.revision : null)) throw new Error("Delivery lease lost or booking changed before freeze");
  return body;
}
