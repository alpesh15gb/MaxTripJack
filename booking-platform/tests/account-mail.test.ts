import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

test("account mail keeps configuration guard, recipient, subject and reset/verification content", async () => {
  const calls: unknown[][] = [];
  const output = await build({ entryPoints: ["src/lib/mail.ts"], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "mail-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^(server-only|\.\/bounded-mail)$/ }, args => ({ path: args.path, namespace: "mock" }));
      plugin.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "server-only" ? "" : "export async function boundedMail(...args){ globalThis.__accountMailTest(...args); }", loader: "js" }));
    } }],
  });
  const globals = globalThis as unknown as { __accountMailTest?: (...args: unknown[]) => void };
  globals.__accountMailTest = (...args) => { calls.push(args); };
  const env = { ...process.env };
  try {
    const compiled = { exports: {} as { sendAccountMail: (to: string, subject: string, url: string) => Promise<void> } };
    new Function("module", "exports", "require", output.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
    delete process.env.SMTP_HOST; delete process.env.MAIL_FROM;
    await assert.rejects(compiled.exports.sendAccountMail("recipient@example.test", "Reset password", "https://example.test/reset"), (error: unknown) => {
      const failure = error as Error & { status: number };
      assert.equal(failure.status, 503);
      assert.equal(failure.message, "Email delivery is temporarily unavailable. Please try again later.");
      assert.doesNotMatch(failure.message, /SMTP|credentials|configuration|provider/i);
      return true;
    });
    assert.equal(calls.length, 0);
    process.env.SMTP_HOST = "smtp.example.test"; process.env.MAIL_FROM = "sender@example.test";
    process.env.SMTP_PORT = "465"; process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "synthetic"; process.env.SMTP_PASSWORD = "synthetic";
    await compiled.exports.sendAccountMail("recipient@example.test", "Reset password", "https://example.test/reset");
    assert.deepEqual(calls[0], [{ host: "smtp.example.test", port: 465, secure: true, auth: { user: "synthetic", pass: "synthetic" } }, {
      from: "sender@example.test", to: "recipient@example.test", subject: "Reset password",
      text: "Reset password\n\nhttps://example.test/reset\n\nIf you did not request this, you can ignore this email.\nMax Travel",
    }]);
  } finally { process.env = env; delete globals.__accountMailTest; }
});
