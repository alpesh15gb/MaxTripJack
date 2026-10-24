import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";

test("actual worker does not start SMTP when shutdown arrives during lease renewal", async () => {
  const key = `__notificationWorker_${randomUUID().replaceAll("-", "")}`;
  const events: string[] = [];
  let attempts = 0;
  const state = {
    async query(sql: string) {
      if (sql.includes("RETURNING *")) {
        events.push("claim");
        return { rows: [{ id: "synthetic-notification", order_id: "synthetic-order", status: "CONFIRMED", attempts }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT reference")) {
        events.push("prepare");
        return { rows: [{ reference: "SYNTHETIC", guests_encrypted: "synthetic" }], rowCount: 1 };
      }
      if (sql.includes("SET attempts=attempts+1,lease_until")) {
        events.push("renew-start");
        // A real async boundary: shutdown occurs before the DB acknowledges a
        // successful reservation, just as it can during a slow network query.
        await new Promise<void>(resolve => setImmediate(() => { process.emit("SIGTERM"); resolve(); }));
        attempts++;
        events.push("renew-committed");
        return { rows: [], rowCount: 1 };
      }
      throw Error(`Unexpected query after shutdown: ${sql}`);
    },
    async end() { events.push("database-end"); },
    async send() { events.push("send"); },
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  globals[key] = state;
  const prefix = `const state=globalThis[${JSON.stringify(key)}];`;
  const mocks: Record<string, string> = {
    "../src/lib/db": `${prefix} export function database(){return state;}`,
    "../src/lib/worker-health": "export async function heartbeat(){}",
    "../src/lib/vault": 'export function unseal(){return {email:"recipient@example.test"};}',
    "../src/lib/mail": `${prefix} export function mailReady(){return true;} export const sendMail=state.send;`,
  };
  const originalUrl = process.env.BETTER_AUTH_URL;
  const originalListeners = new Map((["SIGTERM", "SIGINT"] as const).map(signal => [signal, process.listeners(signal)]));
  const originalError = console.error;
  const logs: unknown[][] = [];
  try {
    process.env.BETTER_AUTH_URL = "https://example.test";
    console.error = (...args: unknown[]) => { logs.push(args); };
    const result = await build({ entryPoints: ["scripts/notification-worker.mts"], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
      plugins: [{ name: "worker-boundaries", setup(plugin) {
        plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "mock" } : undefined);
        plugin.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
        // The delivery controller only needs the constant, not SMTP in this test.
        plugin.onResolve({ filter: /^\.\/bounded-mail$/ }, () => ({ path: "deadline", namespace: "deadline" }));
        plugin.onLoad({ filter: /.*/, namespace: "deadline" }, () => ({ contents: "export const MAIL_DEADLINE_MS=30000;", loader: "js" }));
      } }],
    });
    await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    assert.deepEqual(events, ["claim", "prepare", "renew-start", "renew-committed", "database-end"]);
    assert.equal(attempts, 1, "committed reservation is retained, not uncounted or requeued");
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0][1], { id: "synthetic-notification", outcome: "lease-lost" });
  } finally {
    console.error = originalError;
    if (originalUrl === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = originalUrl;
    for (const [signal, original] of originalListeners) {
      for (const listener of process.listeners(signal)) if (!original.includes(listener)) process.removeListener(signal, listener);
    }
    delete globals[key];
  }
});
