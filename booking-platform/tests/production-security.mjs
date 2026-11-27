import assert from "node:assert/strict";
const base = new URL(process.env.SECURITY_TEST_URL || "http://127.0.0.1:3109");
if (!["127.0.0.1", "localhost"].includes(base.hostname) || base.username || base.password) {
  throw Error("Use the local production image for this test.");
}
const readBooking = () => fetch(new URL("/book", base), {
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
});
const first = await readBooking();
assert.equal(first.status, 200);
const policy = first.headers.get("content-security-policy");
assert.ok(policy);
const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
assert.ok(nonce);
assert.ok(!policy.includes("'unsafe-eval'"));
const html = await first.text();
const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
assert.ok(scripts.length > 0);
for (const script of scripts) {
  assert.ok(script[1].includes(`nonce="${nonce}"`), "Every initial script must have the document nonce");
}
const second = await readBooking();
assert.equal(second.status, 200);
assert.notEqual(second.headers.get("content-security-policy"), policy);
await second.body?.cancel();
assert.equal(first.headers.get("strict-transport-security"), "max-age=31536000");
assert.equal(first.headers.get("x-frame-options"), "DENY");
assert.equal(first.headers.get("x-content-type-options"), "nosniff");
assert.ok(first.headers.get("cache-control")?.includes("no-store"));
console.log("PASS: production HTML uses a fresh CSP nonce, HSTS, frame protection and private cache controls.");
