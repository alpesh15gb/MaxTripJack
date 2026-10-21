import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

test("production worker imports resolve in plain Node without the tsx loader", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "./scripts/standalone-server.mjs",
    "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import "server-only";
      import { z } from "zod";
      import { Pool } from "pg";
      import { unstable_rethrow, redirect } from "next/navigation";
      assert.equal(typeof z.object, "function");
      assert.equal(typeof Pool, "function");
      assert.equal(typeof unstable_rethrow, "function");
      unstable_rethrow(new Error("ordinary application error"));
      let signal;
      try { redirect("/account"); } catch (error) { signal = error; }
      assert.ok(signal);
      assert.throws(() => unstable_rethrow(signal), error => error === signal);
    `,
  ], {
    cwd: process.cwd(), encoding: "utf8", timeout: 15000,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test("bundled catalogue sync reaches intercepted fetch without network or database writes", () => {
  const directory = mkdtempSync(join(process.cwd(), ".worker-smoke-"));
  try {
    const outfile = join(directory, "sync-catalogue.mjs");
    buildSync({ entryPoints: ["scripts/sync-catalogue.mts"], outfile,
      bundle: true, platform: "node", format: "esm", packages: "external" });
    const result = spawnSync(process.execPath, [
      "--conditions=react-server", "--import", "./scripts/standalone-server.mjs",
      "--input-type=module", "-e", `
        import assert from "node:assert/strict";
        import { Pool } from "pg";
        let fetches = 0, connections = 0;
        Pool.prototype.connect = function () { connections++; throw Error("DB prohibited"); };
        globalThis.fetch = async (url, options) => {
          fetches++;
          assert.equal(url, "https://apitest-hms.tripjack.com/hms/v3/content/fetch-city-regionIds?limit=2000");
          assert.equal(options.method, "GET");
          assert.equal(options.redirect, "error");
          throw Error("Network deliberately intercepted");
        };
        await assert.rejects(import(${JSON.stringify(pathToFileURL(outfile).href)}),
          error => error.status === 502);
        assert.equal(fetches, 1);
        assert.equal(connections, 0);
      `,
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 15000,
      env: { ...process.env, NODE_OPTIONS: "", TRIPJACK_HOTEL_API_KEY: "synthetic-test-only",
        DATABASE_URL: "postgresql://127.0.0.1:1/not-used" } });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
