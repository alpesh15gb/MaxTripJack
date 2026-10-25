import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import nodemailer from 'nodemailer';

// Exercise the public sendMail envelope, not an internal parser export.
// Nodemailer sanitizes angle brackets in SMTP local parts to spaces; the domain must remain recipient.invalid.
const cases = [
  { id: 'GHSA-8c8m-p3m8-cjg8', to: 'Victim (x(y) <evil@attacker.invalid>) <v@recipient.invalid>', expected: 'v@recipient.invalid' },
  { id: 'GHSA-m943-m63m-w62w', to: 'G: (a; <evil@attacker.invalid>) <v@recipient.invalid>;', expected: 'v@recipient.invalid' },
  { id: 'GHSA-85x2-q946-cp5h', to: '<"a@attacker.invalid>"@recipient.invalid>', expected: '"a@attacker.invalid "@recipient.invalid' },
];

for (const fixture of cases) {
  test(`public envelope regression: ${fixture.id}`, async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    try {
      const info = await transport.sendMail({ from: 'sender@example.invalid', to: fixture.to, subject: 'Synthetic regression', text: 'No real customer data.' });
      assert.deepEqual(info.envelope.to, [fixture.expected]);
      assert.equal(info.envelope.from, 'sender@example.invalid');
    } finally { transport.close(); }
  });

  test(`loopback SMTP RCPT regression: ${fixture.id}`, { timeout: 10000 }, async () => {
    const recipients: string[] = [];
    const sockets = new Set<Socket>();
    let receivedData = false;
    const server = createServer(socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {});
      socket.setEncoding('utf8');
      socket.write('220 localhost test SMTP\r\n');
      let buffer = '';
      let data = false;
      socket.on('data', chunk => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (data) {
            if (line === '.') { data = false; receivedData = true; socket.write('250 accepted\r\n'); }
          } else if (/^(EHLO|HELO) /i.test(line)) socket.write('250 localhost\r\n');
          else if (/^MAIL FROM:/i.test(line)) socket.write('250 sender accepted\r\n');
          else if (/^RCPT TO:/i.test(line)) { recipients.push(line); socket.write('250 recipient accepted\r\n'); }
          else if (line === 'DATA') { data = true; socket.write('354 send data\r\n'); }
          else if (line === 'QUIT') socket.end('221 bye\r\n');
          else socket.write('500 unexpected command\r\n');
        }
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const transport = nodemailer.createTransport({ host: '127.0.0.1', port: address.port, secure: false, ignoreTLS: true, connectionTimeout: 3000, socketTimeout: 3000 });
    try {
      const info = await transport.sendMail({ from: 'sender@example.invalid', to: fixture.to, subject: 'Synthetic loopback regression', text: 'No real customer data.' });
      assert.deepEqual(info.envelope.to, [fixture.expected]);
      assert.deepEqual(recipients, [`RCPT TO:<${fixture.expected}>`]);
      assert.equal(receivedData, true);
    } finally {
      transport.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
