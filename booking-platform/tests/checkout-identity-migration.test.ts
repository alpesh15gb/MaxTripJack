import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { migrationDatabaseURL, migrateCheckoutIdentity, grantCheckoutRuntimeAccess } from "../scripts/migrate-checkout-identity.mjs";

const fixture = () => ({
  DATABASE_URL: "postgresql://maxtravel_app:old-runtime-secret@postgres:5432/maxtravel?sslmode=require&user=runtime-query-user&password=runtime-query-secret",
  POSTGRES_USER: "database-owner@example", POSTGRES_PASSWORD: "synthetic:/@?#% password'\"",
  BETTER_AUTH_SECRET: "synthetic-auth-secret-at-least-thirty-two-characters",
});

test("migration owner credentials preserve database target and URL-encode punctuation without changing input environment", () => {
  const environment = fixture(), original = { ...environment };
  const url = new URL(migrationDatabaseURL(environment));
  assert.equal(url.hostname, "postgres"); assert.equal(url.port, "5432"); assert.equal(url.pathname, "/maxtravel");
  assert.equal(decodeURIComponent(url.username), environment.POSTGRES_USER);
  assert.equal(decodeURIComponent(url.password), environment.POSTGRES_PASSWORD);
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.has("user"), false); assert.equal(url.searchParams.has("password"), false);
  assert.deepEqual(environment, original);
});

test("explicit migration URL takes precedence and invalid configuration fails without exposing its value", () => {
  const explicit = "postgresql://owner:synthetic-explicit-secret@migration-db:5433/maxtravel?sslmode=require";
  assert.equal(migrationDatabaseURL({ MIGRATION_DATABASE_URL: explicit }), explicit);
  assert.equal(migrationDatabaseURL({ ...fixture(), MIGRATION_DATABASE_URL: explicit }), explicit);
  for (const environment of [
    {}, { ...fixture(), POSTGRES_PASSWORD: "" }, { ...fixture(), POSTGRES_USER: "" },
    { ...fixture(), DATABASE_URL: "https://owner:private-secret@example.test/maxtravel" },
    { ...fixture(), DATABASE_URL: "postgresql://owner:private-secret@postgres" },
    { ...fixture(), MIGRATION_DATABASE_URL: "not-a-url-private-secret" },
    { ...fixture(), MIGRATION_DATABASE_URL: "postgresql://owner:private-secret@postgres/maxtravel#fragment" },
  ]) assert.throws(() => migrationDatabaseURL(environment), error => {
    assert.ok(error instanceof Error); assert.equal(error.message, "Migration database configuration is missing or invalid.");
    assert.doesNotMatch(error.message, /private-secret|synthetic|postgresql|password/); return true;
  });
});

test("migration runs booking, authentication, then grants with a private cloned environment", async () => {
  const environment = fixture(), original = { ...environment }, calls: string[] = [], reports: string[] = [];
  const expected = migrationDatabaseURL(environment);
  const result = await migrateCheckoutIdentity({ environment, runScript(script, passed) {
    calls.push(script.pathname.endsWith("/scripts/migrate.mjs") ? "booking" : script.pathname.endsWith("/dist/migrate-auth.mjs") ? "auth" : "unexpected");
    assert.notEqual(passed, environment); assert.equal(passed.MIGRATION_DATABASE_URL, expected);
    assert.equal(passed.POSTGRES_PASSWORD, undefined); assert.equal(passed.POSTGRES_USER, undefined);
    return { status: 0, stdout: "private-secret", stderr: "private-secret" };
  }, async grantAccess(url) { assert.equal(url, expected); calls.push("grant"); }, report: message => reports.push(message), reportError: message => reports.push(message) });
  assert.equal(result, 0); assert.deepEqual(calls, ["booking", "auth", "grant"]); assert.deepEqual(environment, original);
  assert.doesNotMatch(reports.join("\n"), /private-secret|synthetic|postgresql|database-owner/);
  assert.match(reports.at(-1)!, /completed/);
});

for (const failure of ["configuration", "booking", "authentication", "grant"] as const) test(`migration stops at ${failure} failure and never prints raw child/database errors`, async () => {
  const environment = fixture(), calls: string[] = [], reports: string[] = [];
  if (failure === "configuration") environment.BETTER_AUTH_SECRET = "";
  const result = await migrateCheckoutIdentity({ environment, runScript(script) {
    const stage = script.pathname.endsWith("/scripts/migrate.mjs") ? "booking" : "authentication"; calls.push(stage);
    return stage === failure ? { status: 1, error: Error("private-secret postgres://owner:password@host/db") } : { status: 0 };
  }, async grantAccess() { calls.push("grant"); if (failure === "grant") throw Error("private-secret postgres://owner:password@host/db"); }, report: message => reports.push(message), reportError: message => reports.push(message) });
  assert.equal(result, 1);
  assert.deepEqual(calls, failure === "configuration" ? [] : failure === "booking" ? ["booking"] : failure === "authentication" ? ["booking", "authentication"] : ["booking", "authentication", "grant"]);
  assert.doesNotMatch(reports.join("\n"), /private-secret|postgres:|synthetic|owner:|password@/);
  assert.match(reports.at(-1)!, /failed.*Deployment stopped/);
});

test("runtime grant is conditional and cannot provision a role or reset its password", async () => {
  const statements: string[] = []; let ended = 0;
  await grantCheckoutRuntimeAccess("synthetic-connection-not-used", () => ({ async query(sql) { statements.push(sql); }, async end() { ended++; } }));
  assert.equal(statements.length, 1); assert.match(statements[0], /IF EXISTS[\s\S]*pg_roles[\s\S]*maxtravel_app/);
  assert.match(statements[0], /GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public\.auth_phone_challenges TO maxtravel_app/);
  assert.doesNotMatch(statements[0], /CREATE ROLE|ALTER ROLE|PASSWORD|UPDATE "user"|DELETE FROM/i); assert.equal(ended, 1);
  await assert.rejects(grantCheckoutRuntimeAccess("synthetic-connection-not-used", () => ({ async query() { throw Error("synthetic database failure"); }, async end() { ended++; } })));
  assert.equal(ended, 2);
});

test("standalone helper exits nonzero on missing configuration without attempting a database connection", () => {
  const result = spawnSync(process.execPath, ["scripts/migrate-checkout-identity.mjs"], { cwd: process.cwd(), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, DATABASE_URL: "postgresql://private-secret:private-secret@127.0.0.1:1/not-used", MIGRATION_DATABASE_URL: "", POSTGRES_USER: "", POSTGRES_PASSWORD: "", BETTER_AUTH_SECRET: fixture().BETTER_AUTH_SECRET } });
  assert.equal(result.error, undefined); assert.equal(result.status, 1);
  assert.match(result.stderr, /configuration failed/); assert.doesNotMatch(result.stdout + result.stderr, /private-secret|127\.0\.0\.1|postgresql|ECONNREFUSED|Error:/);
});
