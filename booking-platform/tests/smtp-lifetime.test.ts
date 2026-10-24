import test from "node:test";
import assert from "node:assert/strict";
import { createServer, connect, type Socket } from "node:net";
import { TLSSocket, createSecureContext } from "node:tls";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { boundedMail } from "../src/lib/bounded-mail";

// Ephemeral, test-only CA/key. Never used by application code or a real provider.
const dir = mkdtempSync(join(tmpdir(), "synthetic-smtp-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key"), "-out", join(dir, "cert"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
const key = readFileSync(join(dir, "key")), cert = readFileSync(join(dir, "cert"));
rmSync(dir, { recursive: true });
const secureContext = createSecureContext({ key, cert });

for (const secure of [false, true]) {
  for (const stall of [false, true]) {
    test(`real Nodemailer ${secure ? "SMTPS" : "STARTTLS"}, ${stall ? "lost DATA acknowledgement aborts TLS socket" : "accepted send"}`, { timeout: 5000 }, async () => {
      let expire = () => {};
      let encryptedData = false;
      let serverClosed = () => {};
      const closed = new Promise<void>(resolve => { serverClosed = resolve; });
      const sockets = new Set<Socket>();
      function protocol(socket: Socket, encrypted: boolean, greet: boolean) {
        let buffer = "", data = false;
        if (greet) socket.write("220 synthetic.example ESMTP\r\n");
        socket.on("data", onData);
        function onData(chunk: Buffer) {
          buffer += chunk.toString();
          while (buffer.includes("\r\n")) {
            const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            if (data) {
              if (line === ".") {
                encryptedData = encrypted; data = false;
                if (stall) expire(); else socket.write("250 accepted synthetic\r\n");
              }
            } else if (line.startsWith("EHLO")) {
              socket.write(encrypted ? "250 synthetic.example\r\n" : "250-synthetic.example\r\n250 STARTTLS\r\n");
            } else if (line === "STARTTLS") {
              socket.removeListener("data", onData);
              socket.write("220 Ready for TLS\r\n");
              upgrade(socket, false); return;
            } else if (line === "DATA") { data = true; socket.write("354 send data\r\n"); }
            else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) socket.write("250 OK\r\n");
          }
        }
      }
      function upgrade(socket: Socket, greet: boolean) {
        const tls = new TLSSocket(socket, { isServer: true, secureContext });
        sockets.add(tls); tls.on("error", () => {}); tls.on("close", serverClosed);
        tls.once("secure", () => protocol(tls, true, greet));
      }
      const server = createServer(socket => {
        sockets.add(socket); socket.on("error", () => {});
        if (secure) upgrade(socket, true); else protocol(socket, false, true);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = server.address(); assert.ok(address && typeof address !== "string");
        const task = boundedMail({ host: "127.0.0.1", port: address.port, secure,
          tls: { ca: cert, servername: "localhost" } },
        { from: "sender@example.test", to: "recipient@example.test", text: "synthetic" }, {
          createTransport: nodemailer.createTransport, connect,
          setTimeout: ((callback: () => void) => { expire = callback; return setTimeout(callback, 4000); }) as typeof setTimeout,
          clearTimeout,
        });
        if (stall) await assert.rejects(task, /may have occurred/); else await task;
        await closed;
        assert.equal(encryptedData, true, "message was only handled inside actual TLS");
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }
}
test("real Nodemailer retains default certificate rejection on SMTPS", { timeout: 5000 }, async () => {
  let receivedMessage = false;
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    const tls = new TLSSocket(socket, { isServer: true, secureContext }); sockets.add(tls);
    tls.on("error", () => {});
    tls.on("data", () => { receivedMessage = true; });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    await assert.rejects(boundedMail({ host: "127.0.0.1", port: address.port, secure: true },
      { from: "sender@example.test", to: "recipient@example.test", text: "must not send" }), /self.signed certificate/i);
    assert.equal(receivedMessage, false);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
