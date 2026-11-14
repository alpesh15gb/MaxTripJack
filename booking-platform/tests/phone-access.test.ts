import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("verified phone authorizes customer bookings but preserves email, MFA, company and staff restrictions", async () => {
  const output = await build({ entryPoints: ["src/lib/access.ts"], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "isolated-access", setup(plugin) {
      plugin.onResolve({ filter: /^(server-only|\.\/(auth|db|http|request-limit|crm-command-context))$/ }, args => ({ path: args.path, namespace: "access-fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "access-fixture" }, args => ({ loader: "js", contents:
        args.path === "./auth" ? "export function getAuth(){return {api:{getSession:async()=>__fixture.session}};}" :
        args.path === "./db" ? "export function database(){return {query:async sql=>__fixture.query(sql)};}" :
        args.path === "./http" ? "export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}" :
        args.path === "./request-limit" ? "export async function requestLimit(){}" :
        args.path === "./crm-command-context" ? "export const crmCommandContext={getStore:()=>undefined};" : "" }));
    } }] });
  const fixture = {
    session: { user: { id: "customer", email: "opaque@phone.maxtravel.invalid", emailVerified: false, phoneNumber: "+919876543210", phoneNumberVerified: true, twoFactorEnabled: true } },
    account: null as null | { company_id: string | null; active: boolean },
    query(sql: string) {
      const rows = sql.includes("SELECT company_id") ? this.account ? [this.account] : [] : sql.includes("FROM companies") ? [{ id: "company" }] : [{ permissions: ["bookings:read"] }];
      return { rows, rowCount: rows.length };
    },
  };
  type Access = { principal(request: Request): Promise<{ userId: string }>; administrator(request: Request, permission: string): Promise<unknown>; operationsAccess(request: Request): Promise<unknown> };
  const compiled = { exports: {} as Access };
  new Function("module", "exports", "__fixture", output.outputFiles[0].text)(compiled, compiled.exports, fixture);
  const request = new Request("https://checkout.example.test/api/bookings");
  assert.equal((await compiled.exports.principal(request)).userId, "customer");
  await assert.rejects(compiled.exports.administrator(request, "bookings:read"), { status: 403 });
  await assert.rejects(compiled.exports.operationsAccess(request), { status: 403 });
  fixture.session.user.emailVerified = true;
  await assert.rejects(compiled.exports.administrator(request, "bookings:read"), { status: 403 }, "an internal alias is never a verified staff email");
  fixture.account = { company_id: "company", active: true };
  await assert.rejects(compiled.exports.principal(request), { status: 403 });
  fixture.session.user.email = "verified@example.test";
  assert.equal((await compiled.exports.principal(request)).userId, "customer");
  await compiled.exports.administrator(request, "bookings:read");
  fixture.session.user.twoFactorEnabled = false;
  await assert.rejects(compiled.exports.principal(request), { status: 403 });
  fixture.account = { company_id: null, active: false };
  await assert.rejects(compiled.exports.principal(request), { status: 403 });
  fixture.account = null; fixture.session.user.emailVerified = false; fixture.session.user.phoneNumberVerified = false;
  await assert.rejects(compiled.exports.principal(request), { status: 403 });
});
