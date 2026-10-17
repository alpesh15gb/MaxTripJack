import test from "node:test";
import assert from "node:assert/strict";
import { contentSecurityPolicy } from "../src/lib/content-security";
test("production scripts require a fresh nonce and forbid inline/eval execution",()=>{const policy=contentSecurityPolicy("abc123");const script=policy.split(";").find(v=>v.trim().startsWith("script-src"))!;assert.ok(script.includes("'nonce-abc123'"));assert.ok(script.includes("'strict-dynamic'"));assert.ok(!script.includes("'unsafe-inline'"));assert.ok(!script.includes("'unsafe-eval'"));assert.ok(policy.includes("frame-ancestors 'none'"));assert.throws(()=>contentSecurityPolicy("bad; policy"));});
