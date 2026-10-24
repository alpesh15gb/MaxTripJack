import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { boundedMail, MAIL_DEADLINE_MS, SMTP_PHASE_TIMEOUT_MS } from "../src/lib/bounded-mail";

type Dependencies = NonNullable<Parameters<typeof boundedMail>[2]>;
function harness() {
  let options: SMTPTransport.Options;
  let expire: () => void = () => {};
  let resolveSend: () => void = () => {};
  let rejectSend: (error: Error) => void = () => {};
  const events: string[] = [];
  const socket = Object.assign(new EventEmitter(), { destroy() { events.push("destroy"); return this; } });
  const deps = {
    createTransport(value: SMTPTransport.Options) {
      options = value;
      return { sendMail() { return new Promise<void>((resolve, reject) => {
        resolveSend = resolve; rejectSend = reject;
        options.getSocket!(options, (err, result) => { if (err) reject(err); else { assert.ok(result); assert.equal(result.connection, socket); assert.equal(result.secured, undefined); events.push("connected"); } });
      }); }, close() { events.push("close"); } };
    },
    connect() { events.push("connect"); return socket as unknown as Socket; },
    setTimeout(callback: () => void, delay: number) { assert.equal(delay, MAIL_DEADLINE_MS); expire = callback; return 1; },
    clearTimeout() { events.push("clearTimer"); },
  } as unknown as Dependencies;
  return { deps, socket, events, expire: () => expire(), resolve: () => resolveSend(), reject: () => rejectSend(Error("SMTP")), options: () => options };
}
for (const secure of [false, true]) {
  test(`SMTP secure=${secure}: retains auth/TLS options and destroys socket on success`, async () => {
    const h = harness(); const auth = { user: "synthetic", pass: "synthetic" };
    const task = boundedMail({ host: "smtp.example.test", port: 587, secure, auth }, { to: "recipient@example.test", text: "synthetic" }, h.deps);
    h.socket.emit("connect"); h.resolve(); await task;
    assert.equal(h.options().secure, secure); assert.deepEqual(h.options().auth, auth);
    assert.equal(h.options().tls, undefined); assert.equal(h.options().ignoreTLS, undefined);
    assert.equal(h.options().socketTimeout, SMTP_PHASE_TIMEOUT_MS);
    assert.deepEqual(h.events, ["connect", "connected", "clearTimer", "destroy", "close"]);
  });
}
test("deadline destroys active socket before rejecting, late success cannot change outcome", async () => {
  const h = harness(); const task = boundedMail({ host: "smtp.example.test", port: 587 }, {}, h.deps);
  h.socket.emit("connect"); h.expire();
  assert.equal(h.events.at(-1), "destroy"); await assert.rejects(task, /may have occurred/);
  h.resolve(); assert.ok(h.events.includes("close"));
});
test("deadline also aborts pending connect/DNS; late connect cannot hand off a socket", async () => {
  const h = harness(); const task = boundedMail({ host: "smtp.example.test", port: 587 }, {}, h.deps);
  h.expire(); await assert.rejects(task); h.socket.emit("connect");
  assert.ok(!h.events.includes("connected"));
});
test("SMTP rejection cleans timer/socket and is not swallowed", async () => {
  const h = harness(); const task = boundedMail({ host: "smtp.example.test", port: 587 }, {}, h.deps);
  h.socket.emit("connect"); h.reject(); await assert.rejects(task, /SMTP/);
  assert.deepEqual(h.events.slice(-3), ["clearTimer", "destroy", "close"]);
});
test("deadline before Nodemailer requests a socket prevents any connection", async () => {
  let options: SMTPTransport.Options;
  let expire = () => {};
  let connections = 0;
  const deps = {
    createTransport(value: SMTPTransport.Options) { options = value; return { sendMail: () => new Promise(() => {}), close() {} }; },
    connect() { connections++; throw Error("must not connect"); },
    setTimeout(callback: () => void) { expire = callback; return 1; }, clearTimeout() {},
  } as unknown as Dependencies;
  const task = boundedMail({ host: "smtp.example.test", port: 587 }, {}, deps);
  expire(); await assert.rejects(task, /deadline/);
  options!.getSocket!(options!, error => assert.match(error!.message, /deadline/));
  assert.equal(connections, 0);
});
test("synchronous socket setup errors reject safely and release transport", async () => {
  const h = harness(); h.deps.connect = (() => { throw Error("invalid port"); }) as Dependencies["connect"];
  await assert.rejects(boundedMail({ host: "smtp.example.test", port: -1 }, {}, h.deps), /invalid port/);
  assert.deepEqual(h.events, ["clearTimer", "close"]);
});
