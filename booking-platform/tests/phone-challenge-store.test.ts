import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { linkWhatsAppAccount, postgresPhoneChallengeStore } from "../src/lib/phone-challenge-store";

// Execute the store's actual parameterised statements against an isolated SQL
// engine. Production uses PostgreSQL; no production database is contacted.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => {
  exec(sql: string): void; close(): void; function(name: string, fn: () => string): void;
  prepare(sql: string): { all(values?: Record<string, unknown>): Record<string, unknown>[] };
} };
function databaseFixture() {
  const db = new DatabaseSync(":memory:");
  let now = new Date("2030-01-01T00:00:00Z");
  db.function("now", () => now.toISOString());
  db.exec(`CREATE TABLE auth_phone_challenges(identifier TEXT PRIMARY KEY,code_hash TEXT NOT NULL,purpose TEXT NOT NULL,binding TEXT,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed_at TEXT);
    CREATE TABLE "user"(id TEXT PRIMARY KEY,email TEXT,"emailVerified" BOOLEAN,"phoneNumber" TEXT UNIQUE,"phoneNumberVerified" BOOLEAN,"updatedAt" TEXT);
    INSERT INTO "user"(id,email,"emailVerified") VALUES('one','one@example.test',true),('two','two@example.test',true),('unverified','three@example.test',false),('alias','opaque@phone.maxtravel.invalid',true);`);
  const query = async (sql: string, values: unknown[]) => {
    try {
      const rows = db.prepare(sql).all(Object.fromEntries(values.map((value, index) => [String(index + 1), value instanceof Date ? value.toISOString() : value])));
      return { rows: rows.map(row => ({ valid: row.valid === 1 })) };
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint/.test(error.message)) throw Object.assign(Error("Synthetic unique conflict"), { code: "23505" });
      throw error;
    }
  };
  return { db, query, advance: (seconds: number) => { now = new Date(now.getTime() + seconds * 1000); } };
}
const challenge = { identifier: "a".repeat(64), codeHash: "b".repeat(64), purpose: "signin" as const, binding: null, expiresAt: new Date("2030-01-01T00:05:00Z") };

test("SQL challenge consumption is single-use under competing calls and enforces expiry, rotation and attempt budget", async () => {
  const fixture = databaseFixture(); const store = postgresPhoneChallengeStore(fixture.query);
  try {
    await store.issue(challenge);
    assert.deepEqual((await Promise.all([store.consume(challenge), store.consume(challenge)])).sort(), [false, true]);
    await store.issue(challenge);
    for (let i = 0; i < 5; i++) assert.equal(await store.consume({ ...challenge, codeHash: "c".repeat(64) }), false);
    assert.equal(await store.consume(challenge), false);
    await store.issue({ ...challenge, codeHash: "d".repeat(64) });
    assert.equal(await store.consume(challenge), false);
    assert.equal(await store.consume({ ...challenge, codeHash: "d".repeat(64) }), true);
    await store.issue(challenge); fixture.advance(301);
    assert.equal(await store.consume(challenge), false);
  } finally { fixture.db.close(); }
});

test("SQL challenge binds account and purpose; stale delivery rejection cannot delete a newer code", async () => {
  const fixture = databaseFixture(); const store = postgresPhoneChallengeStore(fixture.query);
  try {
    const linked = { ...challenge, purpose: "link" as const, binding: "e".repeat(64) };
    await store.issue(linked);
    assert.equal(await store.consume({ ...linked, binding: "f".repeat(64) }), false);
    assert.equal(await store.consume({ ...linked, purpose: "signin", binding: null }), false);
    await store.invalidate(linked.identifier, "c".repeat(64));
    assert.equal(await store.consume(linked), true);
    await store.issue(linked); await store.invalidate(linked.identifier, linked.codeHash);
    assert.equal(await store.consume(linked), false);
  } finally { fixture.db.close(); }
});

test("SQL phone linking cannot overwrite an existing claim or bind an unverified/internal email account", async () => {
  const fixture = databaseFixture();
  try {
    const first = "+919876543210", second = "+919876543211";
    assert.deepEqual((await Promise.all([linkWhatsAppAccount(fixture.query, "one", first), linkWhatsAppAccount(fixture.query, "one", second)])).sort(), [false, true]);
    assert.equal(await linkWhatsAppAccount(fixture.query, "two", first), false);
    assert.equal(await linkWhatsAppAccount(fixture.query, "unverified", second), false);
    assert.equal(await linkWhatsAppAccount(fixture.query, "alias", second), false);
    assert.equal(await linkWhatsAppAccount(fixture.query, "two", second), true);
  } finally { fixture.db.close(); }
});
