import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";

type Transport = typeof import("../src/lib/whatsapp");
const transport = build({ entryPoints: ["src/lib/whatsapp.ts"], bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{ name: "server-boundary", setup(plugin) {
    plugin.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "", loader: "js" }));
  } }],
}).then(output => { const compiled = { exports: {} as Transport }; new Function("module", "exports", output.outputFiles[0].text)(compiled, compiled.exports); return compiled.exports; });

const phone = "+919876543210", code = "123456", apiKey = "synthetic-private-api-key";
const diagnostic = (fields: Record<string, unknown>) => ["WhatsApp transport", JSON.stringify(fields)];
function configured() {
  const before = { ...process.env };
  Object.assign(process.env, { EVOLUTION_API_URL: "http://evolution_api:8080/", EVOLUTION_API_KEY: apiKey, EVOLUTION_INSTANCE: "maxtravel-test" });
  return () => { for (const name of ["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE"]) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; } };
}
async function withServer(handler: RequestListener, run: (url: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("WhatsApp configuration is server-only, explicit and rejects credential/query URLs before I/O", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const { whatsappReady, sendWhatsAppCode } = await transport;
  const restore = configured(); let calls = 0;
  try {
    assert.equal(whatsappReady(), true);
    const original = process.env.EVOLUTION_API_URL;
    for (const invalid of ["", "not-a-url", "ftp://example.test", "https://user:secret@example.test", "https://example.test?apikey=secret", "https://example.test/#fragment"]) {
      process.env.EVOLUTION_API_URL = invalid;
      assert.equal(whatsappReady(), false);
      await assert.rejects(sendWhatsAppCode(phone, code, { fetch: async () => { calls++; return Response.json({}); } }), { outcome: "unavailable" });
    }
    process.env.EVOLUTION_API_URL = original;
    for (const invalid of ["", ".", "..", "../other-instance", "instance/other", "instance\\other", " instance?key=value ", "instance#fragment", "instance\nother", "a".repeat(129)]) { process.env.EVOLUTION_INSTANCE = invalid; assert.equal(whatsappReady(), false, JSON.stringify(invalid)); }
    assert.equal(calls, 0);
    assert.equal(logged.mock.callCount(), 6);
    for (const call of logged.mock.calls) assert.deepEqual(call.arguments, diagnostic({ operation: "send", outcome: "unavailable", reason: "configuration", httpStatus: null }));
  } finally { restore(); }
});

test("Evolution instance names preserve spaces and Unicode as one encoded URL segment", async () => {
  const { whatsappReady, sendWhatsAppCode, whatsappConnectionReady } = await transport;
  const restore = configured();
  try {
    for (const instance of ["Apex Integrations", "Travel सेवा", "Travel %2F name"]) {
      process.env.EVOLUTION_INSTANCE = instance;
      assert.equal(whatsappReady(), true);
      const calls: string[] = [];
      const fetch: typeof globalThis.fetch = async input => {
        calls.push(String(input));
        return String(input).includes("/sendText/") ? Response.json({ key: { id: "synthetic-message" }, status: "PENDING" }) : Response.json({ instance: { state: "open" } });
      };
      await sendWhatsAppCode(phone, code, { fetch });
      assert.equal(await whatsappConnectionReady({ fetch }), true);
      assert.deepEqual(calls, [`http://evolution_api:8080/message/sendText/${encodeURIComponent(instance)}`, `http://evolution_api:8080/instance/connectionState/${encodeURIComponent(instance)}`]);
    }
  } finally { restore(); }
});

test("Evolution v2 receives one bounded send with country code, six digits and private API header", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const { sendWhatsAppCode } = await transport;
  const restore = configured(); let calls = 0;
  try {
    await sendWhatsAppCode(phone, code, { fetch: async (input, init) => {
      calls++; assert.equal(input, "http://evolution_api:8080/message/sendText/maxtravel-test");
      assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
      assert.equal(new Headers(init?.headers).get("apikey"), apiKey);
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body).sort(), ["linkPreview", "number", "text"]);
      assert.equal(body.number, phone.slice(1)); assert.equal(body.linkPreview, false);
      assert.match(body.text, /123456/); assert.match(body.text, /5 minutes/);
      assert.ok(init?.signal);
      return Response.json({ key: { id: "synthetic-message", fromMe: true }, status: "PENDING" }, { status: 201 });
    } });
    assert.equal(calls, 1, "an acknowledgement never triggers a second send or delivery check");
    assert.equal(logged.mock.callCount(), 0, "successful requests are not logged");
    for (const [number, otp] of [["919876543210", code], [phone + "@g.us", code], [phone, "not-a-code"]]) await assert.rejects(sendWhatsAppCode(number, otp, { fetch: async () => { calls++; return Response.json({}); } }), { outcome: "unavailable" });
    assert.equal(calls, 1);
    assert.equal(logged.mock.callCount(), 3);
    for (const call of logged.mock.calls) assert.deepEqual(call.arguments, diagnostic({ operation: "send", outcome: "unavailable", reason: "input", httpStatus: null }));
  } finally { restore(); }
});

test("provider failures log one sanitized diagnostic with bounded status and are never retried", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const { sendWhatsAppCode, WhatsAppDeliveryError } = await transport;
  const restore = configured();
  const cases = [
    ...[400, 401, 403, 404, 429, 500].map(status => ({ response: () => Response.json({ error: `${phone} ${code} ${apiKey}` }, { status }), outcome: status >= 500 ? "unconfirmed" : "rejected", reason: "provider-http", httpStatus: status })),
    { response: () => Response.json({ success: true }), outcome: "unconfirmed", reason: "acknowledgement", httpStatus: 200 },
    { response: () => Response.json({ key: { id: "fixture" }, status: "ERROR" }), outcome: "unconfirmed", reason: "acknowledgement", httpStatus: 200 },
    { response: () => Response.json({ key: { id: "fixture" }, success: false }), outcome: "unconfirmed", reason: "acknowledgement", httpStatus: 200 },
    { response: () => new Response("not-json", { headers: { "content-type": "application/json" } }), outcome: "unconfirmed", reason: "response", httpStatus: 200 },
    { response: () => Response.json({ value: "x".repeat(33_000) }), outcome: "unconfirmed", reason: "response", httpStatus: 200 },
    { response: () => Response.json({}, { headers: { "content-length": "9999999" } }), outcome: "unconfirmed", reason: "response", httpStatus: 200 },
    { response: () => { throw Error(`network ${phone} ${code} ${apiKey}`); }, outcome: "unconfirmed", reason: "transport", httpStatus: null },
  ];
  try {
    for (const sample of cases) {
      let calls = 0;
      const previousLogs = logged.mock.callCount();
      await assert.rejects(sendWhatsAppCode(phone, code, { fetch: async () => { calls++; return sample.response(); } }), error => {
        assert.ok(error instanceof WhatsAppDeliveryError); assert.equal(error.outcome, sample.outcome);
        assert.equal(error.reason, sample.reason); assert.equal(error.httpStatus, sample.httpStatus);
        assert.doesNotMatch(error.message, /9876543210|123456|synthetic-private|network|9999999/); return true;
      });
      assert.equal(calls, 1);
      assert.equal(logged.mock.callCount(), previousLogs + 1, "each failure logs once, including invalid acknowledgements");
      assert.deepEqual(logged.mock.calls.at(-1)!.arguments, diagnostic({ operation: "send", outcome: sample.outcome, reason: sample.reason, httpStatus: sample.httpStatus }));
    }
    assert.doesNotMatch(JSON.stringify(logged.mock.calls.map(call => call.arguments)), /9876543210|123456|synthetic-private|not-json|9999999|fixture|https?:\/\/|maxtravel-test/);
  } finally { restore(); }
});

test("real HTTP redirect cannot forward the Evolution credential or issue another message", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const { sendWhatsAppCode } = await transport;
  const restore = configured(); let sends = 0, followed = 0;
  try {
    await withServer((request, response) => { if (request.url === "/leak") { followed++; response.end(); } else { sends++; response.writeHead(307, { location: "/leak" }).end(); } }, async url => {
      process.env.EVOLUTION_API_URL = url;
      await assert.rejects(sendWhatsAppCode(phone, code), { outcome: "unconfirmed" });
      assert.equal(sends, 1); assert.equal(followed, 0);
      assert.deepEqual(logged.mock.calls.map(call => call.arguments), [diagnostic({ operation: "send", outcome: "unconfirmed", reason: "transport", httpStatus: null })]);
    });
  } finally { restore(); }
});

for (const partialBody of [false, true]) test(`real HTTP ${partialBody ? "body" : "header"} stall aborts once and remains delivery-unknown`, async t => {
  const logged = t.mock.method(console, "error", () => {});
  const { sendWhatsAppCode } = await transport;
  const restore = configured(); let sends = 0;
  try {
    await withServer((_request, response) => { sends++; if (partialBody) { response.writeHead(200, { "content-type": "application/json" }); response.write('{"key":'); } }, async url => {
      process.env.EVOLUTION_API_URL = url;
      const start = Date.now();
      await assert.rejects(sendWhatsAppCode(phone, code, { timeoutMs: 80 }), { outcome: "unconfirmed" });
      assert.equal(sends, 1); assert.ok(Date.now() - start < 1500, "both connection and response body obey one deadline");
      assert.deepEqual(logged.mock.calls.map(call => call.arguments), [diagnostic({ operation: "send", outcome: "unconfirmed", reason: "timeout", httpStatus: partialBody ? 200 : null })]);
    });
  } finally { restore(); }
});

test("connection failures identify only the operation and metadata cannot contain raw values", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const { whatsappConnectionReady, WhatsAppDeliveryError } = await transport;
  const restore = configured();
  try {
    await assert.rejects(whatsappConnectionReady({ fetch: async () => Response.json({ error: `${phone} ${code} ${apiKey}` }, { status: 404 }) }), { outcome: "rejected", reason: "provider-http", httpStatus: 404 });
    assert.deepEqual(logged.mock.calls.map(call => call.arguments), [diagnostic({ operation: "connection", outcome: "rejected", reason: "provider-http", httpStatus: 404 })]);
    for (const httpStatus of [NaN, Infinity, -1, 0, 99, 600, 200.5]) {
      const error = new WhatsAppDeliveryError("unconfirmed", { reason: apiKey as never, httpStatus });
      assert.equal(error.reason, "transport"); assert.equal(error.httpStatus, null);
      assert.doesNotMatch(JSON.stringify(error), /synthetic-private/);
    }
  } finally { restore(); }
});

test("connection probe is read-only and open is the only ready state", async () => {
  const { whatsappConnectionReady } = await transport;
  const restore = configured();
  try {
    for (const state of ["open", "close", "connecting", undefined]) {
      const ready = await whatsappConnectionReady({ fetch: async (input, init) => {
        assert.equal(input, "http://evolution_api:8080/instance/connectionState/maxtravel-test");
        assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined);
        return Response.json({ instance: { instanceName: "maxtravel-test", state } });
      } });
      assert.equal(ready, state === "open");
    }
  } finally { restore(); }
});
