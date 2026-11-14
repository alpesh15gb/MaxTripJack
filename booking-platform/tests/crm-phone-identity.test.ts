import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import * as moduleApi from "node:module";

type Resolve = (specifier: string, context: { parentURL?: string }, next: (specifier: string, context: { parentURL?: string }) => { url: string }) => { url: string; shortCircuit?: boolean };
const registerHooks = (moduleApi as unknown as { registerHooks: (hooks: { resolve: Resolve }) => { deregister: () => void } }).registerHooks;

test("CRM uses real booking contact for a phone account while preserving the account owner ID", async () => {
  const slot = "__maxTravelPhoneSnapshot", root = globalThis as unknown as Record<string, unknown>;
  root[slot] = async (fn: (tx: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => unknown) => fn({ query: async sql => {
    if (sql.startsWith("SELECT o.*,")) return { rows: [{ id: "synthetic-order", quote_id: "synthetic-quote", user_id: "phone-owner", company_id: null,
      customer_name: "Traveller", customer_email: "synthetic@phone.maxtravel.invalid", guests_encrypted: "synthetic-sealed-payload",
      product: "FLIGHT", status: "TICKETED", revision: 1, total_minor: 10000, supplier_minor: 9000, reference: "SYNTHETIC", itinerary_summary: {} }] };
    if (sql.startsWith("SET TRANSACTION") || sql.startsWith("SELECT")) return { rows: [] };
    throw Error("Unexpected database mutation");
  } });
  const parent = fs.realpathSync(tmpdir()), dir = fs.mkdtempSync(path.join(parent, "maxtravel-phone-snapshot-"));
  const fixture = path.join(dir, "fixture.cjs");
  fs.writeFileSync(fixture, `exports.transaction=fn=>globalThis.${slot}(fn);exports.unseal=()=>({email:'booking-contact@example.test',phone:'9876543210',travellers:[]});`);
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: pathToFileURL(path.resolve("node_modules/server-only/empty.js")).href, shortCircuit: true };
    if (["./db", "./vault"].includes(specifier) && context.parentURL?.endsWith("/src/lib/crm-snapshot.ts")) return { url: pathToFileURL(fixture).href, shortCircuit: true };
    return next(specifier, context);
  } });
  try {
    const { crmSnapshot } = await import("../src/lib/crm-snapshot");
    const snapshot = await crmSnapshot("synthetic-order");
    assert.equal(snapshot.customer.email, "booking-contact@example.test");
    assert.equal(snapshot.customer.platformId, "user:phone-owner");
    assert(!JSON.stringify(snapshot).includes("@phone.maxtravel.invalid"));
  } finally {
    hook.deregister(); delete root[slot];
    const actual = fs.realpathSync(dir); assert.equal(path.dirname(actual), parent); assert(path.basename(actual).startsWith("maxtravel-phone-snapshot-"));
    fs.rmSync(actual, { recursive: true, force: true });
  }
});
