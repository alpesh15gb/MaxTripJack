import test from "node:test";
import assert from "node:assert/strict";
import { crmDeliveryPayload, type DocumentOmission } from "../src/lib/crm-delivery";

const event = { id: "event", aggregate_id: "order", schema_version: 1, event_type: "booking.updated", created_at: "2026-01-01", delivery_payload: null as string | null };
const snapshot = { reference: "TEST", revision: 7, status: "CONFIRMED", cancellations: [], replacementBookings: [], totalMinor: 10000, payments: [{ amountMinor: 10000, status: "CAPTURED" }] };
function fixture() {
  const omissions: DocumentOmission[] = [];
  const writes: { body: string; revision: number | null }[] = [];
  const dependencies = {
    snapshot: async () => snapshot,
    document: async () => new Response("%PDF-test"),
    revision: async (): Promise<number | undefined> => 7,
    persist: async (body: string, revision: number | null) => { writes.push({ body, revision }); return true; },
    omitted: (reason: DocumentOmission) => { omissions.push(reason); },
  };
  return { omissions, writes, dependencies };
}
test("confirmed snapshot includes bounded current PDF and freezes its revision", async () => {
  const f = fixture(); const result = JSON.parse(await crmDeliveryPayload(event, f.dependencies));
  assert.equal(result.payload.document.base64, Buffer.from("%PDF-test").toString("base64"));
  assert.equal(f.writes[0].revision, 7); assert.deepEqual(result.payload.payments, snapshot.payments);
});
for (const failure of ["throws", "read", "oversize", "non-ok"]) test(`optional PDF ${failure} does not block authoritative financial snapshot`, async () => {
  const f = fixture(); f.dependencies.document = async () => {
    if (failure === "throws") throw Error("private details must not be logged");
    if (failure === "read") return { ok: true, arrayBuffer: async () => { throw Error("stream failed"); } } as unknown as Response;
    return failure === "oversize" ? new Response(new Uint8Array(524289)) : new Response("unavailable", { status: 500 });
  };
  const result = JSON.parse(await crmDeliveryPayload(event, f.dependencies));
  assert.equal(result.payload.document, undefined); assert.equal(f.writes[0].revision, null);
  assert.deepEqual(result.payload.payments, snapshot.payments); assert.equal(f.omissions.length, 1);
});
test("revision race drops PDF and refreshes authoritative snapshot exactly once", async () => {
  const f = fixture(); let reads = 0;
  f.dependencies.snapshot = async () => ({ ...snapshot, revision: ++reads === 1 ? 7 : 9 });
  f.dependencies.revision = async () => 8;
  const result = JSON.parse(await crmDeliveryPayload(event, f.dependencies));
  assert.equal(reads, 2); assert.equal(result.revision, 9); assert.equal(result.payload.document, undefined);
  assert.deepEqual(f.omissions, ["revision_changed"]);
});
test("financial snapshot / revision lookup / refreshed snapshot errors are never suppressed", async () => {
  for (const phase of ["snapshot", "revision", "refresh"]) {
    const f = fixture(); let reads = 0;
    f.dependencies.snapshot = async () => { if (phase === "snapshot" || phase === "refresh" && ++reads > 1) throw Error("financial failure"); return snapshot; };
    f.dependencies.revision = async () => { if (phase === "revision") throw Error("database failure"); return 8; };
    await assert.rejects(crmDeliveryPayload(event, f.dependencies), /failure/); assert.equal(f.writes.length, 0);
  }
});
test("lost lease or further revision change before document freeze fails without delivery", async () => {
  const f = fixture(); f.dependencies.persist = async () => false;
  await assert.rejects(crmDeliveryPayload(event, f.dependencies), /lease lost or booking changed/);
});
test("retry and duplicate delivery reuse frozen exact bytes despite snapshot/render changes", async () => {
  const f = fixture(); f.dependencies.document = async () => { throw Error("PDF failed"); };
  const body = await crmDeliveryPayload(event, f.dependencies);
  for (const name of ["snapshot", "document", "revision", "persist"] as const) f.dependencies[name] = async () => { throw Error("must not regenerate"); };
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(await crmDeliveryPayload({ ...event, delivery_payload: body }, f.dependencies), body);
  assert.equal(f.writes.length, 1);
});
test("pending, cancelled and replaced bookings never attempt a confirmation PDF", async () => {
  for (const change of [{ status: "BOOKING_PENDING" }, { cancellations: [{}] }, { replacementBookings: ["replacement"] }]) {
    const f = fixture();
    const dependencies = { ...f.dependencies, snapshot: async () => ({ ...snapshot, ...change }), document: async (): Promise<Response> => { throw Error("must not render"); } };
    const result = JSON.parse(await crmDeliveryPayload(event, dependencies));
    assert.equal(result.payload.document, undefined); assert.deepEqual(f.omissions, []);
  }
});
