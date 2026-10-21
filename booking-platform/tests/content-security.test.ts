import test from "node:test";
import assert from "node:assert/strict";
import { contentSecurityPolicy } from "../src/lib/content-security";
test("production scripts require a fresh nonce and forbid inline/eval execution",()=>{const policy=contentSecurityPolicy("abc123");const script=policy.split(";").find(v=>v.trim().startsWith("script-src"))!;assert.ok(script.includes("'nonce-abc123'"));assert.ok(script.includes("'strict-dynamic'"));assert.ok(!script.includes("'unsafe-inline'"));assert.ok(!script.includes("'unsafe-eval'"));assert.ok(policy.includes("frame-ancestors 'none'"));assert.throws(()=>contentSecurityPolicy("bad; policy"));});

test('supplier property photos are scoped to image path without granting scripts or connections',()=>{
 const directives=contentSecurityPolicy('abc123').split('; ');
 assert.ok(directives.find(value=>value.startsWith('img-src '))?.includes('https://pix8.agoda.net/hotelImages/'));
 for(const directive of directives.filter(value=>!value.startsWith('img-src ')))assert.ok(!directive.includes('agoda'));
 assert.ok(!directives.join(';').includes('*.agoda'));
});


test('observed TravelAPI photos grant only the exact image path, not scripts or fetch',()=>{
 const directives=contentSecurityPolicy('abc123').split('; ');
 const image=directives.find(value=>value.startsWith('img-src '))!;
 assert.ok(image.split(' ').includes('https://i.travelapi.com/lodging/'));
 for(const directive of directives.filter(value=>!value.startsWith('img-src ')))assert.ok(!directive.includes('travelapi'));
 assert.ok(!directives.join(';').includes('*.travelapi'));
 assert.ok(!image.split(' ').includes('https://i.travelapi.com'));
});
